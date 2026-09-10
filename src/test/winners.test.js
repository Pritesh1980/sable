import { describe, it, expect } from 'vitest'
import {
  AWARD_CATEGORIES,
  MAX_WINNER_ENTRIES,
  groupWinners,
  indexWinners,
  mergeWinnerEntries,
  normaliseCategory,
  normalisePlacing,
  parseWinners,
  winnerArtistDraft,
  winnerCounts,
  winnerKey,
} from '../data/winners'

describe('normalisePlacing', () => {
  it('reads the ordinal forms a results board uses', () => {
    expect(normalisePlacing('1st')).toBe(1)
    expect(normalisePlacing('2nd')).toBe(2)
    expect(normalisePlacing('3rd')).toBe(3)
  })

  it('reads words and bare numbers', () => {
    expect(normalisePlacing('First')).toBe(1)
    expect(normalisePlacing('second')).toBe(2)
    expect(normalisePlacing('3')).toBe(3)
    expect(normalisePlacing('winner')).toBe(1)
  })

  it('reads the medal emoji a show posts on Instagram', () => {
    expect(normalisePlacing('🥇')).toBe(1)
    expect(normalisePlacing('🥈')).toBe(2)
    expect(normalisePlacing('🥉')).toBe(3)
  })

  it('is null for anything that is not a placing', () => {
    expect(normalisePlacing('Oscar')).toBeNull()
    expect(normalisePlacing('')).toBeNull()
    expect(normalisePlacing('4th')).toBeNull()
  })

  it('is null for an unrelated emoji rather than a stray surrogate half', () => {
    expect(normalisePlacing('🎉')).toBeNull()
  })
})

describe('normaliseCategory', () => {
  it('maps a canonical category to itself', () => {
    expect(normaliseCategory('Best of Show')).toBe('Best of Show')
  })

  it('is case and punctuation insensitive', () => {
    expect(normaliseCategory('BEST OF SHOW:')).toBe('Best of Show')
    expect(normaliseCategory('  best of show  ')).toBe('Best of Show')
  })

  it('folds the ways a show writes black and grey', () => {
    expect(normaliseCategory('Best Black and Grey')).toBe('Best Black & Grey')
    expect(normaliseCategory('black & grey')).toBe('Best Black & Grey')
    expect(normaliseCategory('B&G')).toBe('Best Black & Grey')
  })

  it('accepts a category without the "Best" prefix', () => {
    expect(normaliseCategory('Realism')).toBe('Best Realism')
    expect(normaliseCategory('Blackwork')).toBe('Best Blackwork')
  })

  it('keeps an unknown category as tidied text rather than dropping it', () => {
    expect(normaliseCategory('Best Tribal:')).toBe('Best Tribal')
  })

  it('is empty for nothing', () => {
    expect(normaliseCategory('')).toBe('')
    expect(normaliseCategory(null)).toBe('')
  })
})

