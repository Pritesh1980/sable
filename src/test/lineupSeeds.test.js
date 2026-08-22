import { describe, it, expect } from 'vitest'
import { LINEUP_SEEDS, seedEntriesFor, mergeLineupSeeds } from '../data/lineupSeeds'
import { indexLineup, lineupCounts } from '../data/lineup'
import { DEFAULT_ARTISTS } from '../data/artists'

describe('the shipped Big London line-up', () => {
  it('parses to the artists the show published', () => {
    const entries = seedEntriesFor('big-london')
    expect(entries.length).toBe(466)
    expect(entries[0]).toEqual({
      name: '666 Trinidad',
      handle: '666trinidad',
      note: 'Bonjour Tattoo Parlour, Booth 454',
    })
  })

  it('keeps a booth number on every entry, since that is the point of it', () => {
    const missing = seedEntriesFor('big-london').filter((e) => !/Booth /.test(e.note))
    expect(missing).toEqual([])
  })

  it('carries a handle for all but the two rows the show lists without one', () => {
    const noHandle = seedEntriesFor('big-london').filter((e) => !e.handle)
    expect(noHandle.map((e) => e.name)).toEqual(['Caetano Tattoo'])
  })

  // The whole reason to ship the list: it tells you who you already follow.
  it('cross-references against the saved gallery', () => {
    const indexed = indexLineup(seedEntriesFor('big-london'), DEFAULT_ARTISTS)
    const mine = indexed.filter((e) => e.savedArtistId).map((e) => e.savedArtistId).sort()
    expect(mine).toEqual(['andro', 'berkbosveren', 'carlosvalera', 'johndarktattoo', 'silas_balaio', 'tattoo_amir'])
    expect(lineupCounts(indexed).saved).toBe(6)
  })

  it('is only claimed for conventions that actually have one', () => {
    expect(Object.keys(LINEUP_SEEDS)).toEqual(['big-london'])
    expect(seedEntriesFor('brighton')).toEqual([])
    expect(seedEntriesFor(undefined)).toEqual([])
  })
})

describe('mergeLineupSeeds', () => {
  it('serves the shipped list when nothing has been imported', () => {
    expect(mergeLineupSeeds({}, 'big-london').length).toBe(466)
  })

  it('adds an imported artist to the shipped list without duplicating it', () => {
    const stored = {
      'big-london': {
        entries: [
          { name: 'Someone New', handle: 'someonenew', note: '' },
          { name: '666 Trinidad', handle: '666trinidad', note: 'Bonjour Tattoo Parlour, Booth 454' },
        ],
      },
    }
    const merged = mergeLineupSeeds(stored, 'big-london')
    expect(merged.length).toBe(467)
    expect(merged.some((e) => e.handle === 'someonenew')).toBe(true)
  })

  it('lets an import correct a shipped entry rather than sitting alongside it', () => {
    const stored = {
      'big-london': {
        entries: [{ name: '666 Trinidad', handle: '666trinidad', note: 'Moved, Booth 999' }],
      },
    }
    const merged = mergeLineupSeeds(stored, 'big-london')
    expect(merged.length).toBe(466)
    expect(merged.find((e) => e.handle === '666trinidad').note).toBe('Moved, Booth 999')
  })

  it('stays cleared when the list has been cleared, rather than resurrecting the seed', () => {
    expect(mergeLineupSeeds({ 'big-london': { entries: [], cleared: true } }, 'big-london')).toEqual([])
  })

  it('returns imported entries for a convention with no shipped list', () => {
    const stored = { brighton: { entries: [{ name: 'X', handle: 'x', note: '' }] } }
    expect(mergeLineupSeeds(stored, 'brighton')).toHaveLength(1)
  })
})
