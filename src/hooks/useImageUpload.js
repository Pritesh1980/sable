import { backend } from '../backend'
import { registerBlobUrl } from '../data/blobUrls'

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

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/jpeg'
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
export async function uploadImages(files, { userId, scope, id }) {
  const dataUrls = await compressImages(files)
  // No signed-in user → keep the compressed data-URLs locally (they live in the
  // offline cache and get migrated to blobs on the next authed load).
  if (!userId) return dataUrls
  return Promise.all(
    dataUrls.map(async (dataUrl) => {
      const key = `user/${userId}/${scope}/${id}/${uuid()}.jpg`
      try {
        await backend.blobs.upload(userId, key, dataUrlToBlob(dataUrl), 'image/jpeg')
        registerBlobUrl(key, dataUrl)
      } catch (e) {
        console.error('[tattoo] image upload failed:', e)
      }
      return dataUrl
    })
  )
}
