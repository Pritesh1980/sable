import { imageJobError, LIMITS } from '../../../shared/imageJobs'

const fail = code => imageJobError(code, 400)

/** Callers explicitly resolve/select source bytes; this never fetches a URL. */
export async function prepareRefinementSource(source) {
  if (!['[object Blob]', '[object File]'].includes(Object.prototype.toString.call(source))
      || !['image/png', 'image/jpeg', 'image/webp'].includes(source.type) || source.size < 1) {
    throw fail('invalid_source')
  }
  if (source.size > LIMITS.maxBodyBytes) throw fail('source_too_large')
  let bitmap
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
    if (!Number.isSafeInteger(bitmap.width) || bitmap.width < 1
        || !Number.isSafeInteger(bitmap.height) || bitmap.height < 1
        || bitmap.width * bitmap.height > LIMITS.maxImagePixels) throw fail('source_too_large')
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d', { alpha: true })
    if (!context) throw fail('source_unreadable')
    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob || blob.type !== 'image/png' || blob.size < 1) throw fail('source_unreadable')
    if (blob.size > LIMITS.maxBodyBytes) throw fail('source_too_large')
    const digestBytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
    const digest = Array.from(new Uint8Array(digestBytes), byte => byte.toString(16).padStart(2, '0')).join('')
    return { blob, digest, previewUrl: URL.createObjectURL(blob) }
  } catch (error) {
    if (['source_too_large', 'source_unreadable'].includes(error?.code)) throw error
    throw fail('source_unreadable')
  } finally { bitmap?.close() }
}
