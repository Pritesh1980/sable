// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Blob } from 'node:buffer'
import { createHash, webcrypto } from 'node:crypto'
import { compileRefinementPrompt } from '../../shared/imageJobs'
import { createRelayClient } from '../data/imageJobs/relayClient'

const id = '00000000-0000-4000-8000-000000000001'
const requestId = `v1.1800000000000.${id}`
const fields = { change: 'પ્રીતેશ / プリテシュ', keep: 'Original ink', palette: 'colour' }
const request = { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
  ...fields, prompt: compileRefinementPrompt(fields) }
const job = { id, requestId, state: 'accepted', createdAt: '2027-01-15T08:00:00.000Z',
  completedAt: null, expiresAt: null, errorCode: null, sourceImageDigest: 'a'.repeat(64), request,
  generation: { version: 1, jobId: id, provider: 'openai', model: 'resolved-model',
    profileId: 'openai-refine-v1', createdAt: '2027-01-15T08:00:00.000Z', provenance: 'relay' } }
const caps = { enabled: true, operations: ['refine'], provider: 'openai',
  profile: { id: 'openai-refine-v1', model: 'resolved-model', size: '1024x1024', quality: 'medium', outputFormat: 'png' },
  quota: { active: 0, dailyRemaining: 10 }, serverTime: 1_800_000_000_000 }
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' } })
const pending = () => ({ requestId, request: structuredClone(request),
  source: new Blob(['exact prepared bytes'], { type: 'image/png' }), accepted: false, jobId: null })
let auth, fetchImpl, client
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto)
  auth = { getAccessToken: vi.fn().mockResolvedValue('token') }
  fetchImpl = vi.fn().mockImplementation(() => json(job, 202))
  client = createRelayClient({ baseUrl: 'https://relay.example', auth, fetchImpl })
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

it('refreshes once on 401 with the exact same frozen key, Unicode and bytes', async () => {
  auth.getAccessToken.mockResolvedValueOnce('old').mockResolvedValueOnce('fresh')
  fetchImpl.mockResolvedValueOnce(json({ code: 'unauthorized' }, 401)).mockResolvedValueOnce(json(job, 202))
  const input = pending()
  const submitting = client.submit(input)
  input.request.change = 'edited while awaiting token'
  input.source = new Blob(['different'], { type: 'image/png' })
  expect(await submitting).toEqual(job)
  expect(auth.getAccessToken.mock.calls).toEqual([[], [{ forceRefresh: true }]])
  for (const [, options] of fetchImpl.mock.calls) {
    expect(options.headers['Idempotency-Key']).toBe(requestId)
    expect(JSON.parse(options.body.get('request'))).toEqual(request)
    expect(await options.body.get('image').text()).toBe('exact prepared bytes')
    expect(options.cache).toBe('no-store')
    expect(options.credentials).toBe('omit')
    expect(options.redirect).toBe('error')
    expect(options.headers['Content-Type']).toBeUndefined()
  }
  expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer fresh')
})

it('never fetches for absent configuration or offline authentication', async () => {
  const absent = createRelayClient({ auth, fetchImpl })
  expect((await absent.capabilities()).enabled).toBe(false)
  auth.getAccessToken.mockResolvedValue(null)
  expect((await client.capabilities()).enabled).toBe(false)
  expect(fetchImpl).not.toHaveBeenCalled()
  await expect(client.submit(pending())).rejects.toMatchObject({ code: 'relay_disabled' })
})

it.each(['http://external.example', 'https://user:secret@relay.example', 'https://relay.example?q=secret',
  '/v1/image-jobs', 'https://relay.example/#fragment'])('fails closed for unsafe configuration %s', async baseUrl => {
  const bad = createRelayClient({ baseUrl, auth, fetchImpl })
  expect((await bad.capabilities()).enabled).toBe(false)
  expect(fetchImpl).not.toHaveBeenCalled()
})

it('sanitizes token failure and never refreshes after 403', async () => {
  auth.getAccessToken.mockRejectedValueOnce(new Error('private token'))
  await expect(client.list()).rejects.toMatchObject({ code: 'auth_unavailable', message: 'auth_unavailable' })
  expect(fetchImpl).not.toHaveBeenCalled()
  fetchImpl.mockResolvedValueOnce(json({ code: 'owner_forbidden', details: 'private provider' }, 403))
  await expect(client.list()).rejects.toMatchObject({ code: 'owner_forbidden' })
  expect(auth.getAccessToken).toHaveBeenCalledTimes(2)
})

