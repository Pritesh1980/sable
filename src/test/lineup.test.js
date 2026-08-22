import { describe, it, expect } from 'vitest'
import {
  normaliseHandle,
  parseLineup,
  mergeLineupEntries,
  indexLineup,
  filterLineup,
  groupLineup,
  lineupCounts,
  MAX_LINEUP_ENTRIES,
} from '../data/lineup'

describe('normaliseHandle', () => {
  it('strips @ and lowercases', () => {
    expect(normaliseHandle('@Kubalizmus')).toBe('kubalizmus')
  })

  it('reads a handle out of an Instagram URL', () => {
    expect(normaliseHandle('https://www.instagram.com/oscarakermo/')).toBe('oscarakermo')
  })

  it('rejects anything outside Instagram\'s handle alphabet', () => {
    expect(normaliseHandle('@héllo')).toBe('')
    expect(normaliseHandle('not a handle')).toBe('')
    expect(normaliseHandle('...')).toBe('')
    expect(normaliseHandle('@' + 'a'.repeat(31))).toBe('')
  })
})

describe('parseLineup', () => {
  it('reads "Name @handle" lines', () => {
    expect(parseLineup('Ate Wamz @atewamz')).toEqual([
      { name: 'Ate Wamz', handle: 'atewamz', note: '' },
    ])
  })

  it('reads a bare handle, leaving the name empty', () => {
    expect(parseLineup('@kubalizmus')).toEqual([
      { name: '', handle: 'kubalizmus', note: '' },
    ])
  })

  it('reads a name with no handle at all', () => {
    expect(parseLineup('Martin Kubala')).toEqual([
      { name: 'Martin Kubala', handle: '', note: '' },
    ])
  })

  it('splits a trailing studio/country detail off the name', () => {
    expect(parseLineup('Carlos Valera (@carl245tattoo) — No Regrets, Cardiff')).toEqual([
      { name: 'Carlos Valera', handle: 'carl245tattoo', note: 'No Regrets, Cardiff' },
    ])
  })

  it('reads an Instagram URL line', () => {
    expect(parseLineup('https://www.instagram.com/oscarakermo/')).toEqual([
      { name: '', handle: 'oscarakermo', note: '' },
    ])
  })

  it('skips blanks, A–Z index letters and obvious page chrome', () => {
    const text = ['Artist List', '', 'A', 'Ate Wamz @atewamz', 'Tickets', 'B', '@bogdan'].join('\n')
    expect(parseLineup(text).map((e) => e.handle)).toEqual(['atewamz', 'bogdan'])
  })

  it('skips prose lines that are far too long to be an artist row', () => {
    expect(parseLineup('x'.repeat(200))).toEqual([])
  })

  it('dedupes by handle, then by name', () => {
    const text = ['Ate Wamz @atewamz', 'ate wamz @AteWamz', 'Martin Kubala', 'martin kubala'].join('\n')
    expect(parseLineup(text)).toHaveLength(2)
  })

  it('keeps the richer duplicate (a name beats a bare handle)', () => {
    const entries = parseLineup(['@atewamz', 'Ate Wamz @atewamz'].join('\n'))
    expect(entries).toEqual([{ name: 'Ate Wamz', handle: 'atewamz', note: '' }])
  })

  it('caps a runaway paste', () => {
    const text = Array.from({ length: MAX_LINEUP_ENTRIES + 50 }, (_, i) => `@artist${i}`).join('\n')
    expect(parseLineup(text)).toHaveLength(MAX_LINEUP_ENTRIES)
  })

  it('tolerates junk input', () => {
    expect(parseLineup()).toEqual([])
    expect(parseLineup(null)).toEqual([])
    expect(parseLineup('   \n\n  ')).toEqual([])
  })
})

describe('mergeLineupEntries', () => {
  it('adds new entries and enriches existing ones without duplicating', () => {
    const existing = [{ name: '', handle: 'atewamz', note: '' }]
    const incoming = [
      { name: 'Ate Wamz', handle: 'atewamz', note: 'Manila' },
      { name: 'Martin Kubala', handle: '', note: '' },
    ]
    expect(mergeLineupEntries(existing, incoming)).toEqual([
      { name: 'Ate Wamz', handle: 'atewamz', note: 'Manila' },
      { name: 'Martin Kubala', handle: '', note: '' },
    ])
  })
})

