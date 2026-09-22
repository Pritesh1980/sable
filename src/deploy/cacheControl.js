// Cache headers for the S3 + CloudFront deploy (#6).
//
// Pure and unit-tested here; scripts/deployAws.mjs is the thin half that talks
// to the AWS CLI — same split as src/a11y/touchTargets.js behind
// scripts/auditTouchTargets.mjs.
//
// Headers are set on the S3 objects at upload time rather than through
// CloudFront cache policies, so the same rule reaches the browser and the edge
// and there is one place to read it.

export const IMMUTABLE = 'public, max-age=31536000, immutable'
export const NO_CACHE = 'no-cache, must-revalidate'
export const SHORT = 'public, max-age=300, must-revalidate'
export const MEDIA = 'public, max-age=86400'

// Vite writes assets/<name>-<hash>.<ext>, where <hash> is 8 characters of
// base64url — so it can itself contain `-` and `_` (blobUrls-4DMLQ-yb.js).
// The width is fixed at exactly 8 on purpose: `{8,}` would also swallow an
// ordinary hyphenated name like `my-component-file.js` and pin it for a year.
// If Vite's hash length ever changes, assets fall back to SHORT — a caching
// regression, not a correctness bug, which is the right way round to fail.
const HASHED = /^assets\/.+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/

// dist/sw.js changes every build (the precache manifest is injected into it),
// but CACHE_NAME inside it is hand-bumped — so a new service worker is only
// picked up when the browser sees different bytes here. index.html names the
// hashed entry bundles. Either one served stale pins the app to a dead build,
// silently and with nothing in the console to explain it.
const ALWAYS_REVALIDATE = new Set(['sw.js', 'index.html', '404.html'])

// Replaced in place under stable filenames, so cacheable but never immutable.
const MEDIA_DIRS = ['images/', 'guide/', 'icons/']

export function cacheControlFor(path) {
  const key = String(path).replace(/^\/+/, '')
  if (ALWAYS_REVALIDATE.has(key)) return NO_CACHE
  if (HASHED.test(key)) return IMMUTABLE
  if (MEDIA_DIRS.some((dir) => key.startsWith(dir))) return MEDIA
  return SHORT
}

// Hashed assets never need purging — a new build writes new filenames — so the
// invalidation list is just the stable entry points. Keeping it to a handful
// also keeps every deploy inside CloudFront's 1,000 free paths a month.
export const INVALIDATION_PATHS = ['/', '/index.html', '/sw.js', '/manifest.json']
