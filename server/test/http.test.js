import test from 'node:test'
import assert from 'node:assert/strict'
import { startTestRelay, TEST_PNG } from './helpers.js'

test('anonymous requests fail before their image body is accepted', async t => {
  const relay = await startTestRelay(t)
  const response = await fetch(`${relay.url}/v1/image-jobs`, { method: 'POST', body: 'not multipart' })
  assert.equal(response.status, 401)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(relay.providerCalls(), 0)
})

test('capabilities disclose only fixed service choices, quota and server time', async t => {
  const relay = await startTestRelay(t)
  const response = await fetch(`${relay.url}/v1/image-capabilities`, {
    headers: { Authorization: 'Bearer owner-token', Origin: 'https://sable.example' },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://sable.example')
  assert.equal(response.headers.get('access-control-allow-credentials'), null)
  const body = await response.json()
  assert.deepEqual({ ...body, serverTime: 0 }, {
    enabled: true, operations: ['refine'], provider: 'openai', profile: relay.config.profile,
    quota: { active: 0, dailyRemaining: 10 }, serverTime: 0,
  })
  assert.ok(Math.abs(body.serverTime - relay.now()) < 1000)
})

test('accepted jobs can be listed, inspected, downloaded and acknowledged repeatably', async t => {
  const relay = await startTestRelay(t)
  const submitted = await relay.submit()
  assert.equal(submitted.response.status, 202)
  assert.equal(submitted.response.headers.get('cache-control'), 'no-store')
  assert.equal(submitted.body.state, 'accepted')
  assert.equal(Object.hasOwn(submitted.body, 'ownerId'), false)
  assert.equal(Object.hasOwn(submitted.body, 'requestHash'), false)
  await relay.worker.runOnce()

  const headers = { Authorization: 'Bearer owner-token' }
  const list = await fetch(`${relay.url}/v1/image-jobs`, { headers })
  assert.equal((await list.json())[0].id, submitted.body.id)
  const status = await fetch(`${relay.url}/v1/image-jobs/${submitted.body.id}`, { headers })
  assert.equal((await status.json()).state, 'succeeded')
  const result = await fetch(`${relay.url}/v1/image-jobs/${submitted.body.id}/result`, { headers })
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('content-type'), 'image/png')
  assert.equal(result.headers.get('content-length'), String((await result.clone().arrayBuffer()).byteLength))
  assert.equal(result.headers.get('x-image-digest'), relay.repo.get('owner-A', submitted.body.id).result.digest)
  assert.deepEqual(Buffer.from(await result.arrayBuffer()), TEST_PNG)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const ack = await fetch(`${relay.url}/v1/image-jobs/${submitted.body.id}/ack`, { method: 'POST', headers })
    assert.equal(ack.status, 200)
    assert.equal((await ack.json()).request, null)
  }
  const gone = await fetch(`${relay.url}/v1/image-jobs/${submitted.body.id}/result`, { headers })
  assert.equal(gone.status, 410)
})

test('every job endpoint enforces owner-scoped lookup', async t => {
  const relay = await startTestRelay(t)
  const { body: job } = await relay.submit()
  await relay.worker.runOnce()
  const other = { Authorization: 'Bearer other-token' }
  const otherList = await fetch(`${relay.url}/v1/image-jobs`, { headers: other })
  assert.deepEqual(await otherList.json(), [])
  for (const [method, suffix] of [
    ['GET', ''], ['GET', '/result'], ['POST', '/ack'], ['DELETE', ''],
  ]) {
    const response = await fetch(`${relay.url}/v1/image-jobs/${job.id}${suffix}`, { method, headers: other })
    assert.equal(response.status, 404)
    assert.equal((await response.json()).code, 'job_not_found')
  }
})

test('delete cancels accepted work, discards completed bytes and refuses uncertain work', async t => {
  const relay = await startTestRelay(t)
  const headers = { Authorization: 'Bearer owner-token' }
  const accepted = (await relay.submit()).body
  let response = await fetch(`${relay.url}/v1/image-jobs/${accepted.id}`, { method: 'DELETE', headers })
  assert.equal((await response.json()).state, 'cancelled')

  relay.advance(relay.now() + 1)
  const completed = (await relay.submit()).body
  await relay.worker.runOnce()
  response = await fetch(`${relay.url}/v1/image-jobs/${completed.id}`, { method: 'DELETE', headers })
  assert.equal((await response.json()).request, null)

  relay.advance(relay.now() + 1)
  const uncertain = (await relay.submit()).body
  relay.repo.claimNext()
  relay.repo.transition(uncertain.id, 'dispatching', 'outcome_unknown', { errorCode: 'provider_uncertain' })
  response = await fetch(`${relay.url}/v1/image-jobs/${uncertain.id}`, { method: 'DELETE', headers })
  assert.equal(response.status, 409)
})

test('a client that has not saved locally can download the same result again without acknowledgement', async t => {
  const relay = await startTestRelay(t)
  const { body: job } = await relay.submit()
  await relay.worker.runOnce()
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${relay.url}/v1/image-jobs/${job.id}/result`, {
      headers: { Authorization: 'Bearer owner-token' },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), TEST_PNG)
  }
  assert.equal(relay.repo.get('owner-A', job.id).acknowledgedAt, null)
})

test('acknowledgement remains durable when output deletion fails and cleanup retries', async t => {
  let fail = false
  const relay = await startTestRelay(t, { wrapSpool: spool => ({ ...spool,
    async removeOutput(id) {
      if (fail) throw new Error('private file path')
      return spool.removeOutput(id)
    },
  }) })
  const { body: job } = await relay.submit()
  await relay.worker.runOnce()
  fail = true
  const response = await fetch(`${relay.url}/v1/image-jobs/${job.id}/ack`, {
    method: 'POST', headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(response.status, 200)
  assert.equal(relay.repo.get('owner-A', job.id).request, null)
  assert.ok(relay.repo.get('owner-A', job.id).acknowledgedAt)
  assert.ok(await relay.spool.readOutput(job.id))
  fail = false
  await relay.worker.cleanup()
  assert.equal(await relay.spool.readOutput(job.id), null)
})
