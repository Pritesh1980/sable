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

// `base` is the deploy path ('/' at a root host, '/sable/' on GitHub Pages) —
// the same value Vite prepends to built asset URLs, so cached keys match what
// the browser actually requests.
export function selectPrecacheAssets(files, base = '/') {
  const urls = files
    .filter((f) => INCLUDE.some((re) => re.test(f)))
    .map((f) => `${base}${f}`)
  return [...new Set(urls)].sort()
}

// Only hashed build output under `<base>assets/` is safe to sweep: anything from
// an older build is unreachable (filenames are content-hashed). Everything else
// in the cache (shell, fonts, runtime-cached icons/images) stays.
export function isObsoleteAsset(pathname, manifest, base = '/') {
  return pathname.startsWith(`${base}assets/`) && !manifest.includes(pathname)
}