describe('parseWinners', () => {
  it('applies a heading category to the rows beneath it', () => {
    const entries = parseWinners(`
Best Black & Grey
1st - Oscar Akermo @oscarakermo
2nd - Zoia @zoia.ink
`)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      category: 'Best Black & Grey',
      placing: 1,
      name: 'Oscar Akermo',
      handle: 'oscarakermo',
    })
    expect(entries[1]).toMatchObject({ category: 'Best Black & Grey', placing: 2, handle: 'zoia.ink' })
  })

  it('switches category when a new heading appears', () => {
    const entries = parseWinners(`
Best Colour
1st - Carlos Valera @carl245tattoo
Best Realism
1st - Sena @senatatts
`)
    expect(entries.map((e) => e.category)).toEqual(['Best Colour', 'Best Realism'])
  })

  it('parses the inline pipe form', () => {
    const [entry] = parseWinners('Best of Show | 1st | Oscar Akermo @oscarakermo')
    expect(entry).toMatchObject({
      category: 'Best of Show',
      placing: 1,
      name: 'Oscar Akermo',
      handle: 'oscarakermo',
    })
  })

  it('keeps the studio note after a dash separator', () => {
    const [entry] = parseWinners(`
Best Large
1st - Martin Kubala @kubalizmus - Nordic Ink, Slovakia
`)
    expect(entry.note).toBe('Nordic Ink, Slovakia')
    expect(entry.name).toBe('Martin Kubala')
  })

  it('reads an instagram url as the handle', () => {
    const [entry] = parseWinners(`
Best Fine Line
1st - Asha https://instagram.com/lekhani.ink
`)
    expect(entry.handle).toBe('lekhani.ink')
  })

  it('keeps a row with no placing', () => {
    const [entry] = parseWinners(`
Best of Show
Oscar Akermo @oscarakermo
`)
    expect(entry).toMatchObject({ category: 'Best of Show', placing: null, handle: 'oscarakermo' })
  })

  it('files a row with no heading under no category', () => {
    const [entry] = parseWinners('1st - Oscar Akermo @oscarakermo')
    expect(entry.category).toBe('')
  })

  it('drops page chrome and prose', () => {
    const entries = parseWinners(`
Results
Competition Winners
Congratulations to everyone who entered this year, it was an incredible show and the judges had a very hard time.
Best Colour
1st - Carlos Valera @carl245tattoo
`)
    expect(entries).toHaveLength(1)
    expect(entries[0].handle).toBe('carl245tattoo')
  })

  it('rejects a handle that is not instagram-shaped', () => {
    const [entry] = parseWinners(`
Best Colour
1st - Someone @not-a-handle!!
`)
    expect(entry.handle).toBe('')
  })

  it('dedupes the same artist winning the same category twice', () => {
    const entries = parseWinners(`
Best Colour
1st - Oscar Akermo @oscarakermo
1st - Oscar Akermo @oscarakermo
`)
    expect(entries).toHaveLength(1)
  })

  it('keeps the same artist winning two different categories', () => {
    const entries = parseWinners(`
Best Colour
1st - Oscar Akermo @oscarakermo
Best of Show
1st - Oscar Akermo @oscarakermo
`)
    expect(entries).toHaveLength(2)
  })

  it('caps a runaway paste', () => {
    const lines = ['Best Colour']
    for (let i = 0; i < MAX_WINNER_ENTRIES + 50; i += 1) lines.push(`1st - Artist ${i} @artist${i}`)
    expect(parseWinners(lines.join('\n')).length).toBe(MAX_WINNER_ENTRIES)
  })

  it('is empty for empty input', () => {
    expect(parseWinners('')).toEqual([])
    expect(parseWinners(null)).toEqual([])
  })
})

describe('mergeWinnerEntries', () => {
  const base = { category: 'Best Colour', placing: 1, name: '', handle: 'oscarakermo', note: '' }

  it('adds rows that are new', () => {
    const merged = mergeWinnerEntries([base], [{ ...base, category: 'Best of Show' }])
    expect(merged).toHaveLength(2)
  })

  it('lets a richer row win', () => {
    const merged = mergeWinnerEntries([base], [{ ...base, name: 'Oscar Akermo' }])
    expect(merged).toHaveLength(1)
    expect(merged[0].name).toBe('Oscar Akermo')
  })

  it('preserves photos the user attached when the row is re-imported', () => {
    const withPhoto = { ...base, photoIds: ['p1'] }
    const merged = mergeWinnerEntries([withPhoto], [{ ...base, name: 'Oscar Akermo' }])
    expect(merged[0].photoIds).toEqual(['p1'])
    expect(merged[0].name).toBe('Oscar Akermo')
  })

  it('unions photos when both sides carry different shots of the same piece', () => {
    const merged = mergeWinnerEntries([{ ...base, photoIds: ['p1'] }], [{ ...base, photoIds: ['p2'] }])
    expect(merged[0].photoIds).toEqual(['p1', 'p2'])
  })

  it('caps the merged list', () => {
    const many = Array.from({ length: MAX_WINNER_ENTRIES + 10 }, (_, i) => ({
      ...base,
      handle: `artist${i}`,
    }))
    expect(mergeWinnerEntries([], many).length).toBe(MAX_WINNER_ENTRIES)
  })
})

describe('indexWinners', () => {
  const artists = [
    { id: 'oscar', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 3 },
    { id: 'zoia', handle: 'zoia.ink', name: 'Zoia', rank: 1 },
  ]

  it('matches a winner to a saved artist by handle', () => {
    const [entry] = indexWinners([{ category: 'Best Colour', placing: 1, handle: 'oscarakermo', name: '', note: '' }], artists)
    expect(entry.savedArtistId).toBe('oscar')
    expect(entry.artist.rank).toBe(3)
  })

  it('falls back to the name when the results list prints no handle', () => {
    const [entry] = indexWinners([{ category: 'Best Colour', placing: 1, handle: '', name: 'Zoia', note: '' }], artists)
    expect(entry.savedArtistId).toBe('zoia')
  })

  it('leaves an unknown winner unmatched', () => {
    const [entry] = indexWinners([{ category: 'Best Colour', placing: 1, handle: 'nobody', name: '', note: '' }], artists)
    expect(entry.savedArtistId).toBeNull()
    expect(entry.artist).toBeNull()
  })

  it('labels a row by name, falling back to the handle', () => {
    const [named, handled] = indexWinners(
      [
        { category: 'x', placing: 1, handle: 'oscarakermo', name: 'Oscar Akermo', note: '' },
        { category: 'x', placing: 2, handle: 'someone', name: '', note: '' },
      ],
      []
    )
    expect(named.label).toBe('Oscar Akermo')
    expect(handled.label).toBe('@someone')
  })

  it('lets the same artist match in two different categories', () => {
    const indexed = indexWinners(
      [
        { category: 'Best Colour', placing: 1, handle: 'oscarakermo', name: '', note: '' },
        { category: 'Best of Show', placing: 1, handle: 'oscarakermo', name: '', note: '' },
      ],
      artists
    )
    expect(indexed.every((e) => e.savedArtistId === 'oscar')).toBe(true)
  })
})

