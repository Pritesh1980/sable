import { getCachedBlobUrl, resolveBlobKey } from './blobUrls'
import { resolveAssetPath } from './assetPath'
import { refKey } from './imageRef'

// The one place a stored image ref becomes something an <img> can show (#113).
// Components and selectors hold refs and resolve at the leaf; nothing upstream
// needs to know whether a ref is a static path, a display URL or a blob key.
//
// Today state still carries display strings, so those pass straight through
// (with the deploy base applied to static paths). Blob keys read the URL cache
// synchronously and fall back to the backend — the shape state moves to in
// #116/#117, which then needs no change here.

// status: 'ready'       — src is displayable now
//         'loading'     — a blob key not in the cache yet; resolveImage fills it
//         'none'        — the ref holds nothing to show
// ('unavailable' is what a caller reports once resolveImage settles on ''.)
export function resolveImageRef(ref) {
  const key = refKey(ref)
  if (key) {
    const src = safeSrc(getCachedBlobUrl(key))
    return src ? { status: 'ready', src } : { status: 'loading', src: '' }
  }
  const src = displayString(ref)
  return src ? { status: 'ready', src } : { status: 'none', src: '' }
}

// Resolves to a displayable src, or '' when there is none — never rejects, so
// a caller cannot be left without a status by an unexpected backend failure.
export async function resolveImage(ref) {
  try {
    const key = refKey(ref)
    return key ? safeSrc(await resolveBlobKey(key)) : displayString(ref)
  } catch {
    return ''
  }
}

// Starts resolving every blob key in `refs`, so the first render after a load
// or a pull finds them in the cache. Fire and forget: a key that cannot be
// resolved is reported by whoever renders it.
export function warmImageCache(refs = []) {
  for (const ref of refs) {
    const key = refKey(ref)
    if (key) void resolveBlobKey(key).catch(() => {})
  }
}

// The photo's bytes, or null when they cannot be read right now (offline, an
// expired url, a missing key). For consumers that need the bytes themselves —
// backup export, and the pixel consumers that must not read cross-origin
// pixels — rather than a url to show. Never rejects.
export async function resolveImageBlob(ref) {
  try {
    const src = await resolveImage(ref)
    return src ? await fetchBlob(src) : null
  } catch {
    return null
  }
}

async function fetchBlob(src) {
  try {
    const response = await fetch(src)
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

// data: and blob: urls, and anything on this page's own origin, can be drawn to
// a canvas and read back. A cross-origin url without CORS taints it.
export function isSameOrigin(src) {
  if (/^(?:data|blob):/i.test(src)) return true
  try {
    return new URL(src, globalThis.location?.href).origin === globalThis.location?.origin
  } catch {
    return false
  }
}

const noop = () => {}

// For consumers that read pixels (STL relief, the WebGL texture): a source they
// can always read. A same-origin source is returned as it is; a cross-origin
// one — every signed Supabase url — is copied into a same-origin blob: url.
// `src` is '' when the photo is not available right now (offline, expired, a
// missing key), and `release()` frees the copy (a no-op when there is none).
export async function resolveImageBytes(ref) {
  const src = await resolveImage(ref)
  if (!src) return { src: '', release: noop }
  if (isSameOrigin(src)) return { src, release: noop }
  const blob = await fetchBlob(src)
  if (!blob) return { src: '', release: noop }
  const copy = URL.createObjectURL(blob)
  return { src: copy, release: () => URL.revokeObjectURL(copy) }
}

function displayString(ref) {
  const raw = typeof ref === 'string' ? ref : ref?.url
  return safeSrc(resolveAssetPath(raw))
}

// This is the one choke point for what reaches an <img src> (#113). An <img>
// never runs script, but a stored ref is user-influenced data (imports, synced
// records), so only image-safe schemes pass: http(s), blob:, data:image/ and
// scheme-less paths. Anything else (javascript:, file:, data:text/html …) is
// treated as no image.
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const SAFE_SCHEME = /^(?:https?:|blob:|data:image\/)/i
function safeSrc(src) {
  if (!src) return ''
  return !HAS_SCHEME.test(src) || SAFE_SCHEME.test(src) ? src : ''
}
