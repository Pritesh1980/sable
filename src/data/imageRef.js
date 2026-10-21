import { resolveAssetPath } from './assetPath'

// Vocabulary for an image *reference* — what is stored and synced — as opposed
// to a displayable URL, which is short-lived and derived at render time (#109).
// A ref is a bare string (static path, external or display URL, or a blob key),
// or an object wrapping one: { key } / { url }, optionally with addedAt/note.

// Blob keys are minted by the storage layer as `user/<id>/…` (see
// src/backend). Positive test on purpose: anything else is a static path or a
// display URL, so a new kind of URL can never be mistaken for a key.
export function isBlobKey(value) {
  return typeof value === 'string' && value.startsWith('user/')
}

// The blob key behind a ref, or '' when the ref is not blob-backed.
export function refKey(ref) {
  if (typeof ref === 'string') return isBlobKey(ref) ? ref : ''
  if (isBlobKey(ref?.key)) return ref.key
  if (isBlobKey(ref?.url)) return ref.url
  return ''
}

const HAS_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i

// Stable identity for comparing refs (tombstones, de-duplication, effect
// deps). Key-first, so a { key } ref, a { url: key } wrapper and a bare key
// compare equal; static paths are normalised against a fixed base so the same
// photo has one identity under `/` and `/sable/`. Never persisted or shown.
export function refIdentity(ref) {
  const key = refKey(ref)
  if (key) return `key:${key}`
  const raw = typeof ref === 'string' ? ref : ref?.url
  if (typeof raw !== 'string' || !raw) return null
  if (HAS_PROTOCOL.test(raw) || raw.startsWith('//')) return `url:${raw}`
  return `path:${resolveAssetPath(raw, '/')}`
}
