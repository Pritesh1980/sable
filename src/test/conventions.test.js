import { describe, it, expect } from 'vitest'
import { CONVENTIONS, getConventionFavicon, toggleConventionAttendee } from '../data/conventions'
import { DEFAULT_ARTISTS } from '../data/artists'

describe('CONVENTIONS', () => {
  it('is a tight curated list', () => {
    // Intentionally short: the 5 biggest English shows + UK Tattoo Fest + a Manchester show.
    expect(CONVENTIONS.length).toBeGreaterThanOrEqual(6)
    expect(CONVENTIONS.length).toBeLessThanOrEqual(9)
  })

  // A convention's own domain can lapse after this list was curated and get
  // repurposed by whoever registers it next (london-international, Sept 2026:
  // the root now serves an unrelated affiliate page, verified by fetching it,
  // not assumed from search results). Sable must not keep linking users to
  // that. Rather than relax the check for everyone, name the one exception —
  // so a *different* convention silently losing its url still fails loudly.
  const URL_NOT_REQUIRED = new Set(['london-international'])

  it('every convention has required fields', () => {
    CONVENTIONS.forEach((c) => {
      expect(c.id, `${c.name} missing id`).toBeTruthy()
      expect(c.name, `${c.id} missing name`).toBeTruthy()
      expect(c.location, `${c.id} missing location`).toBeTruthy()
      expect(c.dates, `${c.id} missing dates`).toBeTruthy()
      if (URL_NOT_REQUIRED.has(c.id)) {
        expect(c.url, `${c.id} should be explicitly falsy while its domain is bad, not a stray string`).toBeFalsy()
      } else {
        expect(c.url, `${c.id} missing url`).toMatch(/^https?:\/\//)
      }
      expect(c.summary, `${c.id} missing summary`).toBeTruthy()
    })
  })

  it('has unique ids', () => {
    const ids = CONVENTIONS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes the local Milton Keynes show at zero distance', () => {
    const local = CONVENTIONS.find((c) => c.distanceMiles === 0)
    expect(local, 'expected a Milton Keynes convention at 0 miles').toBeTruthy()
    expect(local.location.toLowerCase()).toContain('milton keynes')
  })

  it('includes a Manchester show', () => {
    const manchester = CONVENTIONS.find((c) => c.location.toLowerCase().includes('manchester'))
    expect(manchester, 'expected a Manchester convention').toBeTruthy()
  })

  it('only lists attending artists that exist in DEFAULT_ARTISTS', () => {
    // Soft foreign key: consumers filter on `attendingArtistIds.includes(artist.id)`,
    // so a typo'd id fails silently (no badge, no error). Catch it here instead.
    const known = new Set(DEFAULT_ARTISTS.map((a) => a.id))
    CONVENTIONS.forEach((c) => {
      const unknown = (c.attendingArtistIds ?? []).filter((id) => !known.has(id))
      expect(unknown, `${c.id} lists unknown artist ids: ${unknown.join(', ')}`).toEqual([])
    })
  })

  it('has no duplicate attending artists per convention', () => {
    CONVENTIONS.forEach((c) => {
      const ids = c.attendingArtistIds ?? []
      expect(new Set(ids).size, `${c.id} has duplicate attending artist ids`).toBe(ids.length)
    })
  })

  it('marks some as popular but not all', () => {
    const popular = CONVENTIONS.filter((c) => c.popular)
    expect(popular.length).toBeGreaterThan(0)
    expect(popular.length).toBeLessThanOrEqual(CONVENTIONS.length)
  })
})

describe('getConventionFavicon', () => {
  it('derives a Google favicon url from the convention url', () => {
    const url = getConventionFavicon({ url: 'https://www.brightontattoo.com/' })
    expect(url).toContain('brightontattoo.com')
    expect(url).toMatch(/^https:\/\/www\.google\.com\/s2\/favicons/)
  })

  it('handles http urls', () => {
    const url = getConventionFavicon({ url: 'http://example.com/path' })
    expect(url).toContain('example.com')
  })

  it('returns empty string for missing url', () => {
    expect(getConventionFavicon({})).toBe('')
  })
})

describe('toggleConventionAttendee', () => {
  it('adds an artist when not already attending', () => {
    const next = toggleConventionAttendee({}, 'brighton', 'zoia.ink', [])
    expect(next.brighton).toEqual(['zoia.ink'])
  })

  it('removes an artist when already attending', () => {
    const next = toggleConventionAttendee({ brighton: ['zoia.ink', 'keremtattz'] }, 'brighton', 'zoia.ink', ['zoia.ink', 'keremtattz'])
    expect(next.brighton).toEqual(['keremtattz'])
  })

  it('seeds from the current merged list so base attendees are preserved', () => {
    // No override yet for this convention, but base data lists keremtattz.
    const next = toggleConventionAttendee({}, 'brighton', 'zoia.ink', ['keremtattz'])
    expect(next.brighton).toEqual(['keremtattz', 'zoia.ink'])
  })

  it('leaves other conventions untouched', () => {
    const next = toggleConventionAttendee({ 'big-london': ['oscarakermo'] }, 'brighton', 'zoia.ink', [])
    expect(next['big-london']).toEqual(['oscarakermo'])
    expect(next.brighton).toEqual(['zoia.ink'])
  })
})
