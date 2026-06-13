// Source of truth for how the service worker routes a fetch. Kept as a pure,
// testable function; public/sw.js mirrors this logic inline (it can't import an
// ESM module), and src/test/swStrategy.test.js guards that file against drift.
//
//   'bypass'        — leave it to the network: non-GET, or any cross-origin
//                     request (auth, the per-user document store, signed image
//                     URLs — caching those could serve stale or another user's data).
//   'network-first' — navigations / the HTML document: always fetch fresh so a
//                     new deploy is reflected immediately, falling back to the
//                     cached shell only when offline. This is what stops a stale
//                     build (or a stale pre-auth bundle) from being served.
//   'cache-first'   — same-origin static assets (hashed JS/CSS, icons, bundled
//                     images): fast, with a background refresh so they self-heal.
export function swStrategy({ method, mode, destination, sameOrigin }) {
  if (method !== 'GET') return 'bypass'
  if (!sameOrigin) return 'bypass'
  if (mode === 'navigate' || destination === 'document') return 'network-first'
  return 'cache-first'
}
