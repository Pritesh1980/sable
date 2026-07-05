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
//   'cache-first'   — same-origin static assets (hashed JS/CSS incl. the lazily
//                     split three.js chunk, icons, bundled images) AND Google
//                     Fonts (see FONT_HOSTS): fast, with a background refresh so
//                     they self-heal — and so fonts work offline after first load.

// Google Fonts hosts are the one cross-origin exception we cache: the CSS
// (googleapis) and the woff2 files (gstatic). They're immutable/versioned and
// safe to serve stale, and caching them is what makes the app render with its
// real typography offline.
export const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

export function swStrategy({ method, mode, destination, sameOrigin, host }) {
  if (method !== 'GET') return 'bypass'
  if (FONT_HOSTS.includes(host)) return 'cache-first'
  if (!sameOrigin) return 'bypass'
  if (mode === 'navigate' || destination === 'document') return 'network-first'
  return 'cache-first'
}