it('stops after a second 401 and does not refresh provider errors', async () => {
  fetchImpl.mockImplementation(() => json({ code: 'unauthorized' }, 401))
  await expect(client.submit(pending())).rejects.toMatchObject({ code: 'unauthorized' })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  fetchImpl.mockClear().mockResolvedValue(json({ code: 'provider_failed', details: 'secret' }, 502))
  auth.getAccessToken.mockClear()
  await expect(client.submit(pending())).rejects.toMatchObject({ code: 'provider_failed', message: 'provider_failed' })
  expect(fetchImpl).toHaveBeenCalledOnce()
  expect(auth.getAccessToken).toHaveBeenCalledOnce()
})

it('reports uncertain network submission without replacing input or retrying', async () => {
  fetchImpl.mockRejectedValueOnce(new Error('socket with private path'))
  const input = pending()
  await expect(client.submit(input)).rejects.toMatchObject({ code: 'acceptance_unknown' })
  expect(fetchImpl).toHaveBeenCalledOnce()
  expect(input.requestId).toBe(requestId)
  expect(await input.source.text()).toBe('exact prepared bytes')
})

it('bounds a hung submission and retains the exact key', async () => {
  vi.useFakeTimers()
  fetchImpl.mockImplementation(() => new Promise(() => {}))
  const result = client.submit(pending()).catch(error => error)
  await vi.advanceTimersByTimeAsync(30_001)
  expect(await result).toMatchObject({ code: 'acceptance_unknown' })
  expect(fetchImpl).toHaveBeenCalledOnce()
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true)
  expect(fetchImpl.mock.calls[0][1].headers['Idempotency-Key']).toBe(requestId)
})

it('calibrates midpoint time and recalibrates skew without changing a key', async () => {
  let now = 1000
  client = createRelayClient({ baseUrl: 'https://relay.example', auth, fetchImpl, now: () => now })
  fetchImpl.mockImplementationOnce(() => { now = 1200; return json({ ...caps, serverTime: 5000 }) })
  await client.capabilities()
  expect(client.serverNow()).toBe(5100)
  fetchImpl.mockImplementationOnce(() => { now = 1400; return json({ code: 'key_clock_skew', serverTime: 8000 }, 400) })
  const input = pending()
  await expect(client.submit(input)).rejects.toMatchObject({ code: 'key_clock_skew', serverTime: 8000 })
  expect(client.serverNow()).toBe(8100)
  expect(input.requestId).toBe(requestId)
})

it('rejects resubmitting accepted markers and obtains a current token for recovery endpoints', async () => {
  await expect(client.submit({ ...pending(), accepted: true, jobId: id, source: null }))
    .rejects.toMatchObject({ code: 'job_already_accepted' })
  expect(fetchImpl).not.toHaveBeenCalled()
  fetchImpl.mockResolvedValueOnce(json([job])).mockImplementation(() => json(job))
  expect(await client.list()).toEqual([job])
  expect(await client.status(id)).toEqual(job)
  await client.ack(id)
  await client.discard(id)
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
    'https://relay.example/v1/image-jobs', `https://relay.example/v1/image-jobs/${id}`,
    `https://relay.example/v1/image-jobs/${id}/ack`, `https://relay.example/v1/image-jobs/${id}`])
  expect(fetchImpl.mock.calls.map(([, options]) => options.method)).toEqual(['GET', 'GET', 'POST', 'DELETE'])
  expect(auth.getAccessToken).toHaveBeenCalledTimes(4)
})

it.each(['provider_uncertain', 'provider_rejected', 'input_unavailable', 'worker_disabled'])(
  'keeps worker terminal code %s readable in status and a mixed recovery list', async errorCode => {
    const terminal = { ...job, state: errorCode === 'provider_uncertain' ? 'outcome_unknown' : 'failed', errorCode }
    fetchImpl.mockResolvedValueOnce(json(terminal)).mockResolvedValueOnce(json([terminal, job]))
    expect(await client.status(id)).toEqual(terminal)
    expect(await client.list()).toEqual([terminal, job])
  },
)

