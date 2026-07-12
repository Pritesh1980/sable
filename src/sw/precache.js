// Pure logic behind the build-time precache manifest. The Vite plugin
// (scripts/precachePlugin.js) uses selectPrecacheAssets to decide what goes
// into the manifest it injects into dist/sw.js; public/sw.js mirrors
// isObsoleteAsset inline for its activate-time cleanup (guarded by
// src/test/precache.test.js, same pattern as swStrategy).

// Precache-worthy: the hashed build output plus the small PWA shell files.
// Deliberately NOT precached:
//   index.html / '/'  — already precached as APP_SHELL, served network-first
//   sw.js             — the browser manages the SW script itself
//   audit.html        — local curation tool, not part of the app
//   images/**         — artist reference images; local-only and potentially huge
//   guide/**          — doc screenshots; runtime-cached on demand
const INCLUDE = [/^assets\/.+\.(js|css)$/, /^icons\/.+/, /^(manifest\.json|favicon\.svg|icons\.svg)$/]

export function selectPrecacheAssets(files) {
  const urls = files
    .filter((f) => INCLUDE.some((re) => re.test(f)))
    .map((f) => `/${f}`)
  return [...new Set(urls)].sort()
}

// Only hashed build output under /assets/ is safe to sweep: anything from an
// older build is unreachable (filenames are content-hashed). Everything else
// in the cache (shell, fonts, runtime-cached icons/images) stays.
export function isObsoleteAsset(pathname, manifest) {
  return pathname.startsWith('/assets/') && !manifest.includes(pathname)
}
