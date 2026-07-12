// Bump on ANY caching-behaviour change so the old cache is dropped on activate.
// v1 was cache-first for navigations, which served stale builds (and once a stale
// pre-auth bundle that skipped the login gate) after a deploy. v2 is network-first
// for navigations. v3 additionally runtime-caches Google Fonts so the app renders
// with its real typography offline. v4 precaches the built assets on install
// (manifest injected at build time), so the app works offline after a single
// visit. Routing logic mirrors src/sw/swStrategy.js (guarded by
// src/test/swStrategy.test.js); precache logic mirrors src/sw/precache.js
// (guarded by src/test/precache.test.js).
const CACHE_NAME = 'tattoo-v4'
const APP_SHELL = '/index.html'
const PRECACHE = ['/', APP_SHELL]

// Filled by scripts/precachePlugin.js during `vite build`; empty in dev, where
// there is no hashed build output to precache.
const BUILD_MANIFEST = /* __PRECACHE_MANIFEST__ */ []

// The one cross-origin exception we cache: Google Fonts CSS + woff2 files.
// Immutable/versioned and safe to serve stale; caching them makes fonts work
// offline after the first load.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (event) => {
  // Activate as soon as installed so a new deploy isn't stuck behind old tabs.
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // The shell must cache (addAll rejects install if it fails); the build
      // manifest is best-effort — one missing asset must not brick install.
      cache
        .addAll(PRECACHE)
        .then(() => Promise.allSettled(BUILD_MANIFEST.map((url) => cache.add(url))))
    )
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() =>
        // Sweep hashed /assets/ entries that are not in the current build's
        // manifest — content-hashed filenames from older builds are
        // unreachable and would otherwise accumulate forever. Mirrors
        // isObsoleteAsset in src/sw/precache.js.
        caches.open(CACHE_NAME).then((cache) =>
          cache.keys().then((requests) =>
            Promise.all(
              requests
                .filter((req) => {
                  const path = new URL(req.url).pathname
                  return path.startsWith('/assets/') && !BUILD_MANIFEST.includes(path)
                })
                .map((req) => cache.delete(req))
            )
          )
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const isFont = FONT_HOSTS.includes(url.hostname)
  // Cross-origin (auth backend, per-user document store, signed image URLs) must
  // never be cached — bypass entirely. Google Fonts are the sole exception and
  // fall through to the cache-first block below.
  if (!isFont && url.origin !== self.location.origin) return

  const isNavigation = request.mode === 'navigate' || request.destination === 'document'

  if (isNavigation) {
    // Network-first: always reflect the latest deploy; fall back to the cached
    // shell only when offline.
    event.respondWith(
      fetch(request)
        .then((res) => {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(APP_SHELL, clone))
          return res
        })
        // Offline: serve the one canonical shell network-first keeps current, so
        // every SPA route falls back to the same up-to-date HTML.
        .catch(() =>
          caches
            .match(APP_SHELL, { ignoreVary: true })
            .then((cached) => cached || caches.match('/', { ignoreVary: true }))
        )
    )
    return
  }

  // Static assets (hashed JS/CSS incl. the lazily split three.js chunk, icons,
  // bundled images) and Google Fonts (CSS + woff2): cache-first with a
  // background refresh so they stay fast, self-heal, and work offline.
  // ignoreVary: hosts (e.g. vite preview, some CDNs) send `Vary: Origin`, and
  // the page's crossorigin module scripts carry an Origin header while the
  // install-time precache fetches don't — without ignoreVary those precached
  // entries would never match and offline would break. Everything in this
  // cache is same-origin static or immutable font content, so URL identity
  // is sufficient.
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
          }
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
