import { createHash } from 'node:crypto'
import sharp from 'sharp'
import { canonicalRequest, imageJobError, LIMITS } from '../../shared/imageJobs.js'

const MIME_BY_FORMAT = Object.freeze({ jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' })
const decodeOptions = { limitInputPixels: LIMITS.maxImagePixels, failOn: 'warning' }

function rejectPngAnimation(bytes) {
  // libvips can expose APNG as a single PNG page. Inspect bounded chunk headers
  // as well as decoder metadata; never scan compressed pixel bytes as text.
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const size = bytes.readUInt32BE(offset)
    if (size > bytes.length - offset - 12) throw imageJobError('invalid_image', 400)
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) throw imageJobError('invalid_image', 400)
    if (type === 'IEND') return
    offset += size + 12
  }
}

export function hashRequest(request, sourceBytes) {
  const json = Buffer.from(canonicalRequest(request))
  const length = Buffer.alloc(4)
  length.writeUInt32BE(json.length)
  return createHash('sha256').update(length).update(json).update(sourceBytes).digest('hex')
}

// Header inspection is shared with multipart admission so advertised MIME is
// checked before decoding pixels. Never trust the filename or file extension.
export async function validateImageMetadata(sourceBytes, advertisedMime) {
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0) throw imageJobError('invalid_image', 400)
  if (sourceBytes.length > LIMITS.maxBodyBytes) throw imageJobError('image_too_large', 413)
  let metadata
  try {
    metadata = await sharp(sourceBytes, decodeOptions).metadata()
  } catch {
    throw imageJobError('invalid_image', 400)
  }
  const { format, width, height, pages = 1 } = metadata
  if (!Object.hasOwn(MIME_BY_FORMAT, format) || pages !== 1
      || !Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
      || width * height > LIMITS.maxImagePixels
      || (advertisedMime !== undefined && advertisedMime !== MIME_BY_FORMAT[format])) {
    throw imageJobError('invalid_image', 400)
  }
  if (format === 'png') rejectPngAnimation(sourceBytes)
}

export async function normalizeImage(sourceBytes) {
  await validateImageMetadata(sourceBytes)
  const digest = createHash('sha256').update(sourceBytes).digest('hex')
  let bytes
  try {
    // Full decode is mandatory: valid headers alone do not prove valid pixels.
    // Sharp strips metadata by default, preserves alpha, and applies EXIF here.
    bytes = await sharp(sourceBytes, decodeOptions).autoOrient().png().toBuffer()
  } catch {
    throw imageJobError('invalid_image', 400)
  }
  if (bytes.length > LIMITS.maxBodyBytes) throw imageJobError('image_too_large', 413)
  return { bytes, mime: 'image/png', digest }
}
