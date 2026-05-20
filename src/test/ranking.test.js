import { describe, it, expect } from 'vitest'
import { computeSwipeRanking } from '../data/ranking'

const ARTISTS = [
  { id: 'a', rank: 1, images: ['img1.jpg'] },
  { id: 'b', rank: 2, images: ['img2.jpg'] },
  { id: 'c', rank: 3, images: ['img3.jpg'] },
  { id: 'd', rank: 4, images: ['img4.jpg'] },
  { id: 'e', rank: 5, images: [] }, // no images — never ranked
]

describe('computeSwipeRanking', () => {
  it('places top artists before maybe, maybe before pass', () => {
    const decisions = [
      { artistId: 'c', bucket: 'top' },
      { artistId: 'a', bucket: 'maybe' },
      { artistId: 'b', bucket: 'pass' },
      { artistId: 'd', bucket: 'pass' },
    ]
    const result = computeSwipeRanking(decisions, ARTISTS)
    expect(result.find((a) => a.id === 'c').rank).toBe(1)
    expect(result.find((a) => a.id === 'a').rank).toBe(2)
    // b and d are both pass — b had lower rank so comes first
    expect(result.find((a) => a.id === 'b').rank).toBe(3)
    expect(result.find((a) => a.id === 'd').rank).toBe(4)
  })

  it('preserves relative order within the same bucket', () => {
    const decisions = [
      { artistId: 'c', bucket: 'top' },
      { artistId: 'a', bucket: 'top' },
      { artistId: 'b', bucket: 'maybe' },
      { artistId: 'd', bucket: 'pass' },
    ]
    const result = computeSwipeRanking(decisions, ARTISTS)
    // a had rank 1, c had rank 3 — within 'top', a should come first
    expect(result.find((a) => a.id === 'a').rank).toBe(1)
    expect(result.find((a) => a.id === 'c').rank).toBe(2)
  })

  it('places unranked artists after all ranked artists, preserving their relative order', () => {
    const decisions = [
      { artistId: 'a', bucket: 'top' },
      { artistId: 'b', bucket: 'maybe' },
      { artistId: 'c', bucket: 'pass' },
      { artistId: 'd', bucket: 'pass' },
    ]
    const result = computeSwipeRanking(decisions, ARTISTS)
    // e has no images and was not in decisions — should be last
    expect(result.find((a) => a.id === 'e').rank).toBe(5)
  })

  it('returns sequential ranks from 1 to n', () => {
    const decisions = [
      { artistId: 'a', bucket: 'top' },
      { artistId: 'b', bucket: 'maybe' },
      { artistId: 'c', bucket: 'pass' },
      { artistId: 'd', bucket: 'pass' },
    ]
    const result = computeSwipeRanking(decisions, ARTISTS)
    const ranks = result.map((a) => a.rank).sort((x, y) => x - y)
    expect(ranks).toEqual([1, 2, 3, 4, 5])
  })

  it('handles all artists in the same bucket', () => {
    const decisions = [
      { artistId: 'a', bucket: 'top' },
      { artistId: 'b', bucket: 'top' },
      { artistId: 'c', bucket: 'top' },
      { artistId: 'd', bucket: 'top' },
    ]
    const result = computeSwipeRanking(decisions, ARTISTS)
    // original order preserved within bucket
    expect(result.find((a) => a.id === 'a').rank).toBe(1)
    expect(result.find((a) => a.id === 'b').rank).toBe(2)
    expect(result.find((a) => a.id === 'c').rank).toBe(3)
    expect(result.find((a) => a.id === 'd').rank).toBe(4)
  })

  it('handles empty decisions — all artists stay in original order', () => {
    const result = computeSwipeRanking([], ARTISTS)
    const ranks = result.map((a) => a.rank).sort((x, y) => x - y)
    expect(ranks).toEqual([1, 2, 3, 4, 5])
    // original relative order preserved
    expect(result.find((a) => a.id === 'a').rank).toBe(1)
    expect(result.find((a) => a.id === 'e').rank).toBe(5)
  })

  it('does not mutate the original artists array', () => {
    const decisions = [{ artistId: 'a', bucket: 'top' }]
    const original = ARTISTS.map((a) => ({ ...a }))
    computeSwipeRanking(decisions, ARTISTS)
    ARTISTS.forEach((a, i) => {
      expect(a.rank).toBe(original[i].rank)
    })
  })
})
