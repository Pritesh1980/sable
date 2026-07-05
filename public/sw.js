// Bump on ANY caching-behaviour change so the old cache is dropped on activate.
// v1 was cache-first for navigations, which served stale builds (and once a stale
// pre-auth bundle that skipped the login gate) after a deploy. v2 is network-first
// for navigations. v3 additionally runtime-caches Google Fonts so the app renders
// with its real typography offline. Routing logic mirrors src/sw/swStrategy.js
// (guarded by src/test/swStrategy.test.js).
const CACHE_NAME = 'tattoo-v3'
const APP_SHELL = '/index.html'
const PRECACHE = ['/', APP_SHELL]

// The one cross-origin exception we cache: Google Fonts CSS + woff2 files.
// Immutable/versioned and safe to serve stale; caching them makes fonts work
// offline after the first load.
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com']

self.addEventListener('install', (event) => {
  // Activate as soon as installed so a new deploy isn't stuck behind old tabs.
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
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
        .catch(() => caches.match(APP_SHELL).then((cached) => cached || caches.match('/')))
    )
    return
  }

  // Static assets (hashed JS/CSS incl. the lazily split three.js chunk, icons,
  // bundled images) and Google Fonts (CSS + woff2): cache-first with a
  // background refresh so they stay fast, self-heal, and work offline.
  event.respondWith(
    caches.match(request).then((cached) => {
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
