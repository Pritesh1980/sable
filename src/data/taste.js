// Taste Engine phase 3 (issue #19): a lightweight taste model learned from
// what the user has already told the app — global rank order and shortlist
// statuses — projected into the visual embedding space. No training loop:
// the taste vector is a weighted mean of artist style centroids, where the
// weights encode how the user treats each artist. Pure and injectable like
// the rest of src/data/embeddings.js.
import { artistCentroids, cosineSimilarity } from './embeddings'
import { normalizeArtistStatus } from './planning'

// How much each shortlist status says "this is my taste". `pass` is the one
// explicit negative signal in the data and pulls the vector away.
const STATUS_WEIGHT = {
  'contact-next': 1.2,
  shortlisted: 1.0,
  contacted: 0.8,
  researching: 0.5,
  maybe: 0.2,
  pass: -0.6,
}

function tasteWeight(artist, count) {
  const status = normalizeArtistStatus(artist.status)
  const statusWeight = STATUS_WEIGHT[status] ?? 0.5
  if (statusWeight < 0) return statusWeight // rank is meaningless for a pass
  // Rank scales positive interest: #1 counts double a last-place artist.
  const rank = Number.isFinite(artist.rank) ? artist.rank : count
  const rankFactor = count > 1 ? 1 + (count - rank) / (count - 1) : 1
  return statusWeight * rankFactor
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
