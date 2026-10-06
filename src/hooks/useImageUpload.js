import { stageImage, stageImages } from '../data/imageStaging'

// Kept here for the callers that already import it from this module.
export { dataUrlToBlob } from '../data/imageStaging'

function compressImage(file, maxDim = 900, quality = 0.78) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read this photo'))
    reader.onabort = () => reject(new Error('Photo reading was cancelled'))
    reader.onload = (e) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Could not decode this photo'))
      img.onload = () => {
        try {
          const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch (error) { reject(error) }
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export async function compressImages(files) {
  return Promise.all(Array.from(files).map((f) => compressImage(f)))
}

// Capture requires every photo to be durable before committing the artist.
// Local staging counts as success even while the upload outbox is offline.
export async function uploadImages(files, { userId, scope, id, requireStored = false }) {
  if (requireStored && !userId) throw new Error('Photo owner unavailable')
  const dataUrls = await compressImages(files)
  if (!requireStored) return stageImages(dataUrls, { userId, scope, id })
  const results = await Promise.all(dataUrls.map((url) => stageImage(url, { userId, scope, id })))
  if (results.some((result) => result.failed || !result.key)) throw new Error('Could not store this photo')
  return results.map((result) => result.url)
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  // "data:image/png;base64" -> "image/png", by index rather than a lazy regex.
  const colon = meta.indexOf(':')
  const semi = meta.indexOf(';', colon + 1)
  const mime = (colon >= 0 && semi > colon ? meta.slice(colon + 1, semi) : '') || 'image/jpeg'
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// Compress the given files, upload each to blob storage under a canonical
// per-user key, register the resolved URL in the cache, and return the
// displayable URL strings. Callers store these strings exactly as they stored
// compressImages() output before; the storage hooks map them back to keys on
// persist. `scope` is one of 'artists' | 'ideas' | 'concepts'.
export async function uploadImages(files, { userId, scope, id, requireStored = false }) {
  if (requireStored && !userId) throw new Error('Photo owner unavailable')
  const owner = requireStored ? backend.ownerScope.capture() : null
  const dataUrls = await compressImages(files)
  if (owner) backend.ownerScope.assertCurrent(owner)
  // No signed-in user → keep the compressed data-URLs locally (they live in the
  // offline cache and get migrated to blobs on the next authed load).
  if (!userId) return dataUrls
  return Promise.all(
    dataUrls.map(async (dataUrl) => {
      const key = `user/${userId}/${scope}/${id}/${uuid()}.jpg`
      try {
        if (owner) backend.ownerScope.assertCurrent(owner)
        await backend.blobs.upload(userId, key, dataUrlToBlob(dataUrl), 'image/jpeg')
        if (owner) backend.ownerScope.assertCurrent(owner)
        registerBlobUrl(key, dataUrl)
      } catch (e) {
        if (requireStored) throw e
        console.error('[tattoo] image upload failed:', e)
      }
      return dataUrl
    })
  )
>>>>>>> 9a52b7f (feat(intake): unify and protect artist capture)
}

// Stage an already-compressed data URL (no re-compression) and return its key,
// or null if it couldn't or shouldn't be staged. Used by the storage-layer
// image codecs to move inline data URLs out of documents.
export async function uploadDataUrl(dataUrl, { userId, scope, id }) {
  if (!userId || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  return (await stageImage(dataUrl, { userId, scope, id })).key
}
