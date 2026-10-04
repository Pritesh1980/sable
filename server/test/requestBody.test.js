import test from 'node:test'
import assert from 'node:assert/strict'
import { PassThrough, Readable } from 'node:stream'
import sharp from 'sharp'
import { readBoundedMultipart } from '../src/requestBody.js'
import { compileRefinementPrompt, LIMITS } from '../../shared/imageJobs.js'

const fields = { change: 'પ્રીતેશ / プリテシュ', keep: 'Ink', palette: 'colour' }
const request = { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
  ...fields, prompt: compileRefinementPrompt(fields) }
const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#12345680' } }).png().toBuffer()

async function multipart(edit = () => {}, { type = 'image/png', name = 'source.png' } = {}) {
  const form = new FormData()
  form.append('image', new Blob([png], { type }), name)
  form.append('request', JSON.stringify(request))
  edit(form)
  const wire = new Request('http://localhost', { method: 'POST', body: form })
  return { bytes: Buffer.from(await wire.arrayBuffer()), headers: Object.fromEntries(wire.headers) }
}

function incoming({ bytes, headers }, overrides = {}, chunkSize = bytes.length) {
  const chunks = []
  for (let i = 0; i < bytes.length; i += chunkSize) chunks.push(bytes.subarray(i, i + chunkSize))
  const req = Readable.from(chunks)
  req.headers = { ...headers, 'content-length': String(bytes.length), ...overrides }
  return req
}

test('returns canonical request and byte-identical uploaded image', async () => {
  const wire = await multipart(form => form.set('request', JSON.stringify(Object.fromEntries(Object.entries(request).reverse()))))
  const result = await readBoundedMultipart(incoming(wire))
  assert.deepEqual(result.request, request)
  assert.deepEqual(Object.keys(result.request), Object.keys(request))
  assert.deepEqual(result.sourceBytes, png)
})

test('accepts chunked data without declared length and ignores a misleading filename', async () => {
  const wire = await multipart(() => {}, { name: 'not-an-image.exe' })
  const result = await readBoundedMultipart(incoming(wire, { 'content-length': undefined, 'transfer-encoding': 'chunked' }, 7))
  assert.deepEqual(result.sourceBytes, png)
})

test('rejects duplicate, missing, extra and wrongly typed form fields', async () => {
  for (const edit of [
    form => form.append('image', new Blob([png], { type: 'image/png' }), 'second.png'),
    form => form.append('request', JSON.stringify(request)),
    form => form.append('sourceUrl', 'https://example.com/source.png'),
    form => form.delete('image'), form => form.delete('request'),
    form => form.set('image', 'not a file'),
    form => form.set('request', new Blob([JSON.stringify(request)]), 'request.json'),
  ]) await assert.rejects(readBoundedMultipart(incoming(await multipart(edit))), { code: 'invalid_multipart', status: 400 })
})

test('rejects malformed JSON and incomplete or noncanonical request contracts', async () => {
  for (const json of ['{', '{}', JSON.stringify({ ...request, operation: 'generate' }), JSON.stringify({ ...request, prompt: 'forged' })]) {
    await assert.rejects(readBoundedMultipart(incoming(await multipart(form => form.set('request', json)))), { code: 'invalid_request', status: 400 })
  }
})

test('rejects advertised MIME mismatches, SVG and empty image files', async () => {
  for (const type of ['image/jpeg', 'image/webp', 'application/octet-stream', 'image/svg+xml']) {
    await assert.rejects(readBoundedMultipart(incoming(await multipart(() => {}, { type }))), { code: 'invalid_image' })
  }
  for (const bytes of [Buffer.alloc(0), Buffer.from('<svg/>')]) {
    const wire = await multipart(form => form.set('image', new Blob([bytes], { type: 'image/png' }), 'fake.png'))
    await assert.rejects(readBoundedMultipart(incoming(wire)), { code: 'invalid_image' })
  }
})

test('rejects encodings and malformed boundaries before reading stream data', async () => {
  const wire = await multipart()
  for (const overrides of [
    { 'content-encoding': 'gzip' }, { 'content-encoding': 'identity, gzip' },
    { 'content-type': 'application/json' }, { 'content-type': 'multipart/form-data' },
    { 'content-type': 'multipart/form-data; boundary=""' },
    { 'content-type': `multipart/form-data; boundary=${'x'.repeat(71)}` },
    { 'content-type': 'multipart/form-data; boundary=a; boundary=b' },
  ]) {
    const req = incoming(wire, overrides)
    await assert.rejects(readBoundedMultipart(req), { code: 'invalid_multipart' })
    assert.equal(req.readableFlowing, null)
    req.destroy()
  }
  await assert.rejects(readBoundedMultipart(incoming(wire, { 'content-type': 'multipart/form-data; boundary=wrong' })), { code: 'invalid_multipart' })
})

test('rejects part encodings that native multipart would transform or ignore', async () => {
  for (const encoding of ['Content-Transfer-Encoding: base64', 'Content-Encoding: gzip']) {
    const boundary = 'local-encoding-fixture'
    const bytes = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="source.png"\r\nContent-Type: image/png\r\n${encoding}\r\n\r\n`),
      encoding.includes('base64') ? Buffer.from(png.toString('base64')) : png,
      Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="request"\r\n\r\n${JSON.stringify(request)}\r\n--${boundary}--\r\n`),
    ])
    const headers = { 'content-type': `multipart/form-data; boundary=${boundary}` }
    await assert.rejects(readBoundedMultipart(incoming({ bytes, headers })), { code: 'invalid_multipart' })
  }
})

