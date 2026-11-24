import { describe, it, expect } from 'vitest'
import { worthTheTrip, FAR_MILES } from '../data/worthTheTrip'
import { seedEntriesFor, curatedPicksFor } from '../data/lineupSeeds'
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS } from '../data/artists'

const studios = [{ id: 'no-regrets-london', name: 'No Regrets London' }]
const artists = [
  { id: 'top', handle: 'top.ink', name: 'Top', rank: 1, studio: 'no-regrets-london' },
  { id: 'mid', handle: 'mid.ink', name: 'Mid', rank: 12 },
  { id: 'low', handle: 'low.ink', name: 'Low', rank: 29 },
]
const stranger = { name: 'Stranger', handle: 'stranger', note: 'Elsewhere Ink, Booth 9' }
const stablemate = { name: 'Mate', handle: 'mate', note: 'No Regrets Studios, Booth 61' }

const verdictFor = (over = {}) =>
  worthTheTrip({ distanceMiles: 55, artists, studios, attendingIds: [], entries: [], curated: {}, ...over })

describe('worthTheTrip', () => {
  it('says it is too early when there is no line-up and nobody marked attending', () => {
    expect(verdictFor()).toEqual({
      verdict: 'unknown',
      label: 'Too early to say',
      reasons: ['no line-up or attending artists yet'],
    })
  })

  it('goes for one of your artists marked attending, even with no line-up', () => {
    const v = verdictFor({ attendingIds: ['mid'] })
    expect(v.verdict).toBe('go')
    expect(v.label).toBe('Worth the trip')
    expect(v.reasons).toEqual(['1 of your artists, #12'])
  })

  it('names the best-ranked artist when several are going', () => {
    const v = verdictFor({ attendingIds: ['low', 'top', 'mid'] })
    expect(v.reasons[0]).toBe('3 of your artists, best #1')
  })

  it('counts an artist once when they are both marked attending and on the line-up', () => {
    const v = verdictFor({
      attendingIds: ['mid'],
      entries: [{ name: 'Mid', handle: 'mid.ink', note: 'Booth 4' }],
    })
    expect(v.reasons[0]).toBe('1 of your artists, #12')
  })

  it('finds your artists on the line-up without them being marked attending', () => {
    const v = verdictFor({ entries: [{ name: 'Low', handle: 'low.ink', note: 'Booth 4' }, stranger] })
    expect(v.verdict).toBe('go')
    expect(v.reasons[0]).toBe('1 of your artists, #29')
  })

  it('says maybe for one lower-ranked artist at a far show', () => {
    const v = verdictFor({ distanceMiles: FAR_MILES + 30, attendingIds: ['mid'] })
    expect(v.verdict).toBe('maybe')
    expect(v.label).toBe('Maybe')
    expect(v.reasons).toEqual(['1 of your artists, #12', 'a long way for 1 artist'])
  })

  it('still goes far for your top-ranked artist', () => {
    expect(verdictFor({ distanceMiles: FAR_MILES + 30, attendingIds: ['top'] }).verdict).toBe('go')
  })

  it('still goes far for two of your artists', () => {
    expect(verdictFor({ distanceMiles: FAR_MILES + 30, attendingIds: ['mid', 'low'] }).verdict).toBe('go')
  })

  it('says maybe when only a stablemate at a studio you follow is there', () => {
    const v = verdictFor({ entries: [stablemate, stranger] })
    expect(v.verdict).toBe('maybe')
    expect(v.reasons).toEqual(['1 at a studio you follow'])
  })

  it('goes for anything at all on your doorstep', () => {
    const v = verdictFor({ distanceMiles: 0, entries: [stablemate] })
    expect(v.verdict).toBe('go')
    expect(v.reasons).toEqual(['1 at a studio you follow', 'on your doorstep'])
  })

  it('says skip when the line-up has none of your artists, picks or studios', () => {
    expect(verdictFor({ entries: [stranger] })).toEqual({
      verdict: 'skip',
      label: 'Skip it',
      reasons: ['none of your artists or studios on the line-up'],
    })
  })

  it('counts a priority field-guide pick but not a speculative wildcard', () => {
    const entries = [stranger, { name: 'Guide', handle: 'guide', note: 'Booth 7' }]
    const priority = verdictFor({ entries, curated: { guide: { tier: 'priority', why: 'x' } } })
    expect(priority.verdict).toBe('maybe')
    expect(priority.reasons).toEqual(['1 field-guide pick'])

    // A wildcard is "go and decide", not a reason to make the trip.
    const wildcard = verdictFor({ entries, curated: { guide: { tier: 'wildcard', why: 'x' } } })
    expect(wildcard.verdict).toBe('skip')
  })

  it('ignores attending ids that are not in your gallery', () => {
    expect(verdictFor({ attendingIds: ['deleted-artist'] }).verdict).toBe('unknown')
  })

  it('treats an unknown distance as within reach', () => {
    expect(verdictFor({ distanceMiles: null, attendingIds: ['mid'] }).verdict).toBe('go')
  })

  // The proof it works on real data: Big London 2026 with the shipped gallery.
  it('calls Big London 2026 worth the trip, with the reasons from Top picks', () => {
    const key = 'big-london@2026'
    const v = worthTheTrip({
      distanceMiles: 55,
      artists: DEFAULT_ARTISTS,
      studios: DEFAULT_STUDIOS,
      attendingIds: [],
      entries: seedEntriesFor(key),
      curated: curatedPicksFor(key),
    })
    expect(v.verdict).toBe('go')
    expect(v.reasons).toEqual(['6 of your artists, best #5', '4 field-guide picks', '9 at studios you follow'])
  })
})
