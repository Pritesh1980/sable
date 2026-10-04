import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { hashRequest, normalizeImage } from '../src/imageInput.js'
import { compileRefinementPrompt } from '../../shared/imageJobs.js'

const fields = { change: 'પ્રીતેશ / プリテシュ', keep: 'Ink', palette: 'colour' }
const request = { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
  ...fields, prompt: compileRefinementPrompt(fields) }
const fixture = (format, options = {}) => sharp({ create: {
  width: 3, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 },
  ...options,
} })[format]().toBuffer()

test('hash frames canonical UTF-8 JSON and exact source bytes', () => {
  const json = Buffer.from(JSON.stringify(request))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(json.length)
  const expected = createHash('sha256').update(Buffer.concat([length, json, Buffer.from('a')])).digest('hex')
  assert.equal(hashRequest(request, Buffer.from('a')), expected)
  assert.notEqual(hashRequest(request, Buffer.from('a')), hashRequest(request, Buffer.from('b')))
  assert.equal(hashRequest(Object.fromEntries(Object.entries(request).reverse()), Buffer.from('a')), expected)
  assert.throws(() => hashRequest({ ...request, sourceUrl: 'https://example.com' }, Buffer.from('a')), { code: 'invalid_request' })
})

for (const format of ['jpeg', 'png', 'webp']) {
  test(`normalizes ${format} to PNG while digesting original bytes`, async () => {
    const source = await fixture(format)
    const result = await normalizeImage(source)
    assert.equal(result.mime, 'image/png')
    assert.ok(Buffer.isBuffer(result.bytes))
    assert.equal(result.digest, createHash('sha256').update(source).digest('hex'))
    const metadata = await sharp(result.bytes).metadata()
    assert.equal(metadata.format, 'png')
    assert.equal(metadata.width, 3)
    assert.equal(metadata.height, 2)
  })
}

test('preserves alpha pixels, rotates EXIF orientation and strips metadata', async () => {
  const source = await sharp(await fixture('png')).withMetadata({ orientation: 6 }).png().toBuffer()
  const { bytes } = await normalizeImage(source)
  const metadata = await sharp(bytes).metadata()
  assert.equal(metadata.width, 2)
  assert.equal(metadata.height, 3)
  for (const key of ['exif', 'icc', 'iptc', 'xmp', 'orientation']) assert.equal(metadata[key], undefined)
  const pixels = await sharp(bytes).raw().toBuffer()
  assert.deepEqual([...pixels.subarray(0, 4)], [255, 0, 0, 128])
})

test('visually identical images retain distinct raw-image and request digests', async () => {
  const source = await fixture('png')
  const tagged = await sharp(source).withExif({ IFD0: { Artist: 'Local fixture' } }).png().toBuffer()
  const a = await normalizeImage(source)
  const b = await normalizeImage(tagged)
  assert.deepEqual(a.bytes, b.bytes)
  assert.notEqual(a.digest, b.digest)
  assert.notEqual(hashRequest(request, source), hashRequest(request, tagged))
})

test('rejects unsupported, empty, corrupt and truncated image bytes with safe errors', async () => {
  const png = await fixture('png')
  const tiff = await fixture('tiff')
  for (const source of [Buffer.alloc(0), Buffer.from('<svg/>'), Buffer.from('secret-bad-image'), tiff, png.subarray(0, png.length - 20)]) {
    await assert.rejects(normalizeImage(source), { code: 'invalid_image', status: 400, message: 'invalid_image' })
  }
})

test('rejects animated WebP instead of silently using the first frame', async () => {
  const animated = await sharp(Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]), {
    raw: { width: 1, height: 2, channels: 4, pageHeight: 1 },
  }).webp({ loop: 0, delay: [100, 100] }).toBuffer()
  assert.equal((await sharp(animated).metadata()).pages, 2)
  await assert.rejects(normalizeImage(animated), { code: 'invalid_image' })
})

test('rejects animated PNG even when the decoder only exposes its first frame', async () => {
  const png = await fixture('png')
  function chunk(type, data) {
    const bytes = Buffer.alloc(data.length + 12)
    bytes.writeUInt32BE(data.length)
    bytes.write(type, 4)
    data.copy(bytes, 8)
    bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
    return bytes
  }
  const header = png.subarray(8, 33)
  const idat = []
  for (let offset = 33; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') idat.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  const control = Buffer.alloc(8)
  control.writeUInt32BE(2)
  const frame = Buffer.alloc(26)
  frame.writeUInt32BE(3, 4)
  frame.writeUInt32BE(2, 8)
  frame.writeUInt16BE(1, 20)
  frame.writeUInt16BE(10, 22)
  const secondFrame = Buffer.from(frame)
  secondFrame.writeUInt32BE(1)
  const sequence = Buffer.alloc(4)
  sequence.writeUInt32BE(2)
  const animated = Buffer.concat([png.subarray(0, 8), header,
    chunk('acTL', control), chunk('fcTL', frame), chunk('IDAT', Buffer.concat(idat)),
    chunk('fcTL', secondFrame), chunk('fdAT', Buffer.concat([sequence, ...idat])), chunk('IEND', Buffer.alloc(0)),
  ])
  await assert.rejects(normalizeImage(animated), { code: 'invalid_image' })
})

test('rejects zero-dimension PNG headers', async () => {
  const png = Buffer.from(await fixture('png'))
  png.writeUInt32BE(0, 16)
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29)
  await assert.rejects(normalizeImage(png), { code: 'invalid_image' })
})

test('rotates JPEG EXIF and requires full pixels despite valid metadata', async () => {
  const jpeg = await sharp(await fixture('jpeg')).withMetadata({ orientation: 6 }).jpeg().toBuffer()
  const normalized = await normalizeImage(jpeg)
  const metadata = await sharp(normalized.bytes).metadata()
  assert.equal(metadata.width, 2)
  assert.equal(metadata.height, 3)
  assert.equal(metadata.orientation, undefined)
  const truncated = (await fixture('png')).subarray(0, -20)
  assert.equal((await sharp(truncated).metadata()).format, 'png')
  await assert.rejects(normalizeImage(truncated), { code: 'invalid_image' })
})

test('accepts exactly 16 megapixels and rejects decompression bombs above the bound', async () => {
  const boundary = await fixture('png', { width: 4000, height: 4000 })
  assert.equal((await sharp((await normalizeImage(boundary)).bytes).metadata()).width, 4000)
  const oversized = await fixture('png', { width: 4001, height: 4000 })
  await assert.rejects(normalizeImage(oversized), { code: 'invalid_image' })
})

test('rejects a normalized PNG over 8 MiB even when uploaded JPEG is smaller', async () => {
  const source = await sharp(randomBytes(2000 * 2000 * 3), {
    raw: { width: 2000, height: 2000, channels: 3 },
  }).jpeg({ quality: 95 }).toBuffer()
  assert.ok(source.length < 8 * 1024 * 1024)
  await assert.rejects(normalizeImage(source), { code: 'image_too_large', status: 413 })
})
