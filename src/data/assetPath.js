// Applies the deploy base to a static asset path, at display time.
//
// Why this exists rather than baking the base into the data: image paths are
// persisted and synced. `canonicalizeImages` stores static paths verbatim into
// localStorage, IndexedDB and the remote document store, so a build-time base
// written into a record outlives the build — moving from /sable/ to a root
// domain would strand every stored path, on every device. Seed data therefore
// stays base-relative ("images/artists/…") and the base is applied here.
//
// Doubles as the migration: legacy root-absolute paths ("/images/artists/…",
// the shape DEFAULT_ARTISTS shipped for years) and already-based paths both
// resolve correctly, so stored records heal on read with no migration pass.

const HAS_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i

export function resolveAssetPath(path, base = import.meta.env?.BASE_URL || '/') {
  if (typeof path !== 'string' || !path) return ''
  // http(s) for external references, blob: for uploaded images, data: for
  // un-migrated inline ones — none of these are ours to rebase.
  if (HAS_PROTOCOL.test(path)) return path
  // Already carries the current base. Note this also short-circuits every
  // root-absolute path when base is '/', which is exactly right there.
  if (path.startsWith(base)) return path
  return base + path.replace(/^\//, '')
}
