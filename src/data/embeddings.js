// Taste Engine — pure vector math over per-image style embeddings (issue #19).
// Vectors come from an on-device CLIP-class model (see embedder.js / styleIndex.js);
// this module is storage- and model-agnostic: callers inject `getVec(src) → vector|null`.
// Spike evidence (issue #19 comment, 2026-07-13): single curated images retrieve
// their own artist at ~28% top-1 vs 2.7% chance, so centroid-level artist
// similarity has real signal.

import { getImageUrl } from './planning'

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Unit-normalised mean of a list of vectors; null when there is nothing to average.
export function meanVector(vectors) {
  if (!vectors?.length) return null
  const dim = vectors[0].length
  const sum = new Array(dim).fill(0)
  for (const v of vectors) for (let i = 0; i < dim; i++) sum[i] += v[i]
  const norm = Math.hypot(...sum)
  if (norm === 0) return null
  return sum.map((x) => x / norm)
}

const artistVectors = (artist, getVec) =>
  (artist.images || [])
    .map((image) => getVec(getImageUrl(image)))
    .filter(Boolean)

// One style centroid per artist that has at least one embedded image.
export function artistCentroids(artists, getVec) {
  const centroids = new Map()
  for (const artist of artists) {
    const centroid = meanVector(artistVectors(artist, getVec))
    if (centroid) centroids.set(artist.id, centroid)
  }
  return centroids
}

// Rank artists against an arbitrary vector (a concept image, an inspiration
// upload…), best first. Artists without any embedded images can't be placed
// in the space and are omitted entirely.
export function rankArtistsByVector(artists, vec, getVec, { limit = 3, excludeId } = {}) {
  if (!vec) return []
  const centroids = artistCentroids(artists, getVec)
  return artists
    .filter((a) => a.id !== excludeId && centroids.has(a.id))
    .map((artist) => ({ artist, similarity: cosineSimilarity(vec, centroids.get(artist.id)) }))
    .sort((x, y) => y.similarity - x.similarity)
    .slice(0, limit)
}

// The artists visually closest to `artistId`, best first.
export function similarArtists(artists, artistId, getVec, { limit = 3 } = {}) {
  const target = artistCentroids(artists, getVec).get(artistId)
  return rankArtistsByVector(artists, target, getVec, { limit, excludeId: artistId })
}

export function indexCoverage(artists, getVec) {
  let embedded = 0
  let total = 0
  for (const artist of artists) {
    for (const image of artist.images || []) {
      total++
      if (getVec(getImageUrl(image))) embedded++
    }
  }
  return { embedded, total }
}
