import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { request as httpRequest } from 'node:http'
import sharp from 'sharp'
import { imageJobError, compileRefinementPrompt } from '../../shared/imageJobs.js'
import { createRelayServer } from '../src/http.js'
import { createJobRepository } from '../src/jobRepository.js'
import { createSpool } from '../src/spool.js'
import { createImageWorker } from '../src/worker.js'
import { makeDiskFixture } from './fixtures.js'

export const TEST_PROFILE = Object.freeze({
  id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst',
  size: '1024x1024', quality: 'medium', outputFormat: 'png',
})

export const TEST_PNG = await sharp({
  create: { width: 2, height: 2, channels: 4, background: '#12345680' },
}).png().toBuffer()

export function refinementRequest(overrides = {}) {
  const fields = { change: 'Add mist', keep: 'Temple', palette: 'black', ...overrides }
  return {
    version: 1, operation: 'refine', profileId: TEST_PROFILE.id,
    ...fields, prompt: compileRefinementPrompt(fields),
  }
}

export function requestId(at) {
  return `v1.${at}.${randomUUID()}`
}

export async function multipartWire({ request = refinementRequest(), image = TEST_PNG } = {}) {
  const form = new FormData()
  form.set('image', new Blob([image], { type: 'image/png' }), 'source.png')
  form.set('request', JSON.stringify(request))
  const wire = new Request('http://relay.test', { method: 'POST', body: form })
  return { body: Buffer.from(await wire.arrayBuffer()), contentType: wire.headers.get('content-type') }
}

export async function startTestRelay(t, options = {}) {
  const disk = await makeDiskFixture(t)
  const controlledClock = Object.hasOwn(options, 'clock')
  let clock = options.clock
  let clockOffset = 0
  const now = options.now ?? (() => controlledClock ? clock : Date.now() + clockOffset)
  const repo = createJobRepository(disk.dbPath, { now })
  const baseSpool = createSpool(disk.spoolDir)
  const spool = options.wrapSpool?.(baseSpool) ?? baseSpool
  let paidCalls = 0
  const provider = options.provider ?? { async edit() { paidCalls += 1; return { bytes: TEST_PNG, mime: 'image/png' } } }
  const config = {
    origins: ['https://sable.example'], paidEnabled: options.paidEnabled ?? true,
    profile: TEST_PROFILE, uploadTimeoutMs: 30_000,
    host: '127.0.0.1', port: 0, ...options.config,
  }
  const verifyOwner = options.verifyOwner ?? (async ({ authorization }) => {
    options.onVerify?.()
    if (authorization === 'Bearer owner-token') return { ownerId: 'owner-A' }
    if (authorization === 'Bearer other-token') return { ownerId: 'owner-B' }
    throw imageJobError('invalid_token', 401)
  })
  const logs = []
  const log = event => logs.push(event)
  const worker = createImageWorker({ repo, spool, provider, paidEnabled: () => config.paidEnabled, now, log })
  const server = createRelayServer({ config, verifyOwner, repo, spool, worker, now, log })
  await worker.start()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  let closed = false
  async function close() {
    if (closed) return
    closed = true
    await new Promise(resolve => server.close(resolve))
    await worker.stop()
    repo.close()
  }
  t.after(close)

  async function submit({ token = 'owner-token', id = requestId(now()), request, image, origin } = {}) {
    const form = new FormData()
    form.set('image', new Blob([image ?? TEST_PNG], { type: 'image/png' }), 'source.png')
    form.set('request', JSON.stringify(request ?? refinementRequest()))
    const headers = { Authorization: `Bearer ${token}`, 'Idempotency-Key': id }
    if (origin) headers.Origin = origin
    const response = await fetch(`${url}/v1/image-jobs`, { method: 'POST', headers, body: form })
    return { response, body: await response.json(), id }
  }

  return {
    ...disk, url, config, repo, spool, worker, logs, submit, close,
    providerCalls: () => paidCalls,
    now, advance(value) {
      if (controlledClock) clock = value
      else clockOffset = value - Date.now()
    },
  }
}

export async function rawRequest({ url, method = 'GET', path, headers = {}, body, afterHeaders }) {
  const target = new URL(path, url)
  return new Promise((resolve, reject) => {
    const req = httpRequest(target, { method, headers }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.flushHeaders()
    Promise.resolve(afterHeaders?.()).then(() => req.end(body), reject)
  })
}

export async function expectCode(response, status, code) {
  assert.equal(response.status, status)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { code, status })
}
