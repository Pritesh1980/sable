import { backend } from '../backend'

// Resolved-URL cache for blob-backed images. Image *keys* are the canonical,
// synced reference (small, vendor-neutral); a displayable URL is short-lived and
// derived at runtime via backend.blobs.getUrl. The storage hooks resolve keys to
// URL strings on load so the rest of the app keeps rendering plain string srcs,
// and map URL strings back to keys on persist via the reverse map.

// How much earlier than the backend's own TTL to treat a cached URL as due
// for a refresh (#29) — small compared to real TTLs (Supabase signed URLs are
// 1h), just enough to avoid handing out a URL that expires moments later.
const REFRESH_MARGIN_MS = 60_000

const keyToEntry = new Map() // key -> { url, cachedAt }
const urlToKey = new Map()
const inflight = new Map()

// Only some backends' URLs expire (Supabase signed URLs; `urlTtlMs` on
// backend.blobs). Others — local's data: URLs, browser object URLs — have no
// such field, and a cache entry for them is always fresh regardless of age.
function isFresh(entry) {
  const ttlMs = backend.blobs?.urlTtlMs
  if (!ttlMs) return true
  return Date.now() - entry.cachedAt < ttlMs - REFRESH_MARGIN_MS
}

export function registerBlobUrl(key, url) {
  if (!key) return
  keyToEntry.set(key, { url, cachedAt: Date.now() })
  if (url) urlToKey.set(url, key)
}

export function getCachedBlobUrl(key) {
  return keyToEntry.get(key)?.url || ''
}

// Reverse lookup: given a resolved/display URL, the canonical key it came from
// (or null for static paths / external URLs that were never uploaded).
export function keyForUrl(url) {
  return urlToKey.get(url) || null
}

// Resolve a key to a displayable URL, caching the result and de-duping in-flight
// requests for the same key. A cache hit past the backend's TTL is treated as a
// miss so a long-running session refreshes an expiring signed URL rather than
// holding a broken one indefinitely (#29).
export async function resolveBlobKey(key) {
  if (!key) return ''
  const cached = keyToEntry.get(key)
  if (cached && isFresh(cached)) return cached.url
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
  keyToEntry.clear()
  urlToKey.clear()
  inflight.clear()
}