describe('groupWinners', () => {
  const rows = [
    { category: 'Best Colour', placing: 2, label: 'B', handle: 'b', name: 'B', note: '' },
    { category: 'Best of Show', placing: 1, label: 'A', handle: 'a', name: 'A', note: '' },
    { category: 'Best Colour', placing: 1, label: 'C', handle: 'c', name: 'C', note: '' },
  ]

  it('puts Best of Show first, whatever order it was pasted in', () => {
    expect(groupWinners(rows)[0].category).toBe('Best of Show')
  })

  it('orders rows within a category by placing', () => {
    const colour = groupWinners(rows).find((g) => g.category === 'Best Colour')
    expect(colour.entries.map((e) => e.placing)).toEqual([1, 2])
  })

  it('sorts a category the taxonomy does not know after the ones it does', () => {
    const groups = groupWinners([
      { category: 'Best Tribal', placing: 1, label: 'X', handle: 'x', name: 'X', note: '' },
      { category: 'Best Realism', placing: 1, label: 'Y', handle: 'y', name: 'Y', note: '' },
    ])
    expect(groups.map((g) => g.category)).toEqual(['Best Realism', 'Best Tribal'])
  })

  it('files uncategorised rows last under a readable heading', () => {
    const groups = groupWinners([
      { category: '', placing: 1, label: 'X', handle: 'x', name: 'X', note: '' },
      { category: 'Best Realism', placing: 1, label: 'Y', handle: 'y', name: 'Y', note: '' },
    ])
    expect(groups.at(-1).category).toBe('Other awards')
  })
})

describe('winnerCounts', () => {
  it('counts winners, gallery matches and attached photos', () => {
    const counts = winnerCounts([
      { savedArtistId: 'a', photoIds: ['p1', 'p2'] },
      { savedArtistId: null },
      { savedArtistId: 'b', photoIds: [] },
    ])
    expect(counts).toEqual({ total: 3, saved: 2, fresh: 1, photos: 2 })
  })
})

describe('winnerKey', () => {
  const entries = [
    { category: 'Best Colour', placing: 1, handle: 'oscarakermo', name: '', note: '' },
    { category: 'Best of Show', placing: 1, handle: 'oscarakermo', name: '', note: '' },
  ]

  it('keys a winner by category and artist so one artist can win twice', () => {
    expect(winnerKey(entries[0])).not.toBe(winnerKey(entries[1]))
  })

  it('is empty when there is nothing to identify the winner by', () => {
    expect(winnerKey({ category: 'Best Colour', name: '', handle: '' })).toBe('')
  })
})

describe('winnerArtistDraft', () => {
  it('builds a draft that says where the artist was spotted', () => {
    const draft = winnerArtistDraft(
      { category: 'Best Black & Grey', placing: 1, handle: 'oscarakermo', name: 'Oscar Akermo', note: '' },
      'Big London Tattoo Show'
    )
    expect(draft).toMatchObject({ handle: 'oscarakermo', name: 'Oscar Akermo', status: 'researching' })
    expect(draft.note).toContain('Best Black & Grey')
    expect(draft.note).toContain('Big London Tattoo Show')
  })

  it('leaves tags empty — an award category is not a style tag', () => {
    const draft = winnerArtistDraft({ category: 'Best Realism', placing: 1, handle: 'x', name: '', note: '' }, 'Show')
    expect(draft.tags).toEqual([])
  })
})

describe('AWARD_CATEGORIES', () => {
  it('leads with the show-wide prizes', () => {
    expect(AWARD_CATEGORIES.slice(0, 2)).toEqual(['Best of Show', 'Best of Day'])
  })

  it('has no duplicates', () => {
    expect(new Set(AWARD_CATEGORIES).size).toBe(AWARD_CATEGORIES.length)
  })
})
