import test from 'node:test'
import assert from 'node:assert/strict'
import { multipartWire, rawRequest, refinementRequest, requestId, startTestRelay } from './helpers.js'

test('same id and exact bytes replay one job; altered bytes conflict', async t => {
  const relay = await startTestRelay(t)
  const id = requestId(relay.now())
  const first = await relay.submit({ id })
  const replay = await relay.submit({ id })
  assert.equal(replay.response.status, 202)
  assert.equal(replay.body.id, first.body.id)
  const changed = await relay.submit({ id, request: refinementRequest({ change: 'Different mist' }) })
  assert.equal(changed.response.status, 409)
  assert.equal(changed.body.code, 'idempotency_conflict')
  assert.equal(relay.repo.list('owner-A').length, 1)
})

test('known keys reconcile after their admission window while unseen stale and future keys return server time', async t => {
  const relay = await startTestRelay(t)
  const issued = relay.now()
  const id = requestId(issued)
  const first = await relay.submit({ id })
  relay.advance(issued + 5 * 60_000 + 1)
  const replay = await relay.submit({ id })
  assert.equal(replay.body.id, first.body.id)
  const stale = await relay.submit({ id: requestId(issued) })
  assert.equal(stale.response.status, 410)
  assert.ok(Math.abs(stale.body.serverTime - relay.now()) < 1000)
  const future = await relay.submit({ id: requestId(relay.now() + 60_000) })
  assert.equal(future.response.status, 400)
  assert.ok(Math.abs(future.body.serverTime - relay.now()) < 1000)
})

test('admission uses authenticated header arrival even when upload finishes after five minutes and midnight', async t => {
  let verified
  const sawVerify = new Promise(resolve => { verified = resolve })
  const relay = await startTestRelay(t, { clock: Date.parse('2027-01-01T23:59:59.900Z'), onVerify: verified })
  const admittedAt = relay.now()
  const id = requestId(admittedAt)
  const wire = await multipartWire()
  const response = rawRequest({
    url: relay.url, method: 'POST', path: '/v1/image-jobs', body: wire.body,
    headers: {
      Authorization: 'Bearer owner-token', 'Idempotency-Key': id,
      'Content-Type': wire.contentType, 'Content-Length': String(wire.body.length),
    },
    afterHeaders: async () => { await sawVerify; relay.advance(admittedAt + 6 * 60_000) },
  })
  const result = await response
  assert.equal(result.status, 202)
  const job = relay.repo.findRequest('owner-A', id)
  assert.equal(job.acceptedAt, new Date(admittedAt).toISOString())
  assert.equal(job.acceptedDay, '2027-01-01')
})

test('disabled, mismatched-profile and quota failures never dispatch or retain orphan inputs', async t => {
  const disabled = await startTestRelay(t, { paidEnabled: false })
  let response = await disabled.submit()
  assert.equal(response.response.status, 503)
  assert.equal(disabled.repo.list('owner-A').length, 0)

  const relay = await startTestRelay(t)
  response = await relay.submit({ request: refinementRequest({ profileId: 'other-profile' }) })
  assert.equal(response.response.status, 400)
  assert.equal(relay.repo.list('owner-A').length, 0)

  const first = await relay.submit()
  let writes = 0
  const original = relay.spool.writeInput.bind(relay.spool)
  relay.spool.writeInput = async (id, bytes) => { writes += 1; return original(id, bytes) }
  relay.advance(relay.now() + 1)
  response = await relay.submit()
  assert.equal(response.response.status, 429)
  assert.equal(relay.repo.list('owner-A').length, 1)
  assert.equal(writes, 0)
  assert.equal(first.body.state, 'accepted')
})

test('a durable input-write failure creates no reservation and returns only a safe code', async t => {
  const relay = await startTestRelay(t, { wrapSpool: spool => ({ ...spool,
    async writeInput() { throw new Error('secret disk path and token') },
  }) })
  const result = await relay.submit()
  assert.equal(result.response.status, 500)
  assert.equal(result.body.code, 'storage_unavailable')
  assert.equal(relay.repo.list('owner-A').length, 0)
  assert.doesNotMatch(JSON.stringify(relay.logs), /secret|token|path/)
})

test('replaying an expired known job cannot admit fresh paid work', async t => {
  const relay = await startTestRelay(t)
  const id = requestId(relay.now())
  const first = await relay.submit({ id })
  relay.advance(Date.parse(first.body.createdAt) + 86_400_000)
  await relay.worker.cleanup()
  const replay = await relay.submit({ id })
  assert.equal(replay.response.status, 410)
  assert.equal(replay.body.code, 'request_expired')
  assert.equal(relay.repo.list('owner-A').length, 1)
  assert.equal(relay.providerCalls(), 0)
})

test('concurrent exact submissions reserve one job and replay frozen configuration', async t => {
  const relay = await startTestRelay(t)
  const id = requestId(relay.now())
  const [first, second] = await Promise.all([relay.submit({ id }), relay.submit({ id })])
  assert.equal(first.response.status, 202)
  assert.equal(second.response.status, 202)
  assert.equal(first.body.id, second.body.id)
  assert.equal(relay.repo.list('owner-A').length, 1)
  relay.config.paidEnabled = false
  relay.config.profile = { ...relay.config.profile, id: 'new-profile' }
  const replay = await relay.submit({ id })
  assert.equal(replay.response.status, 202)
  assert.equal(replay.body.generation.profileId, 'openai-refine-v1')
  assert.equal(relay.providerCalls(), 0)
})
