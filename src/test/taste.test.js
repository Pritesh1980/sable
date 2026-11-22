import { describe, it, expect } from 'vitest'
import { buildTasteVector, predictedRank } from '../data/taste'
import { cosineSimilarity } from '../data/embeddings'

// Two style directions: X = the taste the user ranks highest, Z = the style
// they rank last. Y sits in between. Status is gone (#220 D): rank alone.
const vecs = {
  '/loved1.jpg': [1, 0, 0],
  '/loved2.jpg': [0.9, 0.1, 0],
  '/mid1.jpg': [0.5, 0.5, 0],
  '/passed1.jpg': [0, 0, 1],
  '/passed2.jpg': [0, 0.1, 0.9],
}
const getVec = (src) => vecs[src] || null

const artists = [
  { id: 'loved', images: ['/loved1.jpg', '/loved2.jpg'], rank: 1 },
  { id: 'mid', images: ['/mid1.jpg'], rank: 5 },
  { id: 'passed', images: ['/passed1.jpg', '/passed2.jpg'], rank: 9 },
  { id: 'noimages', images: [], rank: 2 },
]

describe('buildTasteVector', () => {
  it('points toward highly-ranked work', () => {
    const taste = buildTasteVector(artists, getVec)
    expect(taste).not.toBeNull()
    const lovedSim = cosineSimilarity(taste, [1, 0, 0])
    const passedSim = cosineSimilarity(taste, [0, 0, 1])
    expect(lovedSim).toBeGreaterThan(0.7)
    expect(lovedSim).toBeGreaterThan(passedSim)
  })

  it('ignores a stored status', () => {
    const statuses = ['pass', 'contact-next', 'maybe', 'shortlisted']
    const withStatus = artists.map((a, i) => ({ ...a, status: statuses[i] }))
    expect(buildTasteVector(withStatus, getVec)).toEqual(buildTasteVector(artists, getVec))
  })

  it('keeps rank order when ranks have gaps (an artist was deleted)', () => {
    // #1 was removed: #2 must still outweigh #3, so the taste leans to #2.
    const gapped = [{ id: 'three', images: ['/passed1.jpg'], rank: 3 }, { id: 'two', images: ['/loved1.jpg'], rank: 2 }]
    const taste = buildTasteVector(gapped, getVec)
    expect(cosineSimilarity(taste, [1, 0, 0])).toBeGreaterThan(cosineSimilarity(taste, [0, 0, 1]))
  })

  it('never weights an artist negatively, even with a rank past the list length', () => {
    // Ranks can have gaps (9 of 4 here): that must not turn into a pull away.
    const only = [{ id: 'passed', images: ['/passed1.jpg'], rank: 9 }, { id: 'loved', images: ['/loved1.jpg'], rank: 1 }]
    const taste = buildTasteVector(only, getVec)
    expect(cosineSimilarity(taste, [0, 0, 1])).toBeGreaterThan(0)
  })

  it('is a unit vector, and null when nothing is embedded', () => {
    const taste = buildTasteVector(artists, getVec)
    expect(Math.hypot(...taste)).toBeCloseTo(1)
    expect(buildTasteVector(artists, () => null)).toBeNull()
  })
})

describe('predictedRank', () => {
  it('ranks the top artist first and the last-ranked artist last against the taste vector', () => {
    const taste = buildTasteVector(artists, getVec)
    expect(predictedRank(artists, 'loved', getVec, taste)).toEqual({ position: 1, of: 3 })
    expect(predictedRank(artists, 'passed', getVec, taste)).toEqual({ position: 3, of: 3 })
  })

  it('returns null for artists that cannot be placed (no embedded images)', () => {
    const taste = buildTasteVector(artists, getVec)
    expect(predictedRank(artists, 'noimages', getVec, taste)).toBeNull()
    expect(predictedRank(artists, 'loved', getVec, null)).toBeNull()
  })
})
