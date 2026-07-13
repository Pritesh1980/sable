import { describe, it, expect } from 'vitest'
import {
  cosineSimilarity,
  meanVector,
  artistCentroids,
  similarArtists,
  rankArtistsByVector,
  indexCoverage,
} from '../data/embeddings'

// Small orthogonal-ish fixture space: artists A and B share a direction,
// C points elsewhere. Vectors deliberately NOT unit length — the math must
// normalise internally.
const vecs = {
  '/a1.jpg': [2, 0, 0],
  '/a2.jpg': [1, 0.2, 0],
  '/b1.jpg': [1, 0.1, 0],
  '/c1.jpg': [0, 0, 3],
  '/c2.jpg': [0, 0.1, 2],
}
const getVec = (src) => vecs[src] || null

const artists = [
  { id: 'a', images: ['/a1.jpg', '/a2.jpg'] },
  { id: 'b', images: ['/b1.jpg'] },
  { id: 'c', images: ['/c1.jpg', '/c2.jpg'] },
  { id: 'd', images: ['/d1.jpg'] }, // nothing embedded
  { id: 'e', images: [] },
]

describe('cosineSimilarity', () => {
  it('is 1 for parallel and 0 for orthogonal vectors regardless of magnitude', () => {
    expect(cosineSimilarity([2, 0], [5, 0])).toBeCloseTo(1)
    expect(cosineSimilarity([1, 0], [0, 3])).toBeCloseTo(0)
  })

  it('returns 0 for zero-length or mismatched input instead of NaN', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0)
    expect(cosineSimilarity(null, [1, 0])).toBe(0)
  })
})

describe('meanVector', () => {
  it('returns the unit-normalised mean', () => {
    const m = meanVector([[2, 0], [0, 2]])
    expect(m[0]).toBeCloseTo(Math.SQRT1_2)
    expect(m[1]).toBeCloseTo(Math.SQRT1_2)
  })

  it('returns null for empty input', () => {
    expect(meanVector([])).toBeNull()
  })
})

describe('artistCentroids', () => {
  it('builds one unit centroid per artist with at least one embedded image', () => {
    const centroids = artistCentroids(artists, getVec)
    expect([...centroids.keys()].sort()).toEqual(['a', 'b', 'c'])
    const a = centroids.get('a')
    expect(Math.hypot(...a)).toBeCloseTo(1)
  })

  it('supports { url } image objects, not just string paths', () => {
    const objArtists = [{ id: 'a', images: [{ url: '/a1.jpg', note: '' }] }]
    expect(artistCentroids(objArtists, getVec).has('a')).toBe(true)
  })
})

describe('similarArtists', () => {
  it('ranks visually close artists first and excludes the artist itself', () => {
    const out = similarArtists(artists, 'a', getVec)
    expect(out.map((r) => r.artist.id)).toEqual(['b', 'c'])
    expect(out[0].similarity).toBeGreaterThan(out[1].similarity)
    expect(out.every((r) => r.artist.id !== 'a')).toBe(true)
  })

  it('omits artists with no embedded images and respects the limit', () => {
    const out = similarArtists(artists, 'a', getVec, { limit: 1 })
    expect(out).toHaveLength(1)
    expect(out.some((r) => r.artist.id === 'd')).toBe(false)
  })

  it('returns [] when the target artist has no embeddings yet', () => {
    expect(similarArtists(artists, 'd', getVec)).toEqual([])
  })
})

describe('rankArtistsByVector', () => {
  it('ranks all embeddable artists against an arbitrary vector (e.g. a concept image)', () => {
    // [1, 0.1, 0] is exactly b's direction; a is close, c is orthogonal.
    const out = rankArtistsByVector(artists, [1, 0.1, 0], getVec)
    expect(out.map((r) => r.artist.id)).toEqual(['b', 'a', 'c'])
    expect(out[0].similarity).toBeGreaterThan(out[2].similarity)
  })

  it('respects the limit and returns [] for a null vector', () => {
    expect(rankArtistsByVector(artists, [1, 0, 0], getVec, { limit: 1 })).toHaveLength(1)
    expect(rankArtistsByVector(artists, null, getVec)).toEqual([])
  })
})

describe('indexCoverage', () => {
  it('counts embedded vs total images across the collection', () => {
    const { embedded, total } = indexCoverage(artists, getVec)
    expect(embedded).toBe(5)
    expect(total).toBe(6)
  })
})
