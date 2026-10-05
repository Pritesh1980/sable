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
    const src = getCachedBlobUrl(key)
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
    return key ? (await resolveBlobKey(key)) || '' : displayString(ref)
  } catch {
    return ''
  }
}

function displayString(ref) {
  const raw = typeof ref === 'string' ? ref : ref?.url
  return resolveAssetPath(raw)
}
