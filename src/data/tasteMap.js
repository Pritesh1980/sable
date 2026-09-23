// Taste map: every artist placed on a 2D map by their style centroid, so
// clusters of similar ink sit together, with a marker for the user's taste.
// Pure and model-agnostic like embeddings.js — callers inject getVec.
import { artistCentroids } from './embeddings'
import { buildTasteVector } from './taste'

const POWER_ITERATIONS = 200

function dot(a, b) {
  let s = 0
  for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]
  return s
}

function normalise(v) {
  const n = Math.sqrt(dot(v, v))
  return n < 1e-12 ? null : v.map((x) => x / n)
}

function withoutComponent(v, axis) {
  if (!axis) return v
  const k = dot(v, axis)
  return v.map((x, i) => x - k * axis[i])
}

// Leading principal axis of centred rows X (power iteration on XᵀX),
// orthogonal to `orth`. Deterministic start and sign, so the same library
// always draws the same map. Null when there is no variance left.
function principalAxis(X, orth) {
  const d = X[0].length
  let v = normalise(withoutComponent(Array.from({ length: d }, (_, i) => 1 + (i % 7) * 0.1), orth))
  if (!v) return null
  for (let iter = 0; iter < POWER_ITERATIONS; iter += 1) {
    const next = new Array(d).fill(0)
    for (const row of X) {
      const k = dot(row, v)
      for (let i = 0; i < d; i += 1) next[i] += k * row[i]
    }
    const unit = normalise(withoutComponent(next, orth))
    if (!unit) return null
    v = unit
  }
  let biggest = 0
  for (let i = 1; i < d; i += 1) if (Math.abs(v[i]) > Math.abs(v[biggest])) biggest = i
  return v[biggest] < 0 ? v.map((x) => -x) : v
}

// PCA down to two dimensions. Returns each input's point plus a `project`
// function for placing new vectors (the taste vector) on the same axes.
export function projectTo2D(vectors) {
  if (!vectors.length) return { points: [], project: () => ({ x: 0, y: 0 }) }
  const d = vectors[0].length
  const mean = new Array(d).fill(0)
  for (const v of vectors) for (let i = 0; i < d; i += 1) mean[i] += v[i] / vectors.length
  const X = vectors.map((v) => v.map((x, i) => x - mean[i]))
  const pc1 = principalAxis(X, null)
  const pc2 = pc1 ? principalAxis(X.map((row) => withoutComponent(row, pc1)), pc1) : null
  const project = (v) => {
    const centred = v.map((x, i) => x - mean[i])
    return { x: pc1 ? dot(centred, pc1) : 0, y: pc2 ? dot(centred, pc2) : 0 }
  }
  return { points: vectors.map(project), project }
}

// Scale both axes by one factor (so distances stay honest) and centre in
// a width × height box with `pad` clear on every side.
export function fitToBox(points, width, height, pad) {
  if (!points.length) return []
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const spanX = maxX - minX
  const spanY = maxY - minY
  const fits = [spanX > 0 ? (width - 2 * pad) / spanX : Infinity, spanY > 0 ? (height - 2 * pad) / spanY : Infinity]
  const scale = Math.min(...fits)
  const k = Number.isFinite(scale) ? scale : 0
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  return points.map((p) => ({ x: (p.x - cx) * k + width / 2, y: (p.y - cy) * k + height / 2 }))
}

// Nudge overlapping points apart until none are closer than minDist,
// keeping everything inside the box. Points with room to spare don't move.
export function spreadPoints(points, minDist, { width, height }, iterations = 150) {
  const out = points.map((p) => ({ ...p }))
  const half = minDist / 2
  for (let iter = 0; iter < iterations; iter += 1) {
    let moved = false
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        let dx = out[j].x - out[i].x
        let dy = out[j].y - out[i].y
        let d = Math.hypot(dx, dy)
        if (d >= minDist) continue
        if (d < 1e-6) {
          // Exactly coincident: separate along a fixed, pair-specific direction.
          const angle = (i * 7 + j * 13) % 360 * (Math.PI / 180)
          dx = Math.cos(angle)
          dy = Math.sin(angle)
          d = 1
        }
        const push = (minDist - Math.hypot(out[j].x - out[i].x, out[j].y - out[i].y)) / 2
        out[i].x -= (dx / d) * push
        out[i].y -= (dy / d) * push
        out[j].x += (dx / d) * push
        out[j].y += (dy / d) * push
        moved = true
      }
    }
    for (const p of out) {
      p.x = Math.min(width - half, Math.max(half, p.x))
      p.y = Math.min(height - half, Math.max(half, p.y))
    }
    if (!moved) break
  }
  return out
}

// Everything the map view draws: one node per artist with indexed images
// (their main style tag for colour) and the taste marker, all in pixels.
export function layoutTasteMap(artists, getVec, { width, height, nodeSize }) {
  const centroids = artistCentroids(artists, getVec)
  const placed = artists.filter((a) => centroids.has(a.id))
  if (!placed.length) return { nodes: [], taste: null }

  const vectors = placed.map((a) => centroids.get(a.id))
  const { points, project } = projectTo2D(vectors)
  // The taste vector is unit length, but the centroids it blends average to
  // something shorter; scale it to match, or its projection drifts off the
  // cloud. (Evenly weighted, it then lands exactly on the artists' centre.)
  const unitTaste = buildTasteVector(artists, getVec)
  const meanLength = Math.hypot(...vectors[0].map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length))
  const tasteVec = unitTaste ? unitTaste.map((x) => x * meanLength) : null
  const raw = tasteVec ? [...points, project(tasteVec)] : points
  const fitted = fitToBox(raw, width, height, nodeSize)
  // 1.5× leaves room for the name label under each thumbnail.
  const nodePoints = spreadPoints(fitted.slice(0, placed.length), nodeSize * 1.5, { width, height })

  return {
    nodes: placed.map((artist, i) => ({ artist, x: nodePoints[i].x, y: nodePoints[i].y, style: artist.tags?.[0] || 'other' })),
    taste: tasteVec ? fitted[placed.length] : null,
  }
}
