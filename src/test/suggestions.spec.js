import { describe, it, expect } from 'vitest'
import { SUGGESTED_ARTISTS, buildSuggestions } from '../data/suggestions'
import { DEFAULT_ARTISTS, STYLE_TAGS } from '../data/artists'

// The user's collection skews dark-illustrative / blackwork; a fixture that
// mirrors that shape without depending on the full seeded dataset.
const collection = [
  { id: 'a1', handle: 'a1', tags: ['dark-illustrative', 'blackwork'] },
  { id: 'a2', handle: 'a2', tags: ['dark-illustrative', 'surrealism'] },
  { id: 'a3', handle: 'a3', tags: ['fine-line'] },
]

describe('SUGGESTED_ARTISTS dataset integrity', () => {
  it('every suggestion has a handle, display name and at least one known style tag', () => {
    expect(SUGGESTED_ARTISTS.length).toBeGreaterThanOrEqual(10)
    for (const s of SUGGESTED_ARTISTS) {
      expect(s.handle).toBeTruthy()
      expect(s.name).toBeTruthy()
      expect(s.tags.length).toBeGreaterThan(0)
      s.tags.forEach((t) => expect(STYLE_TAGS).toContain(t))
    }
  })

  it('never suggests anyone already in the seeded collection', () => {
    const seeded = new Set(DEFAULT_ARTISTS.map((a) => a.handle.toLowerCase()))
    for (const s of SUGGESTED_ARTISTS) {
      expect(seeded.has(s.handle.toLowerCase())).toBe(false)
    }
  })

  it('has unique handles', () => {
    const handles = SUGGESTED_ARTISTS.map((s) => s.handle.toLowerCase())
    expect(new Set(handles).size).toBe(handles.length)
  })
})

describe('buildSuggestions', () => {
  it('ranks suggestions by overlap with the collection\'s style frequency', () => {
    const out = buildSuggestions(collection, { pool: [
      { handle: 's1', name: 'S1', tags: ['fine-line'] },
      { handle: 's2', name: 'S2', tags: ['dark-illustrative', 'blackwork'] },
      { handle: 's3', name: 'S3', tags: ['realism'] },
    ] })
    // dark-illustrative appears 2×, blackwork 1× → s2 scores 3; fine-line 1× → s1 scores 1; s3 scores 0
    expect(out.map((s) => s.handle)).toEqual(['s2', 's1'])
  })

  it('excludes zero-overlap suggestions entirely', () => {
    const out = buildSuggestions(collection, { pool: [{ handle: 'sx', name: 'SX', tags: ['realism'] }] })
    expect(out).toEqual([])
  })

  it('excludes artists already in the collection (by handle, case-insensitive)', () => {
    const out = buildSuggestions(collection, { pool: [{ handle: 'A1', name: 'Dup', tags: ['blackwork'] }] })
    expect(out).toEqual([])
  })

  it('excludes dismissed handles', () => {
    const out = buildSuggestions(collection, {
      pool: [{ handle: 's1', name: 'S1', tags: ['blackwork'] }],
      dismissed: ['s1'],
    })
    expect(out).toEqual([])
  })

  it('caps results at the requested limit', () => {
    const pool = Array.from({ length: 20 }, (_, i) => ({ handle: `s${i}`, name: `S${i}`, tags: ['blackwork'] }))
    expect(buildSuggestions(collection, { pool, limit: 6 })).toHaveLength(6)
  })

  it('returns an empty list for an empty collection (nothing to match against)', () => {
    expect(buildSuggestions([], { pool: SUGGESTED_ARTISTS })).toEqual([])
  })

  it('defaults its pool to SUGGESTED_ARTISTS', () => {
    const out = buildSuggestions(collection, {})
    expect(out.length).toBeGreaterThan(0)
    out.forEach((s) => expect(SUGGESTED_ARTISTS.some((p) => p.handle === s.handle)).toBe(true))
  })
})
