import { getCachedBlobUrl } from './blobUrls'
import { resolveAssetPath } from './assetPath'
import { itemIdentity } from './undoableRemoval'
import { normalizeReferenceImages } from './referenceImages'
export { normalizeReferenceImages } from './referenceImages'

// Blob-backed refs resolve to a blob:/https: URL and pass through untouched;
// static paths are stored base-relative and get the deploy base applied here
// (see src/data/assetPath.js for why the base is never stored).
export function getImageUrl(image, base) {
  if (typeof image === 'string') return resolveAssetPath(image, base)
  if (image?.url) return resolveAssetPath(image.url, base)
  if (image?.key) return resolveAssetPath(getCachedBlobUrl(image.key), base)
  return ''
}

export function getImageNote(image) {
  return typeof image === 'string' ? '' : image?.note || ''
}

// Sets the note on one reference photo, matched by identity (key first, #114) —
// matching on `url` hit every photo whose url had not resolved yet.
export function setImageNote(images, target, note) {
  const id = itemIdentity(target)
  return normalizeReferenceImages(images).map((image) => (
    itemIdentity(image) === id ? { ...image, note } : image
  ))
}

export function scoreArtistForIdea(artist, idea) {
  const ideaTags = idea?.tags || []
  const artistTags = artist?.tags || []
  const overlapTags = ideaTags.filter((tag) => artistTags.includes(tag))
  // Tags first, rank as the tie-break. A stored status is ignored (#220 D).
  const rankBoost = Math.max(0, 31 - (artist?.rank || 31)) / 10

  return {
    artist,
    overlap: overlapTags.length,
    overlapTags,
    score: overlapTags.length * 10 + rankBoost,
  }
}

export function matchArtistsForIdea(idea, artists = []) {
  if (!idea?.tags?.length) return []

  return artists
    .map((artist) => scoreArtistForIdea(artist, idea))
    .filter((match) => match.overlap > 0)
    .sort((a, b) => b.score - a.score || (a.artist.rank || 999) - (b.artist.rank || 999))
}

function joinAnd(items) {
  if (items.length <= 1) return items[0] || ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function buildMatchRationale(idea, match) {
  if (!match) return ''
  const shared = (match.overlapTags || []).join(' + ')
  const phrases = String(match.artist?.styleDescriptor || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2)
  const subject = idea?.placement ? `this ${idea.placement}` : 'this idea'
  const clause = joinAnd(phrases)

  if (shared && clause) return `Shares ${shared} — their ${clause} suit ${subject}.`
  if (shared) return `Shares ${shared} with ${subject}.`
  if (clause) return `Their ${clause} suit ${subject}.`
  return ''
}

// Plan (#220 D): up to `count` artists for one idea. Artists already linked to
// it come first (shared styles or not), then the closest unlinked matches;
// within each group, most shared styles first, rank breaking ties.
export function artistsForIdea(idea, artists = [], count = 3) {
  const linkedIds = new Set(idea?.linkedArtists || [])
  const ideaTags = idea?.tags || []
  const linked = artists
    .filter((a) => linkedIds.has(a.id))
    .map((artist) => ({ artist, linked: true, overlapTags: ideaTags.filter((t) => artist.tags?.includes(t)) }))
    .sort((a, b) => b.overlapTags.length - a.overlapTags.length || (a.artist.rank ?? Infinity) - (b.artist.rank ?? Infinity))
  const matched = matchArtistsForIdea(idea, artists)
    .filter(({ artist }) => !linkedIds.has(artist.id))
    .map(({ artist, overlapTags }) => ({ artist, linked: false, overlapTags }))
  return [...linked, ...matched].slice(0, count)
}
