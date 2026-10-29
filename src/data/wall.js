// Wall data schema + selector — flattens artist images into a single visual
// stream for the (future) Wall view. Pure data layer; no UI.

import { DEFAULT_STUDIOS } from './artists'
import { resolveAssetPath } from './assetPath'

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
// Unwraps an image ref to a displayable src, applying the deploy base. Data
// stays base-relative so no build-time base is frozen into synced records —
// see src/data/assetPath.js.
export function imageSrc(image, base) {
  const raw = typeof image === 'string' ? image : image?.url || ''
  return resolveAssetPath(raw, base)
}

function studioNameOf(studioId) {
  return DEFAULT_STUDIOS.find((s) => s.id === studioId)?.name
}

// Flattens artists into one entry per image, preserving artist order then
// image order (stable — no shuffling). Items carry the stored image *ref*
// (`image`), never a resolved string: the render boundary (ArtistImage /
// useImageSrc) resolves it, so a blob key that is not cached yet is "loading"
// rather than indistinguishable from "no image" (#113).
export function buildWallItems(artists = [], { now = new Date() } = {}) {
  const items = []
  for (const artist of artists) {
    const images = artist.images || []
    const studioName = studioNameOf(artist.studio)
    images.forEach((image, imageIndex) => {
      const addedAt = addedAtOf(image)
      items.push({
        artistId: artist.id,
        artistName: artist.name || artist.handle,
        handle: artist.handle,
        styles: artist.tags || [],
        studioName,
        image,
        imageIndex,
        addedAt,
        isRecent: isRecent(addedAt, now),
      })
    })
  }
  return items
}

// The Wall viewer's open photo in the URL (#159): `?photo=<artistId>.<n>`, with
// n counting from 1 like the viewer's own counter. Artist ids are handles and
// can hold dots ("zoia.ink"), so the number is whatever follows the last dot.
export function photoParam(item) {
  return `${item.artistId}.${item.imageIndex + 1}`
}

// Where a `?photo=` value sits in `items`, or -1 when it no longer names a
// photo (artist removed, photo deleted, a malformed link).
export function findPhotoIndex(items, value) {
  if (!value) return -1
  const dot = value.lastIndexOf('.')
  const n = Number(value.slice(dot + 1))
  if (dot <= 0 || !Number.isInteger(n) || n < 1) return -1
  const artistId = value.slice(0, dot)
  return items.findIndex((item) => item.artistId === artistId && item.imageIndex === n - 1)
}
