// Wall data schema + selector — flattens artist images into a single visual
// stream for the (future) Wall view. Pure data layer; no UI.

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000

// True iff `addedAt` is an ISO timestamp within the last 14 days of `now`.
// Missing/undefined/null `addedAt` is NOT recent — this is the migration rule
// for existing images that predate this field.
export function isRecent(addedAt, now = new Date()) {
  if (!addedAt) return false
  const addedTime = new Date(addedAt).getTime()
  const nowTime = new Date(now).getTime()
  if (Number.isNaN(addedTime) || Number.isNaN(nowTime)) return false
  const age = nowTime - addedTime
  return age >= 0 && age <= FOURTEEN_DAYS_MS
}

// Returns a copy of `image` with `addedAt` stamped as an ISO string, for use
// by future add/drop flows. Accepts either shape images use elsewhere
// (a plain string URL, or a `{ key }` / `{ url }` blob ref object).
export function stampAddedAt(image, now = new Date()) {
  const addedAt = new Date(now).toISOString()
  if (typeof image === 'string') return { url: image, addedAt }
  return { ...image, addedAt }
}

function addedAtOf(image) {
  return typeof image === 'string' ? undefined : image?.addedAt
}

// Resolves either image shape (plain string, or { url, addedAt } / { key }
// refs) to a displayable <img src> string. Keyed refs that haven't been
// resolved to a URL yet come back as '' so consumers fall back gracefully.
export function imageSrc(image) {
  if (typeof image === 'string') return image
  return image?.url || ''
}

// Flattens artists into one entry per image, preserving artist order then
// image order (stable — no shuffling).
export function buildWallItems(artists = [], { now = new Date() } = {}) {
  const items = []
  for (const artist of artists) {
    const images = artist.images || []
    images.forEach((image, imageIndex) => {
      const addedAt = addedAtOf(image)
      items.push({
        artistId: artist.id,
        artistName: artist.name || artist.handle,
        handle: artist.handle,
        styles: artist.tags || [],
        image: imageSrc(image),
        imageIndex,
        addedAt,
        isRecent: isRecent(addedAt, now),
      })
    })
  }
  return items
}
