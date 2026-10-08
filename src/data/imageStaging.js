import { backend } from '../backend'
import { keyForUrl, registerBlobUrl } from './blobUrls'
import { randomId } from './randomId'
import {
  addToOutbox,
  markDeviceCopy,
  deleteStagedBytes,
  getStagedBytes,
  putStagedBytes,
  readOutbox,
  removeFromOutbox,
} from './stagedImageStore'

// Durable image staging and the upload outbox (#115).
//
// Every photo that enters a synced collection comes through stageImage before
// its key enters state: the bytes are written to this device under a freshly
// minted key, the key is queued for upload, and only then is the key handed
// back. So a photo added while uploads fail (offline, the backend paused)
// still has a key the cache and the remote can carry, and bytes this device
// can show — resolveBlobKey reads staged bytes before asking the backend —
// across reloads, until the upload lands. A confirmed upload drops the staged
// copy: from then on the backend is where the bytes live, exactly as for a
// photo uploaded straight away. The outbox is retried on every sync flush and
// whenever the browser reports it is back online (watchUploadOutbox).
//
// With the local backend the "upload" is itself an IndexedDB write, so a
// photo is staged and confirmed in the same moment; the path is the same.
//
// Until state holds refs (#116, #117), the URL handed back for display is the
// data URL itself, registered against the key, so saving maps it back to
// { key } and every existing consumer keeps working.

export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  return new Blob([decodeBase64(b64)], { type: mimeOf(meta) })
}

// The "data:image/png;base64" part of a data URL.
function metaOf(dataUrl) {
  return dataUrl.slice(0, Math.max(0, dataUrl.indexOf(',')))
}

// "data:image/png;base64" -> "image/png", by index rather than a lazy regex.
function mimeOf(meta) {
  const colon = meta.indexOf(':')
  const semi = meta.indexOf(';', colon + 1)
  return (colon >= 0 && semi > colon ? meta.slice(colon + 1, semi) : '') || 'image/jpeg'
}

// What every producer makes — canvas, FileReader, the image APIs. A hand-typed
// non-base64 data URL is left as it is, as before staging existed.
function isBase64DataUrl(url) {
  return typeof url === 'string' && url.startsWith('data:') && metaOf(url).endsWith(';base64')
}

