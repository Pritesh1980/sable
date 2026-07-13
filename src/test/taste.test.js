import { describe, it, expect } from 'vitest'
import { buildTasteVector, predictedRank } from '../data/taste'
import { cosineSimilarity } from '../data/embeddings'

// Two style directions: X = the taste the user demonstrably loves (top rank,
// contact-next), Z = a style they've passed on. Y sits in between.
const vecs = {
  '/loved1.jpg': [1, 0, 0],
  '/loved2.jpg': [0.9, 0.1, 0],
  '/mid1.jpg': [0.5, 0.5, 0],
  '/passed1.jpg': [0, 0, 1],
  '/passed2.jpg': [0, 0.1, 0.9],
}
const getVec = (src) => vecs[src] || null

const artists = [
  { id: 'loved', images: ['/loved1.jpg', '/loved2.jpg'], rank: 1, status: 'contact-next' },
  { id: 'mid', images: ['/mid1.jpg'], rank: 5, status: 'researching' },
  { id: 'passed', images: ['/passed1.jpg', '/passed2.jpg'], rank: 9, status: 'pass' },
  { id: 'noimages', images: [], rank: 2, status: 'shortlisted' },
]

describe('buildTasteVector', () => {
  it('points toward highly-ranked, positively-statused work', () => {
    const taste = buildTasteVector(artists, getVec)
    expect(taste).not.toBeNull()
    const lovedSim = cosineSimilarity(taste, [1, 0, 0])
    const passedSim = cosineSimilarity(taste, [0, 0, 1])
    expect(lovedSim).toBeGreaterThan(0.7)
    expect(lovedSim).toBeGreaterThan(passedSim)
  })

  it('pass-status artists actively repel the taste vector', () => {
    const withoutPass = buildTasteVector(artists.filter((a) => a.status !== 'pass'), getVec)
    const withPass = buildTasteVector(artists, getVec)
    // Adding a passed artist moves the vector further from the passed style.
    expect(cosineSimilarity(withPass, [0, 0, 1])).toBeLessThan(cosineSimilarity(withoutPass, [0, 0, 1]))
  })

  it('is a unit vector, and null when nothing is embedded', () => {
    const taste = buildTasteVector(artists, getVec)
    expect(Math.hypot(...taste)).toBeCloseTo(1)
    expect(buildTasteVector(artists, () => null)).toBeNull()
  })
})

describe('predictedRank', () => {
  it('ranks the loved artist first and the passed artist last against the taste vector', () => {
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
