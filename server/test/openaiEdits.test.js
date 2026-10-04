import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { createOpenAiEdits } from '../src/providers/openaiEdits.js'

const profile = Object.freeze({ id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst',
  size: '1024x1024', quality: 'medium', outputFormat: 'png' })
const input = { sourceBytes: Buffer.from('source'), prompt: 'Change ink', profile }
const png = () => sharp({ create: { width: 2, height: 3, channels: 4,
  background: { r: 0, g: 0, b: 0, alpha: 1 } } }).png().toBuffer()
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status })

test('posts one PNG source and fixed edit parameters without leaking the key into the URL', async () => {
  const output = await png()
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async (url, options) => {
    calls += 1
    assert.equal(url, 'https://api.openai.com/v1/images/edits')
    assert.equal(options.method, 'POST')
    assert.deepEqual(options.headers, { Authorization: 'Bearer fixture-only' })
    assert.ok(options.signal instanceof AbortSignal)
    assert.ok(options.body instanceof FormData)
    const fields = [...options.body.entries()]
    assert.deepEqual(fields.map(([name]) => name), ['model', 'prompt', 'n', 'size', 'quality', 'output_format', 'image[]'])
    assert.deepEqual(fields.slice(0, 6).map(([, value]) => value),
      ['gpt-image-2.5-sunburst', 'Change ink', '1', '1024x1024', 'medium', 'png'])
    assert.equal(fields[6][1].type, 'image/png')
    assert.equal(fields[6][1].name, 'source.png')
    assert.deepEqual(Buffer.from(await fields[6][1].arrayBuffer()), input.sourceBytes)
    return jsonResponse({ data: [{ b64_json: output.toString('base64') }] })
  } })
  const result = await provider.edit(input)
  assert.deepEqual(result, { bytes: output, mime: 'image/png' })
  assert.equal(calls, 1)
})

test('a failed paid request is attempted once, without fallback', async () => {
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async () => {
    calls += 1
    throw new Error('socket closed with secret response')
  } })
  await assert.rejects(provider.edit({ sourceBytes: Buffer.from('source'), prompt: 'Change ink',
    profile: { id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst', size: '1024x1024',
      quality: 'medium', outputFormat: 'png' } }), { code: 'provider_uncertain' })
  assert.equal(calls, 1)
})

test('rejects arbitrary or altered profiles before any dispatch', async () => {
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async () => { calls += 1 } })
  for (const changed of [{ model: 'arbitrary-model' }, { size: '2048x2048' },
    { quality: 'high' }, { outputFormat: 'webp' }, { id: 'other-profile' },
    { endpoint: 'https://evil.example/images/edits' }]) {
    await assert.rejects(provider.edit({ ...input, profile: { ...profile, ...changed } }),
      { code: 'invalid_provider_profile' })
  }
  assert.equal(calls, 0)
})

for (const status of [400, 429, 500, 503]) {
  test(`maps HTTP ${status} to a sanitized single-attempt failure`, async () => {
    let calls = 0
    const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async () => {
      calls += 1
      return new Response('secret provider response', { status })
    } })
    const code = status < 500 ? 'provider_rejected' : 'provider_uncertain'
    await assert.rejects(provider.edit(input), { code, message: code })
    assert.equal(calls, 1)
  })
}

test('caller abort cancels one in-flight dispatch with a safe uncertain outcome', async () => {
  const controller = new AbortController()
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async (_url, { signal }) => {
    calls += 1
    controller.abort()
    throw signal.reason
  } })
  await assert.rejects(provider.edit({ ...input, signal: controller.signal }),
    { code: 'provider_uncertain', message: 'provider_uncertain' })
  assert.equal(calls, 1)
})

test('provider timeout aborts one in-flight dispatch', async () => {
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', timeoutMs: 5,
    fetchImpl: async (_url, { signal }) => {
      calls += 1
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }))
    } })
  await assert.rejects(provider.edit(input), { code: 'provider_uncertain' })
  assert.equal(calls, 1)
})

test('provider timeout settles even when injected fetch ignores its abort signal', async () => {
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', timeoutMs: 5,
    fetchImpl: async () => { calls += 1; return new Promise(() => {}) } })
  await assert.rejects(provider.edit(input), { code: 'provider_uncertain' })
  assert.equal(calls, 1)
})

test('provider timeout settles while a successful response stream stalls', async () => {
  let calls = 0
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', timeoutMs: 5,
    fetchImpl: async () => {
      calls += 1
      return new Response(new ReadableStream({ start() {} }))
    } })
  await assert.rejects(provider.edit(input), { code: 'provider_uncertain' })
  assert.equal(calls, 1)
})

for (const [name, response] of [
  ['malformed JSON', () => new Response('{bad json')],
  ['URL-only result', () => jsonResponse({ data: [{ url: 'https://evil.example/result.png' }] })],
  ['two outputs', async () => { const b64_json = (await png()).toString('base64'); return jsonResponse({ data: [{ b64_json }, { b64_json }] }) }],
  ['invalid base64', () => jsonResponse({ data: [{ b64_json: 'abc$' }] })],
  ['fake PNG', () => jsonResponse({ data: [{ b64_json: Buffer.from('not a PNG').toString('base64') }] })],
  ['oversized base64 image', () => jsonResponse({ data: [{ b64_json: Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64') }] })],
  ['oversized image profile', async () => jsonResponse({ data: [{ b64_json: (await sharp({ create: {
    width: 1025, height: 1, channels: 3, background: 'black',
  } }).png().toBuffer()).toString('base64') }] })],
  ['truncated PNG', async () => jsonResponse({ data: [{ b64_json: (await png()).subarray(0, -15).toString('base64') }] })],
]) {
  test(`rejects ${name} as uncertain after exactly one dispatch`, async () => {
    let calls = 0
    const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async () => {
      calls += 1
      return response()
    } })
    await assert.rejects(provider.edit(input), { code: 'provider_uncertain', message: 'provider_uncertain' })
    assert.equal(calls, 1)
  })
}

test('bounds streamed response before JSON decoding', async () => {
  let calls = 0
  let chunks = 0
  const stream = new ReadableStream({ pull(controller) {
    chunks += 1
    controller.enqueue(new Uint8Array(1024 * 1024))
  } })
  const provider = createOpenAiEdits({ apiKey: 'fixture-only', fetchImpl: async () => {
    calls += 1
    return new Response(stream)
  } })
  await assert.rejects(provider.edit(input), { code: 'provider_uncertain' })
  assert.equal(calls, 1)
  assert.ok(chunks <= 18)
})