function decodeBase64(b64) {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

const urlOf = (image) => (typeof image === 'string' ? image : image?.url)

// Whether an image still needs staging before it can enter state: an inline
// data URL with no key yet, and someone signed in to own it.
export function needsStaging(image, { userId } = {}) {
  const url = urlOf(image)
  return Boolean(userId) && isBase64DataUrl(url) && !keyForUrl(url)
}

function mintKey({ userId, scope, id }) {
  return `user/${userId}/${scope}/${id || 'misc'}/${randomId()}.jpg`
}

// Uploads in flight, by key, so overlapping drains send each photo once.
const inflight = new Map()

// One upload attempt for an outbox entry; true once the backend has the bytes.
// `dataUrl` saves a read when the caller already holds them. Bytes that are no
// longer on this device (a confirmed upload's leftover entry, eviction) leave
// nothing to send, so the entry is dropped; a store that can't be read leaves
// it queued for the next attempt.
function attemptUpload(entry, dataUrl) {
  const running = inflight.get(entry.key)
  if (running) return running
  const attempt = (async () => {
    let bytes = dataUrl
    if (!bytes) {
      try {
        bytes = await getStagedBytes(entry.key)
      } catch (e) {
        console.error('[tattoo] could not read a staged image; will retry:', entry.key, e)
        return false
      }
      if (!bytes) {
        removeFromOutbox(entry.key)
        return false
      }
    }
    try {
      await backend.blobs.upload(entry.userId, entry.key, dataUrlToBlob(bytes), entry.contentType)
    } catch (e) {
      console.error('[tattoo] image upload failed; kept on this device to retry:', entry.key, e)
      return false
    }
    // The device copy stays after a confirmed upload: the display cache holds
    // only { key }, so these bytes are what keeps the photo visible on an
    // offline reload (as the old data-URL cache did). Purged on sign-out.
    removeFromOutbox(entry.key)
    return true
  })().finally(() => inflight.delete(entry.key))
  inflight.set(entry.key, attempt)
  return attempt
}

// Stages one photo — a data URL or a Blob — and resolves to { key, url }: the
// new key and the URL to put in state. Never rejects. Signed out there is
// nowhere to upload to, so the data URL comes back unregistered (key: null),
// as before staging existed. If the bytes can't be kept on this device it
// falls back to uploading directly, and failing that hands the photo back
// unregistered too — a key with no bytes anywhere would be worse than a photo
// that is only on screen.
export async function stageImage(input, { userId, scope, id } = {}) {
  let dataUrl
  try {
    dataUrl = typeof input === 'string' ? input : await blobToDataUrl(input)
  } catch (e) {
    console.error('[tattoo] could not read an image to stage:', e)
    return { key: null, url: '', failed: true }
  }
  if (!userId || !isBase64DataUrl(dataUrl)) return { key: null, url: dataUrl }
  const entry = {
    key: mintKey({ userId, scope, id }),
    userId,
    contentType: mimeOf(metaOf(dataUrl)),
    stagedAt: new Date().toISOString(),
  }
  try {
    await putStagedBytes(entry.key, dataUrl)
    markDeviceCopy(entry.key)
    addToOutbox(entry)
  } catch (e) {
    console.error('[tattoo] could not stage an image; uploading it directly:', e)
    deleteStagedBytes(entry.key).catch(() => {})
    return uploadDirectly(entry, dataUrl)
  }
  registerBlobUrl(entry.key, dataUrl)
  void attemptUpload(entry, dataUrl)
  return { key: entry.key, url: dataUrl }
}

async function uploadDirectly(entry, dataUrl) {
  try {
    await backend.blobs.upload(entry.userId, entry.key, dataUrlToBlob(dataUrl), entry.contentType)
  } catch (e) {
    console.error('[tattoo] image upload failed:', e)
    return { key: null, url: '', failed: true }
  }
  registerBlobUrl(entry.key, dataUrl)
  return { key: entry.key, url: dataUrl }
}

// The display URL for each photo, staged in order.
// A photo that could be neither kept nor uploaded is left out: handing back
// its base64 would put it in persisted state.
export async function stageImages(dataUrls = [], ctx) {
  const results = await Promise.all(Array.from(dataUrls, (dataUrl) => stageImage(dataUrl, ctx)))
  if (results.some((r) => r.failed)) reportStagingFailure()
  return results.filter((r) => !r.failed).map((r) => r.url)
}

function reportStagingFailure() {
  const message = "Couldn't save that photo: this device can't store it and you're offline. Try again when you're back online."
  if (typeof globalThis.alert === 'function') globalThis.alert(message)
}

// The stored ref for a staged photo: its key, or the url itself when there was
// nothing to stage (signed out, or not an inline photo).
const stagedRef = (result) => (result.key ? { key: result.key } : { url: result.url })

// stageImages, returning stored refs for state instead of display urls.
export async function stageImageRefs(dataUrls = [], ctx) {
  const results = await Promise.all(Array.from(dataUrls, (dataUrl) => stageImage(dataUrl, ctx)))
  if (results.some((r) => r.failed)) reportStagingFailure()
  return results.filter((r) => !r.failed).map(stagedRef)
}

// Runs `commit(keys)` once every inline photo in `images` (URLs or { url }
// refs) is staged: keys[i] is the key for images[i], or '' when that image
// needed no staging. With nothing to stage — no inline photo, or nobody signed
// in — it commits at once, synchronously, exactly as the caller did before
// staging existed.
export function withStagedImages(images = [], ctx, commit) {
  const inline = images.map((image) => needsStaging(image, ctx))
  if (!inline.some(Boolean)) {
    commit(images.map(() => ''))
    return undefined
  }
  return Promise.all(
    images.map((image, i) => (inline[i] ? stageImage(urlOf(image), ctx) : null)),
  ).then((results) => {
    // Nothing is committed for a photo that failed to stage: its base64 would
    // reach persisted state.
    if (results.some((r) => r?.failed)) reportStagingFailure()
    else commit(results.map((r) => r?.key || ''))
  })
}

// An inline photo found in stored data (saved before staging existed, or while
// signed out) is staged once per session: a second pass over the same rows —
// after an edit raced the first — gets the same key back, not a second copy.
const stagedInline = new Map() // `${userId}\n${dataUrl}` -> Promise<key|null>
export function stageInlineOnce(dataUrl, { userId, scope, id } = {}) {
  if (!userId || !isBase64DataUrl(dataUrl)) return Promise.resolve(null)
  const memo = `${userId}\n${dataUrl}`
  if (!stagedInline.has(memo)) {
    // A failure is not remembered: the next flush tries again.
    stagedInline.set(memo, stageImage(dataUrl, { userId, scope, id }).then((r) => {
      if (!r.key) stagedInline.delete(memo)
      return r.key || null
    }))
  }
  return stagedInline.get(memo)
}

// Retries every queued upload belonging to `userId`. Resolves to how many
// landed and how many are still waiting; never rejects. While the browser says
// it is offline there is no point reading every staged photo back only to fail
// each upload; the `online` event (watchUploadOutbox) brings it back here.
export async function drainOutbox({ userId } = {}) {
  if (!userId) return { uploaded: 0, pending: 0 }
  const mine = readOutbox().filter((entry) => entry.userId === userId)
  if (globalThis.navigator?.onLine === false) return { uploaded: 0, pending: mine.length }
  let uploaded = 0
  for (const entry of mine) {
    if (await attemptUpload(entry)) uploaded += 1
  }
  const pending = readOutbox().filter((entry) => entry.userId === userId).length
  return { uploaded, pending }
}

// Drains the outbox now — an app opened with photos still queued — and again
// whenever the browser reports it is back online. Returns the unsubscribe.
export function watchUploadOutbox(userId) {
  if (!userId || typeof window === 'undefined') return () => {}
  const drain = () => { void drainOutbox({ userId }) }
  drain()
  window.addEventListener('online', drain)
  return () => window.removeEventListener('online', drain)
}
