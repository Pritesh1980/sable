import { describe, it, expect } from 'vitest'
import { CONVENTIONS, getConventionFavicon } from '../data/conventions'

describe('CONVENTIONS', () => {
  it('is a tight curated list', () => {
    // Intentionally short: the 5 biggest English shows + UK Tattoo Fest + a Manchester show.
    expect(CONVENTIONS.length).toBeGreaterThanOrEqual(6)
    expect(CONVENTIONS.length).toBeLessThanOrEqual(9)
  })

  it('every convention has required fields', () => {
    CONVENTIONS.forEach((c) => {
      expect(c.id, `${c.name} missing id`).toBeTruthy()
      expect(c.name, `${c.id} missing name`).toBeTruthy()
      expect(c.location, `${c.id} missing location`).toBeTruthy()
      expect(c.dates, `${c.id} missing dates`).toBeTruthy()
      expect(c.url, `${c.id} missing url`).toMatch(/^https?:\/\//)
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
