const CACHE_NAME = 'tattoo-v1'
const STATIC_ASSETS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Only ever cache same-origin static assets. Cross-origin requests — the auth
  // backend, the per-user document store, and signed image URLs — must bypass
  // the cache entirely: caching them could serve another user's data, return
  // stale results, or mask 401s. Those always go straight to the network.
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((res) => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return res
      })
      return cached || network
    })
  )
})
