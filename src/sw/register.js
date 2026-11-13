// Service-worker registration, kept out of main.jsx so it can be unit-tested.
//
// Production: register under the deploy base on load, and when a new worker
// takes control (after a deploy) reload once so the page swaps to the fresh
// assets — but not on the first-ever visit (no prior controller).
//
// Dev (`vite dev`): never register. public/sw.js serves same-origin GETs
// cache-first, and dev module URLs (/src/backend/index.js) never change, so a
// cached copy outlives every edit and .env change. Any worker left behind by an
// earlier dev session is removed along with its caches, and the page reloads
// once onto fresh modules if that worker was serving it.
export function setupServiceWorker({
  serviceWorker = globalThis.navigator?.serviceWorker,
  caches = globalThis.caches,
  win = globalThis.window,
  dev,
  base,
}) {
  if (!serviceWorker) return

  if (dev) return removeDevWorkers({ serviceWorker, caches, win })

  const hadController = !!serviceWorker.controller
  let reloading = false
  serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return
    reloading = true
    win.location.reload()
  })
  win.addEventListener('load', () => {
    // base is the deploy base ('/' or '/sable/'); the SW lives beside
    // index.html and its scope must match, so register it under the base.
    serviceWorker.register(`${base}sw.js`).catch(() => {})
  })
}

async function removeDevWorkers({ serviceWorker, caches, win }) {
  try {
    const wasControlled = !!serviceWorker.controller
    const registrations = await serviceWorker.getRegistrations()
    await Promise.all(registrations.map((r) => r.unregister()))
    if (caches) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
    // After unregistering, the reloaded page is uncontrolled, so this runs once.
    if (wasControlled && registrations.length > 0) win.location.reload()
  } catch {
    // Best effort: a failed cleanup must never block the dev app from booting.
  }
}