it.each([{ ...job, resultUrl: 'https://external.example/private.png' }, { ...job, id: 'not-a-uuid' },
  { ...job, errorCode: 'private_provider_details' },
  { ...job, state: 'invented' }, { ...job, sourceImageDigest: 'a'.repeat(64) + '\n' },
  { ...job, request: { ...request, prompt: 'changed' } },
  { ...job, generation: { ...job.generation, provenance: 'user-import' } }])('rejects malformed or external-URL jobs', async malformed => {
  fetchImpl.mockResolvedValue(json(malformed))
  await expect(client.status(id)).rejects.toMatchObject({ code: 'relay_invalid_response' })
})

it('rejects a valid-shaped response for a different job on each job endpoint', async () => {
  const otherId = '00000000-0000-4000-8000-000000000002'
  fetchImpl.mockImplementation(() => json({ ...job, id: otherId, generation: { ...job.generation, jobId: otherId } }))
  for (const method of ['status', 'ack', 'discard']) {
    await expect(client[method](id)).rejects.toMatchObject({ code: 'relay_invalid_response' })
  }
})

it('rejects malformed capabilities and oversized lists', async () => {
  fetchImpl.mockResolvedValueOnce(json({ ...caps, profile: { ...caps.profile, size: 'unbounded' } }))
  await expect(client.capabilities()).rejects.toMatchObject({ code: 'relay_invalid_response' })
  fetchImpl.mockResolvedValueOnce(json(Array(51).fill(job)))
  await expect(client.list()).rejects.toMatchObject({ code: 'relay_invalid_response' })
})

it('verifies downloaded PNG bytes against the exposed digest', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])
  const digest = createHash('sha256').update(bytes).digest('hex')
  fetchImpl.mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': 'image/png', 'X-Image-Digest': digest } }))
  const result = await client.result(id)
  expect(result.digest).toBe(digest)
  expect(Array.from(new Uint8Array(await result.blob.arrayBuffer()))).toEqual(Array.from(bytes))
  fetchImpl.mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': 'image/png', 'X-Image-Digest': 'b'.repeat(64) } }))
  await expect(client.result(id)).rejects.toMatchObject({ code: 'result_digest_mismatch' })
})

it('bounds streamed bytes regardless of Content-Length and rejects non-PNG results', async () => {
  fetchImpl.mockResolvedValueOnce(new Response(new Uint8Array(8 * 1024 * 1024 + 1), {
    headers: { 'Content-Type': 'image/png', 'X-Image-Digest': 'a'.repeat(64) } }))
  await expect(client.result(id)).rejects.toMatchObject({ code: 'relay_invalid_response' })
  fetchImpl.mockResolvedValueOnce(new Response('private html', { headers: { 'Content-Type': 'text/html' } }))
  await expect(client.result(id)).rejects.toMatchObject({ code: 'relay_invalid_response' })
  fetchImpl.mockResolvedValueOnce(new Response('oversized', { headers: {
    'Content-Type': 'image/png', 'Content-Length': '8388609', 'X-Image-Digest': 'a'.repeat(64) } }))
  await expect(client.result(id)).rejects.toMatchObject({ code: 'relay_invalid_response' })
})

it('sanitizes unexpected error bodies and refuses unsafe endpoint IDs', async () => {
  fetchImpl.mockResolvedValue(json({ code: 'secret_provider_key', message: 'private details' }, 500))
  await expect(client.list()).rejects.toMatchObject({ code: 'relay_error', message: 'relay_error' })
  fetchImpl.mockClear()
  await expect(client.result('https://external.example/result')).rejects.toMatchObject({ code: 'invalid_job_id' })
  expect(fetchImpl).not.toHaveBeenCalled()
})

it('sanitizes network failures during response streaming', async () => {
  fetchImpl.mockImplementation(() => new Response(new ReadableStream({
    start(controller) { controller.error(new Error('private response path')) },
  }), { headers: { 'Content-Type': 'application/json' } }))
  await expect(client.list()).rejects.toMatchObject({ code: 'relay_unavailable', message: 'relay_unavailable' })
  await expect(client.submit(pending())).rejects.toMatchObject({ code: 'acceptance_unknown', message: 'acceptance_unknown' })
})