test('checks exact declared byte length and rejects invalid lengths', async () => {
  const wire = await multipart()
  for (const length of ['-1', '1.5', '1e3', ' 12', '12, 12', '999999999999999999999', String(wire.bytes.length - 1), String(wire.bytes.length + 1)]) {
    await assert.rejects(readBoundedMultipart(incoming(wire, { 'content-length': length })), { code: 'invalid_content_length' })
  }
  await assert.rejects(readBoundedMultipart(incoming(wire, { 'transfer-encoding': 'chunked' })), { code: 'invalid_content_length' })
})

test('enforces declared, streaming and absolute byte caps including chunked uploads', async () => {
  const wire = await multipart()
  await assert.rejects(readBoundedMultipart(incoming(wire), { maxBytes: wire.bytes.length - 1 }), { code: 'body_too_large', status: 413 })
  assert.deepEqual((await readBoundedMultipart(incoming(wire), { maxBytes: wire.bytes.length })).sourceBytes, png)
  await assert.rejects(readBoundedMultipart(incoming(wire, { 'content-length': undefined }, 17), { maxBytes: wire.bytes.length - 1 }), { code: 'body_too_large' })
  const huge = { ...wire, bytes: Buffer.alloc(LIMITS.maxBodyBytes + 1) }
  await assert.rejects(readBoundedMultipart(incoming(huge, { 'content-length': undefined }, 65536)), { code: 'body_too_large' })
  await assert.rejects(readBoundedMultipart(incoming(huge), { maxBytes: LIMITS.maxBodyBytes * 2 }), { code: 'body_too_large' })
})

test('rejects truncated multipart boundaries even when declared length matches', async () => {
  const wire = await multipart()
  wire.bytes = wire.bytes.subarray(0, wire.bytes.lastIndexOf('\r\n--'))
  await assert.rejects(readBoundedMultipart(incoming(wire)), { code: 'invalid_multipart' })
})

test('rejects invalid internal bounds instead of disabling upload protection', async () => {
  const wire = await multipart()
  for (const options of [{ maxBytes: 0 }, { maxBytes: Infinity }, { deadlineMs: -1 }, { deadlineMs: NaN }]) {
    const req = incoming(wire)
    await assert.rejects(readBoundedMultipart(req, options), { code: 'invalid_request' })
    assert.equal(req.readableFlowing, null)
    req.destroy()
  }
})

test('defaults to an absolute 30-second deadline and cannot raise it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const wire = await multipart()
  for (const options of [undefined, { deadlineMs: 60_000 }]) {
    const req = new PassThrough()
    req.headers = wire.headers
    let settled = false
    const result = readBoundedMultipart(req, options).finally(() => { settled = true })
    const rejection = assert.rejects(result, { code: 'upload_timeout' })
    t.mock.timers.tick(29_999)
    await Promise.resolve()
    assert.equal(settled, false)
    req.write('trickle')
    t.mock.timers.tick(1)
    await rejection
    req.destroy()
  }
})

test('an independent upload deadline expires despite trickled chunks', async () => {
  const wire = await multipart()
  const req = new PassThrough()
  req.headers = wire.headers
  const interval = setInterval(() => req.write('a'), 5)
  try {
    await assert.rejects(readBoundedMultipart(req, { deadlineMs: 30 }), { code: 'upload_timeout', status: 408 })
    assert.equal(req.listenerCount('data'), 0)
  } finally {
    clearInterval(interval)
    req.destroy()
  }
})

test('rejects abort, disconnect and stream errors without leaking raw details', async () => {
  const wire = await multipart()
  for (const event of ['aborted', 'close', 'error']) {
    const req = new PassThrough()
    req.headers = wire.headers
    const result = readBoundedMultipart(req)
    req.emit(event, new Error('sensitive network details'))
    await assert.rejects(result, { code: 'upload_aborted', status: 400, message: 'upload_aborted' })
    assert.equal(req.listenerCount('data'), 0)
    req.destroy()
  }
  const req = incoming(wire)
  req.aborted = true
  await assert.rejects(readBoundedMultipart(req), { code: 'upload_aborted' })
  req.destroy()
})

test('keeps abort errors handled until socket close, then removes every reader listener', async () => {
  const req = new PassThrough()
  req.headers = (await multipart()).headers
  const result = readBoundedMultipart(req)
  req.emit('aborted')
  await assert.rejects(result, { code: 'upload_aborted' })
  // IncomingMessage emits ECONNRESET after aborted and before close.
  assert.doesNotThrow(() => req.emit('error', new Error('ECONNRESET sensitive detail')))
  req.emit('close')
  for (const event of ['data', 'end', 'aborted', 'error', 'close']) assert.equal(req.listenerCount(event), 0)
  req.destroy()
})

test('completed reads remove all reader listeners', async () => {
  const req = incoming(await multipart())
  await readBoundedMultipart(req)
  for (const event of ['data', 'end', 'aborted', 'error', 'close']) assert.equal(req.listenerCount(event), 0)
})
