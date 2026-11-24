// Curation assistant (#187): key-free hints from the style index, never edits.
// Pure: callers inject `getVec(image) → vector|null` (see embeddings.js).
//
// Eval (scripts/curationEval, issue #187, 24 Nov 2026), 30 artists / 409 photos:
// - Tags: CLIP text prompts ("a realism tattoo") recovered the curated tags
//   unreliably. Learning from the owner's own tags did better: the nearest
//   tagged artists predict fine-line and realism at AUC 0.75-0.80 for any K
//   of 3/5/7. The other four tags never held up, so they're not suggested.
//   This rule (3 of the 5 nearest tagged artists), each artist's tags hidden in
//   turn: fine-line precision 0.75 / recall 0.55, realism 0.76 / 0.87
//   (scripts/curationEval/shipped.mjs).
// - Off-style: a photo's similarity to the centroid of its artist's *other*
//   photos. Under 0.6 flagged 12 of 406, 11 of them not the artist's tattoo
//   work (selfies, posters, studio shots). A per-artist z-score was worse.
import { cosineSimilarity, meanVector, artistCentroids } from './embeddings'
import { refIdentity } from './imageRef'

export const SUGGESTIBLE_TAGS = ['fine-line', 'realism']
export const SUGGEST_NEIGHBOURS = 5
export const SUGGEST_MIN_VOTES = 3
export const SUGGEST_MIN_PHOTOS = 3
export const OFF_STYLE_MIN_SIMILARITY = 0.6
export const OFF_STYLE_MIN_PHOTOS = 4

const indexedCount = (artist, getVec) => (artist.images || []).filter((image) => getVec(image)).length

// Tags this artist lacks that most of the K visually nearest *tagged* artists
// carry: [{ tag, because: [artist, …] }], nearest first within `because`.
export function suggestTags(artist, artists, getVec, {
  k = SUGGEST_NEIGHBOURS,
  minVotes = SUGGEST_MIN_VOTES,
  minPhotos = SUGGEST_MIN_PHOTOS,
  tags = SUGGESTIBLE_TAGS,
  centroids = artistCentroids(artists, getVec),
} = {}) {
  const own = centroids.get(artist.id)
  if (!own || indexedCount(artist, getVec) < minPhotos) return []
  const neighbours = artists
    .filter((a) => a.id !== artist.id && a.tags?.length && centroids.has(a.id))
    .map((a) => ({ a, similarity: cosineSimilarity(own, centroids.get(a.id)) }))
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, k)
    .map(({ a }) => a)
  if (neighbours.length < k) return []
  const have = new Set(artist.tags || [])
  return tags
    .filter((tag) => !have.has(tag))
    .map((tag) => ({ tag, because: neighbours.filter((a) => a.tags.includes(tag)) }))
    .filter(({ because }) => because.length >= minVotes)
}

// Photos far from the rest of this artist's photos, furthest first:
// [{ image, index, similarity }], `index` into artist.images. Photos listed in
// artist.keptImages (by refIdentity) are never flagged.
export function offStyleImages(artist, getVec, {
  minSimilarity = OFF_STYLE_MIN_SIMILARITY,
  minPhotos = OFF_STYLE_MIN_PHOTOS,
} = {}) {
  const indexed = (artist.images || [])
    .map((image, index) => ({ image, index, vec: getVec(image) }))
    .filter((p) => p.vec)
  if (indexed.length < minPhotos) return []
  const kept = new Set(artist.keptImages || [])
  return indexed
    .filter((p) => !kept.has(refIdentity(p.image)))
    .map((p) => {
      const others = meanVector(indexed.filter((o) => o !== p).map((o) => o.vec))
      return { image: p.image, index: p.index, similarity: cosineSimilarity(p.vec, others) }
    })
    .filter((p) => p.similarity < minSimilarity)
    .sort((x, y) => x.similarity - y.similarity)
}
