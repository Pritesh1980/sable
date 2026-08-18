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
  // Never let the margin swallow the whole TTL — an unexpectedly short TTL
  // (a future backend, a misconfiguration) must not make every fresh entry
  // stale on arrival and thrash the backend on every call.
  const margin = Math.min(REFRESH_MARGIN_MS, ttlMs / 2)
  return Date.now() - entry.cachedAt < ttlMs - margin
}

export function registerBlobUrl(key, url) {
  if (!key) return
  // Drop the old url's reverse mapping first — a key that gets re-resolved
  // over a long session (every TTL refresh) would otherwise pile up entries
  // for urls nothing points to any more.
  const previous = keyToEntry.get(key)
  if (previous?.url) urlToKey.delete(previous.url)
  keyToEntry.set(key, { url, cachedAt: Date.now() })
  if (url) urlToKey.set(url, key)
}

// Synchronous cache peek for render paths that can't await resolveBlobKey. A
// stale entry is never handed back (it would eventually 403) — instead this
// starts a background refresh for next time and reports unresolved, the same
// as a key that was never cached at all.
export function getCachedBlobUrl(key) {
  const cached = keyToEntry.get(key)
  if (!cached) return ''
  if (isFresh(cached)) return cached.url
  resolveBlobKey(key)
  return ''
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
      // A transient failure (offline for a moment right at the refresh
      // margin) shouldn't blank an image that was still displaying fine a
      // moment ago — fall back to whatever was last cached, stale or not,
      // over surfacing a broken image for a URL that may still work.
      return cached?.url || ''
    })
  inflight.set(key, p)
  return p
}

// A resolved URL already baked into long-lived React state (#82) can go
// stale even though the cache above stays TTL-honest (#29) — nothing
// re-derives a value already sitting in state, so an hour-plus-idle session
// can end up rendering an <img> whose src is a genuinely expired signed URL.
// Call this from that <img>'s onError: given the URL that just failed, hand
// back a fresh one if the underlying key can actually produce a different
// one (whether that's an already-refreshed cache entry or a real refetch),
// or null if there's nothing more to try — a url with no known key, or one
// the cache still considers fresh, is a genuinely broken image, not an
// expiry, and the caller should fall through to its normal broken-image
// handling rather than retry forever.
export async function refreshedBlobUrl(failedUrl) {
  const key = keyForUrl(failedUrl)
  if (!key) return null
  const fresh = await resolveBlobKey(key)
  return fresh && fresh !== failedUrl ? fresh : null
}

export function clearBlobUrls() {
  keyToEntry.clear()
  urlToKey.clear()
  inflight.clear()
}
