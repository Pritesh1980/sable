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