const artists = [
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 6, status: 'shortlisted' },
  { id: 'carlosvalera', handle: 'carl245tattoo', name: 'Carlos Valera', rank: 5 },
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1 },
]

describe('indexLineup', () => {
  it('matches a line-up entry to a saved artist by handle', () => {
    const [entry] = indexLineup([{ name: '', handle: 'carl245tattoo', note: '' }], artists)
    expect(entry.savedArtistId).toBe('carlosvalera')
    expect(entry.artist.rank).toBe(5)
  })

  it('matches on the saved artist id when the handle differs', () => {
    const [entry] = indexLineup([{ name: '', handle: 'zoia.ink', note: '' }], artists)
    expect(entry.savedArtistId).toBe('zoia.ink')
  })

  it('falls back to a normalised name match when no handle is listed', () => {
    const [entry] = indexLineup([{ name: 'oscar  akermo', handle: '', note: '' }], artists)
    expect(entry.savedArtistId).toBe('oscarakermo')
  })

  it('leaves an unknown artist unmatched and labels them by handle', () => {
    const [entry] = indexLineup([{ name: '', handle: 'kubalizmus', note: '' }], artists)
    expect(entry.savedArtistId).toBeNull()
    expect(entry.label).toBe('@kubalizmus')
  })

  it('does not match two different artists to the same saved record', () => {
    const indexed = indexLineup(
      [{ name: 'Oscar Akermo', handle: 'oscarakermo', note: '' }, { name: 'Oscar Akermo', handle: 'fakeoscar', note: '' }],
      artists
    )
    expect(indexed.map((e) => e.savedArtistId)).toEqual(['oscarakermo', null])
  })
})

describe('filterLineup', () => {
  const indexed = indexLineup(
    [
      { name: 'Oscar Akermo', handle: 'oscarakermo', note: '' },
      { name: '', handle: 'kubalizmus', note: '' },
      { name: 'Ate Wamz', handle: 'atewamz', note: 'Manila' },
    ],
    artists
  )

  it('matches on name, handle and note, case-insensitively', () => {
    expect(filterLineup(indexed, { query: 'AKERMO' }).map((e) => e.handle)).toEqual(['oscarakermo'])
    expect(filterLineup(indexed, { query: '@kubal' }).map((e) => e.handle)).toEqual(['kubalizmus'])
    expect(filterLineup(indexed, { query: 'manila' }).map((e) => e.handle)).toEqual(['atewamz'])
  })

  it('narrows to artists already in the gallery, or to new ones', () => {
    expect(filterLineup(indexed, { view: 'saved' }).map((e) => e.handle)).toEqual(['oscarakermo'])
    expect(filterLineup(indexed, { view: 'new' }).map((e) => e.handle)).toEqual(['kubalizmus', 'atewamz'])
  })

  it('returns everything by default', () => {
    expect(filterLineup(indexed, {})).toHaveLength(3)
  })
})

describe('groupLineup', () => {
  it('groups A–Z by label, non-letters last', () => {
    const indexed = indexLineup(
      [
        { name: 'Zoe', handle: '', note: '' },
        { name: '', handle: '_ink', note: '' },
        { name: 'Ate Wamz', handle: '', note: '' },
        { name: 'alpha', handle: '', note: '' },
      ],
      []
    )
    expect(groupLineup(indexed).map((g) => g.letter)).toEqual(['A', 'Z', '#'])
    expect(groupLineup(indexed)[0].entries.map((e) => e.label)).toEqual(['alpha', 'Ate Wamz'])
  })
})

describe('lineupCounts', () => {
  it('counts the line-up and how much of it you already follow', () => {
    const indexed = indexLineup(
      [{ name: '', handle: 'oscarakermo', note: '' }, { name: '', handle: 'kubalizmus', note: '' }],
      artists
    )
    expect(lineupCounts(indexed)).toEqual({ total: 2, saved: 1, fresh: 1 })
  })
})
