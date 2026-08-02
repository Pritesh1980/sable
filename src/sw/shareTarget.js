// Web Share Target plumbing, kept pure so it can be unit-tested — public/sw.js
// is not bundled and cannot be imported by the suite (see the contract test in
// src/test/swShareTarget.test.js).
//
// A share_target that accepts files must use method POST, and a static host
// (GitHub Pages) cannot answer a POST. The service worker therefore intercepts
// the request itself, stashes the shared image in a cache, and redirects to a
// normal GET the SPA can render. The page then reads the stash.
//
// Platform note: WebKit has never shipped Web Share Target
// (https://bugs.webkit.org/show_bug.cgi?id=194593), so on iOS this path is
// dead and the same landing route doubles as the paste target reached from an
// iOS Shortcut. See docs/02-managing-artists.md.

// Versioned separately from the asset caches so the SW's stale-bucket cleanup
// leaves it alone.
export const SHARE_CACHE = 'sable-share-v1'

// A POST to <base>share is a share; a GET to the same path is someone landing
// on it (the redirect target, or the iOS Shortcut opening the app).
export function isShareTargetRequest(method, url, base) {
  if (method !== 'POST') return false
  try {
    return new URL(url).pathname === `${base}share`
  } catch {
    return false
  }
}

export function shareLandingUrl(base) {
  return `${base}share?shared=1`
}

// Where the SW parks the shared bytes for the page to collect. Inside the app's
// own scope so it is same-origin for the client.
export function shareStashUrl(base) {
  return `${base}share-stash/latest`
}

// A share sheet can hand over several items, and empty slots. Take the first
// actual image; anything else is not something intake can read.
export function pickSharedImage(files) {
  if (!Array.isArray(files)) return null
  return files.find((f) => f && typeof f.type === 'string' && f.type.startsWith('image/')) || null
}

// Client side: collect what the worker stashed, exactly once. Reading clears
// it, so reloading the landing route doesn't re-attach the same screenshot.
// Never throws — it runs on every ?shared=1 visit, and Safari can be without a
// Cache API entirely (private browsing).
export async function takeSharedImage(base, cacheStore = globalThis.caches) {
  if (!cacheStore || typeof cacheStore.open !== 'function') return null
  try {
    const url = shareStashUrl(base)
    const cache = await cacheStore.open(SHARE_CACHE)
    const hit = await cache.match(url)
    if (!hit) return null
    await cache.delete(url)
    const blob = await hit.blob()
    const type = blob.type || hit.headers?.get?.('Content-Type') || 'image/png'
    return new File([blob], 'shared-screenshot', { type })
  } catch {
    return null
  }
}
