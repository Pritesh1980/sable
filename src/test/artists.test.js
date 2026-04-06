import { describe, it, expect } from 'vitest'
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS } from '../data/artists'

describe('DEFAULT_ARTISTS data integrity', () => {
  it('has no tier field on any artist', () => {
    const withTier = DEFAULT_ARTISTS.filter((a) => 'tier' in a)
    expect(withTier).toHaveLength(0)
  })

  it('has unique IDs', () => {
    const ids = DEFAULT_ARTISTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique ranks', () => {
    const ranks = DEFAULT_ARTISTS.map((a) => a.rank)
    expect(new Set(ranks).size).toBe(ranks.length)
  })

  it('has sequential ranks starting from 1', () => {
    const ranks = DEFAULT_ARTISTS.map((a) => a.rank).sort((a, b) => a - b)
    ranks.forEach((r, i) => expect(r).toBe(i + 1))
  })

  it('has 26 artists', () => {
    expect(DEFAULT_ARTISTS).toHaveLength(26)
  })

  it('every assigned studio ID exists in DEFAULT_STUDIOS', () => {
    const studioIds = new Set(DEFAULT_STUDIOS.map((s) => s.id))
    const invalid = DEFAULT_ARTISTS.filter((a) => a.studio !== null && !studioIds.has(a.studio))
    expect(invalid).toHaveLength(0)
  })

  it('every artist has required fields', () => {
    for (const a of DEFAULT_ARTISTS) {
      expect(a).toHaveProperty('id')
      expect(a).toHaveProperty('handle')
      expect(a).toHaveProperty('tags')
      expect(a).toHaveProperty('rank')
      expect(a).toHaveProperty('studio')
    }
  })
})

describe('DEFAULT_STUDIOS data integrity', () => {
  it('has unique IDs', () => {
    const ids = DEFAULT_STUDIOS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
