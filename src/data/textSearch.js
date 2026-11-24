// Search the library by words (#186): CLIP's text half puts a phrase in the
// same space as the photo vectors in the style index, so a query ranks photos
// with the same cosine similarity as "More like this". Pure: callers inject the
// query vector and `getVec(image) → vector|null`.
//
// Spike, 24 Nov 2026 (issue #186): one subject per query works ("skull",
// "wolf", "woman's face"); scenes ("moth with a skull") do not. The bare phrase
// beats "a tattoo of …", which lifted every photo alike. On the real library
// nonsense queries topped out at 0.243 and real subjects started at 0.263.
import { similarPhotos } from './embeddings'

export const TEXT_MIN_SCORE = 0.25
export const TEXT_RESULT_LIMIT = 24
const MAX_QUERY_LENGTH = 100

// One spelling per search, so the same words always hit the same cached vector.
export function normaliseQuery(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ').toLowerCase().slice(0, MAX_QUERY_LENGTH)
}

// The photos that match the words, best first, cut off where matches turn
// into noise. A photo seen twice counts once.
export function searchPhotosByText(textVec, items, getVec, { minScore = TEXT_MIN_SCORE, limit = TEXT_RESULT_LIMIT } = {}) {
  if (!textVec) return []
  return similarPhotos(textVec, items, getVec, { limit: Infinity })
    .filter((match) => match.similarity >= minScore)
    .slice(0, limit)
}

// Matches grouped by artist, each group in the order of its best photo.
// Photos saved without an artist share one group.
export function groupByArtist(matches) {
  const groups = new Map()
  for (const match of matches) {
    const { item } = match
    // Handles can't hold ':', so this never meets a real artist id.
    const key = item.artistId ?? ':saved'
    if (!groups.has(key)) {
      groups.set(key, { key, artistId: item.artistId ?? null, artistName: item.artistName, handle: item.handle, matches: [] })
    }
    groups.get(key).matches.push(match)
  }
  return [...groups.values()]
}
