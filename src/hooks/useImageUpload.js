import { stageImage, stageImages } from '../data/imageStaging'

// Kept here for the callers that already import it from this module.
export { dataUrlToBlob } from '../data/imageStaging'

function compressImage(file, maxDim = 900, quality = 0.78) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

export async function compressImages(files) {
  return Promise.all(Array.from(files).map((f) => compressImage(f)))
}

// Compress the given files and stage each under a canonical per-user key
// (src/data/imageStaging.js): the bytes are kept on this device and queued for
// upload before this returns, so a photo added while uploads fail still
// survives a reload (#115). Returns the displayable URL strings; callers store
// them exactly as they stored compressImages() output before, and the storage
// hooks map them back to keys on persist. Signed out, the compressed data URLs
// come back unregistered, as they always did. `scope` is one of
// 'artists' | 'ideas' | 'concepts'.
export async function uploadImages(files, { userId, scope, id }) {
  return stageImages(await compressImages(files), { userId, scope, id })
}

// Stage an already-compressed data URL (no re-compression) and return its key,
// or null if it couldn't or shouldn't be staged. Used by the storage-layer
// image codecs to move inline data URLs out of documents.
export async function uploadDataUrl(dataUrl, { userId, scope, id }) {
  if (!userId || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return null
  return (await stageImage(dataUrl, { userId, scope, id })).key
}
