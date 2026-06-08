import { backend } from '../backend'

// Resolved-URL cache for blob-backed images. Image *keys* are the canonical,
// synced reference (small, vendor-neutral); a displayable URL is short-lived and
// derived at runtime via backend.blobs.getUrl. The storage hooks resolve keys to
// URL strings on load so the rest of the app keeps rendering plain string srcs,
// and map URL strings back to keys on persist via the reverse map.

const keyToUrl = new Map()
const urlToKey = new Map()
const inflight = new Map()

export function registerBlobUrl(key, url) {
  if (!key) return
  keyToUrl.set(key, url)
  if (url) urlToKey.set(url, key)
}

export function getCachedBlobUrl(key) {
  return keyToUrl.get(key) || ''
}

// Reverse lookup: given a resolved/display URL, the canonical key it came from
// (or null for static paths / external URLs that were never uploaded).
export function keyForUrl(url) {
  return urlToKey.get(url) || null
}

// Resolve a key to a displayable URL, caching the result and de-duping in-flight
// requests for the same key.
export async function resolveBlobKey(key) {
  if (!key) return ''
  if (keyToUrl.has(key)) return keyToUrl.get(key)
  if (inflight.has(key)) return inflight.get(key)
  const p = backend.blobs
    .getUrl(key)
    .then((url) => {
      registerBlobUrl(key, url)
      inflight.delete(key)
      return url
    })
    .catch((e) => {
      inflight.delete(key)
      console.error('[tattoo] blob resolve failed:', key, e)
      return ''
    })
  inflight.set(key, p)
  return p
}

export function clearBlobUrls() {
  keyToUrl.clear()
  urlToKey.clear()
  inflight.clear()
}
