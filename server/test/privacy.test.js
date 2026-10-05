import test from 'node:test'
import assert from 'node:assert/strict'
import { rawRequest, startTestRelay } from './helpers.js'

test('startup wiring is inert when imported by tests or tooling', async () => {
  const module = await import(`../src/main.js?test=${crypto.randomUUID()}`)
  assert.equal(typeof module.main, 'function')
})

test('shutdown stops worker claims before waiting for active HTTP connections', async () => {
  const { createShutdown } = await import('../src/main.js')
  let drainHttp
  const events = []
  const stop = createShutdown({
    server: { close(done) { events.push('close_listener'); drainHttp = done } },
    worker: { async stop() { events.push('stop_worker') } },
    repo: { close() { events.push('close_repository') } },
  })
  const stopped = stop()
  assert.deepEqual(events, ['close_listener', 'stop_worker'])
  assert.equal(stop(), stopped)
  drainHttp()
  await stopped
  assert.deepEqual(events, ['close_listener', 'stop_worker', 'close_repository'])
})

test('CORS is exact, preflight is bounded, and forbidden origins fail before auth', async t => {
  let verified = 0
  const relay = await startTestRelay(t, { onVerify: () => { verified += 1 } })
  let response = await fetch(`${relay.url}/v1/image-capabilities`, {
    headers: { Authorization: 'Bearer owner-token', Origin: 'https://evil.example' },
  })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(verified, 0)

  response = await fetch(`${relay.url}/v1/image-jobs`, {
    method: 'OPTIONS', headers: {
      Origin: 'https://sable.example',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type, idempotency-key',
    },
  })
  assert.equal(response.status, 204)
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://sable.example')
  assert.match(response.headers.get('access-control-allow-methods'), /GET.*POST.*DELETE/u)
  assert.match(response.headers.get('access-control-allow-headers'), /Authorization/u)
  assert.equal(response.headers.get('access-control-allow-credentials'), null)

  response = await fetch(`${relay.url}/health`, {
    method: 'OPTIONS', headers: {
      Origin: 'https://sable.example',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization',
    },
  })
  assert.equal(response.status, 404)
})

test('unknown routes, unsupported methods and encoded job IDs fail safely without caching', async t => {
  const relay = await startTestRelay(t)
  const headers = { Authorization: 'Bearer owner-token' }
  for (const [path, method, status] of [
    ['/health', 'GET', 404], ['/v1/image-capabilities', 'POST', 405],
    ['/v1/image-jobs/%3000000-0000-4000-8000-000000000001', 'GET', 400],
    ['/v1/image-jobs/not-a-uuid', 'GET', 400],
    ['/v1/image-jobs?limit=9999', 'GET', 400],
  ]) {
    const response = await fetch(`${relay.url}${path}`, { method, headers })
    assert.equal(response.status, status)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.match((await response.json()).code, /^[a-z][a-z0-9_]+$/u)
  }
})

test('oversized headers are rejected without caching or echoing header contents', async t => {
  const relay = await startTestRelay(t)
  const response = await rawRequest({
    url: relay.url, path: '/v1/image-capabilities', headers: { 'X-Large': 'secret'.repeat(4000) },
  })
  assert.equal(response.status, 431)
  assert.equal(response.headers['cache-control'], 'no-store')
  assert.deepEqual(JSON.parse(response.body), { code: 'headers_too_large', status: 431 })
})

test('logs whitelist opaque metadata and never contain tokens, prompts, bodies or provider errors', async t => {
  const relay = await startTestRelay(t, { provider: { async edit() {
    throw Object.assign(new Error('raw provider secret'), { token: 'bearer-secret' })
  } } })
  const job = await relay.submit({ request: undefined })
  await relay.worker.runOnce()
  const response = await fetch(`${relay.url}/v1/image-jobs/${job.body.id}`, {
    headers: { Authorization: 'Bearer owner-token' },
  })
  assert.equal(response.status, 200)
  const serialized = JSON.stringify(relay.logs)
  assert.doesNotMatch(serialized, /owner-A|owner-token|Add mist|Temple|provider secret|bearer-secret/u)
  for (const event of relay.logs) {
    assert.ok(Object.keys(event).every(key => ['code', 'event', 'jobId', 'state', 'durationMs', 'owner'].includes(key)))
  }
})

test('expired and acknowledged outputs return 410 without exposing a public URL', async t => {
  const relay = await startTestRelay(t)
  const headers = { Authorization: 'Bearer owner-token' }
  const { body: job } = await relay.submit()
  await relay.worker.runOnce()
  const saved = relay.repo.get('owner-A', job.id)
  relay.advance(Date.parse(saved.expiresAt))
  const response = await fetch(`${relay.url}/v1/image-jobs/${job.id}/result`, { headers })
  assert.equal(response.status, 410)
  assert.equal((await response.json()).code, 'result_expired')
})

for (const action of ['acknowledge', 'expire']) {
  test(`result access rechecks ${action} after an asynchronous disk read`, async t => {
    let entered, release
    const reading = new Promise(resolve => { entered = resolve })
    const blocked = new Promise(resolve => { release = resolve })
    const relay = await startTestRelay(t)
    const { body: job } = await relay.submit()
    await relay.worker.runOnce()
    const original = relay.spool.readOutput.bind(relay.spool)
    relay.spool.readOutput = async id => {
      const output = await original(id)
      entered()
      await blocked
      return output
    }
    const download = fetch(`${relay.url}/v1/image-jobs/${job.id}/result`, {
      headers: { Authorization: 'Bearer owner-token' },
    })
    await reading
    if (action === 'acknowledge') relay.repo.ack('owner-A', job.id)
    else relay.advance(Date.parse(relay.repo.get('owner-A', job.id).expiresAt))
    release()
    const response = await download
    assert.equal(response.status, 410)
    assert.equal((await response.json()).code, 'result_expired')
  })
}
