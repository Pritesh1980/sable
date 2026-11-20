// Taste Engine phase 3 (issue #19): a lightweight taste model learned from
// what the user has already told the app — the global rank order — projected
// into the visual embedding space. No training loop: the taste vector is a
// weighted mean of artist style centroids, where higher-ranked artists weigh
// more. The artist status used to weight it too (pass pulled away); it was
// removed from the app (#220 D), so a stored one is ignored. Pure and
// injectable like the rest of src/data/embeddings.js.
import { artistCentroids, cosineSimilarity } from './embeddings'

// Rank scales interest: #1 counts double the last-placed artist. Ranks can have
// gaps, so one past the list length is treated as last, never as negative.
function tasteWeight(artist, count) {
  const rank = Number.isFinite(artist.rank) ? Math.min(Math.max(artist.rank, 1), count) : count
  return count > 1 ? 1 + (count - rank) / (count - 1) : 1
}

// Unit vector describing the user's visual taste; null when nothing is
// embedded yet (no style index).
export function buildTasteVector(artists, getVec) {
  const centroids = artistCentroids(artists, getVec)
  if (centroids.size === 0) return null
  const count = artists.length
  let sum = null
  for (const artist of artists) {
    const centroid = centroids.get(artist.id)
    if (!centroid) continue
    const weight = tasteWeight(artist, count)
    if (!sum) sum = new Array(centroid.length).fill(0)
    for (let i = 0; i < centroid.length; i++) sum[i] += weight * centroid[i]
  }
  if (!sum) return null
  const norm = Math.hypot(...sum)
  if (norm === 0) return null
  return sum.map((x) => x / norm)
}

// Where the taste model would place this artist among all embeddable artists:
// their centroid's taste score ranked against everyone else's. Null when the
// artist (or the taste vector) can't be placed.
export function predictedRank(artists, artistId, getVec, taste) {
  if (!taste) return null
  const centroids = artistCentroids(artists, getVec)
  if (!centroids.has(artistId)) return null
  const scored = [...centroids.entries()]
    .map(([id, centroid]) => ({ id, score: cosineSimilarity(taste, centroid) }))
    .sort((a, b) => b.score - a.score)
  const position = scored.findIndex((s) => s.id === artistId) + 1
  return { position, of: scored.length }
}
