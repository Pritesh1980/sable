import { describe, it, expect } from 'vitest'
import { LINEUP_SEEDS, seedEntriesFor, mergeLineupSeeds } from '../data/lineupSeeds'
import { indexLineup, lineupCounts } from '../data/lineup'
import { DEFAULT_ARTISTS } from '../data/artists'

describe('the shipped Big London line-up', () => {
  it('parses to the artists the show published', () => {
    const entries = seedEntriesFor('big-london@2026')
    expect(entries.length).toBe(466)
    expect(entries[0]).toEqual({
      name: '666 Trinidad',
      handle: '666trinidad',
      note: 'Bonjour Tattoo Parlour, Booth 454',
    })
  })

  it('keeps a booth number on every entry, since that is the point of it', () => {
    const missing = seedEntriesFor('big-london@2026').filter((e) => !/Booth /.test(e.note))
    expect(missing).toEqual([])
  })

  it('carries a handle for all but the two rows the show lists without one', () => {
    const noHandle = seedEntriesFor('big-london@2026').filter((e) => !e.handle)
    expect(noHandle.map((e) => e.name)).toEqual(['Caetano Tattoo'])
  })

  // The whole reason to ship the list: it tells you who you already follow.
  it('cross-references against the saved gallery', () => {
    const indexed = indexLineup(seedEntriesFor('big-london@2026'), DEFAULT_ARTISTS)
    const mine = indexed.filter((e) => e.savedArtistId).map((e) => e.savedArtistId).sort()
    expect(mine).toEqual(['andro', 'berkbosveren', 'carlosvalera', 'johndarktattoo', 'silas_balaio', 'tattoo_amir'])
    expect(lineupCounts(indexed).saved).toBe(6)
  })

  it('is only claimed for the edition that actually has one', () => {
    expect(Object.keys(LINEUP_SEEDS)).toEqual(['big-london@2026'])
    expect(seedEntriesFor('brighton@2026')).toEqual([])
    expect(seedEntriesFor(undefined)).toEqual([])
  })

  // #178: the 2026 exhibitor list is not who is coming in 2027.
  it('is not shown as the line-up of the next edition', () => {
    expect(seedEntriesFor('big-london@2027')).toEqual([])
    expect(mergeLineupSeeds({}, 'big-london@2027')).toEqual([])
  })

  it('still answers to the bare show id, read as its 2026 edition', () => {
    expect(seedEntriesFor('big-london')).toHaveLength(466)
  })
})

describe('mergeLineupSeeds', () => {
  it('serves the shipped list when nothing has been imported', () => {
    expect(mergeLineupSeeds({}, 'big-london@2026').length).toBe(466)
  })

  it('adds an imported artist to the shipped list without duplicating it', () => {
    const stored = {
      'big-london@2026': {
        entries: [
          { name: 'Someone New', handle: 'someonenew', note: '' },
          { name: '666 Trinidad', handle: '666trinidad', note: 'Bonjour Tattoo Parlour, Booth 454' },
        ],
      },
    }
    const merged = mergeLineupSeeds(stored, 'big-london@2026')
    expect(merged.length).toBe(467)
    expect(merged.some((e) => e.handle === 'someonenew')).toBe(true)
  })

  it('lets an import correct a shipped entry rather than sitting alongside it', () => {
    const stored = {
      'big-london@2026': {
        entries: [{ name: '666 Trinidad', handle: '666trinidad', note: 'Moved, Booth 999' }],
      },
    }
    const merged = mergeLineupSeeds(stored, 'big-london@2026')
    expect(merged.length).toBe(466)
    expect(merged.find((e) => e.handle === '666trinidad').note).toBe('Moved, Booth 999')
  })

  it('stays cleared when the list has been cleared, rather than resurrecting the seed', () => {
    expect(mergeLineupSeeds({ 'big-london@2026': { entries: [], cleared: true } }, 'big-london@2026')).toEqual([])
  })

  it('returns imported entries for a convention with no shipped list', () => {
    const stored = { 'brighton@2027': { entries: [{ name: 'X', handle: 'x', note: '' }] } }
    expect(mergeLineupSeeds(stored, 'brighton@2027')).toHaveLength(1)
  })

  // Imports stored before #178 were keyed by show id alone, and were all for
  // the 2026 editions — the only ones the app knew about.
  it('reads an import stored under the bare show id as the 2026 edition', () => {
    const stored = { 'big-london': { entries: [], cleared: true }, brighton: { entries: [{ name: 'X', handle: 'x', note: '' }] } }
    expect(mergeLineupSeeds(stored, 'big-london@2026')).toEqual([])
    expect(mergeLineupSeeds(stored, 'brighton@2026')).toHaveLength(1)
    expect(mergeLineupSeeds(stored, 'brighton@2027')).toEqual([])
  })
})
