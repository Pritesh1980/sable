// Taste Engine phase 3 (issue #19): a lightweight taste model learned from
// what the user has already told the app — the global rank order — projected
// into the visual embedding space. No training loop: the taste vector is a
// weighted mean of artist style centroids, where higher-ranked artists weigh
// more. The artist status used to weight it too (pass pulled away); it was
// removed from the app (#220 D), so a stored one is ignored. Pure and
// injectable like the rest of src/data/embeddings.js.
import { artistCentroids, cosineSimilarity } from './embeddings'

// Rank scales interest: the top artist counts double the last-placed one. It
// goes by place in rank order, not the stored number, because ranks can have
// gaps (a deleted artist leaves #2 and #3 with no #1) and must never weigh
// negative. Equal ranks weigh the same; unranked artists count as last.
function rankWeights(artists) {
  const key = (a) => (Number.isFinite(a.rank) ? a.rank : Infinity)
  const keys = artists.map(key).sort((a, b) => a - b)
  const count = artists.length
  // place = how many artists rank strictly ahead, so ties weigh the same.
  const place = (k) => keys.findIndex((x) => x === k)
  return new Map(artists.map((artist) => [artist.id, count > 1 ? 1 + (count - 1 - place(key(artist))) / (count - 1) : 1]))
}

// Unit vector describing the user's visual taste; null when nothing is
// embedded yet (no style index).
export function buildTasteVector(artists, getVec) {
  const centroids = artistCentroids(artists, getVec)
  if (centroids.size === 0) return null
  const weights = rankWeights(artists)
  let sum = null
  for (const artist of artists) {
    const centroid = centroids.get(artist.id)
    if (!centroid) continue
    const weight = weights.get(artist.id)
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
