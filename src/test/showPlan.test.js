import { describe, it, expect } from 'vitest'
import {
  parseBooth,
  preferredStyles,
  buildStudioIndex,
  scoreShowEntry,
  buildShowPlan,
} from '../data/showPlan'
import { indexLineup } from '../data/lineup'
import { seedEntriesFor } from '../data/lineupSeeds'
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS } from '../data/artists'

describe('parseBooth', () => {
  it('reads a plain number', () => {
    expect(parseBooth('No Regrets, Booth 454')).toEqual({ raw: '454', zone: '', number: 454 })
  })

  it('reads a zone-prefixed booth', () => {
    expect(parseBooth('Some Studio, Booth T39')).toEqual({ raw: 'T39', zone: 'T', number: 39 })
  })

  it('reads the first number of a range', () => {
    expect(parseBooth('Studio, Booth 153 - 158')).toEqual({ raw: '153', zone: '', number: 153 })
  })

  it('returns null for a non-numeric or missing booth', () => {
    expect(parseBooth('Studio, Booth AE')).toBeNull()
    expect(parseBooth('No booth mentioned here')).toBeNull()
    expect(parseBooth('')).toBeNull()
  })
})

describe('preferredStyles', () => {
  it('ranks tags by rank-weighted count, most-preferred first', () => {
    const styles = preferredStyles(DEFAULT_ARTISTS)
    expect(styles[0].tag).toBe('dark-illustrative')
    expect(styles.map((s) => s.tag)).toContain('realism')
    // Descending weight.
    for (let i = 1; i < styles.length; i++) {
      expect(styles[i - 1].weight).toBeGreaterThanOrEqual(styles[i].weight)
    }
  })

  it('is empty for an artist list with no tags', () => {
    expect(preferredStyles([{ id: 'a', tags: [], rank: 1 }])).toEqual([])
  })
})

describe('buildStudioIndex', () => {
  it('maps a studio id to the saved artists there', () => {
    const idx = buildStudioIndex(DEFAULT_ARTISTS, DEFAULT_STUDIOS)
    const glitch = idx.get('london-glitch')
    expect(glitch).toBeDefined()
    expect(glitch.artists.some((a) => a.handle === 'berkbosveren')).toBe(true)
  })

  it('matches the line-up’s free-text studio name across every branch that carries it', () => {
    const idx = buildStudioIndex(DEFAULT_ARTISTS, DEFAULT_STUDIOS)
    // "No Regrets Studios" names no city, so it pools every No Regrets branch
    // rather than resolving to one arbitrary one.
    const noRegrets = idx.matchText('No Regrets Studios')
    expect(noRegrets).toBeDefined()
    expect(noRegrets.artists.length).toBe(
      DEFAULT_ARTISTS.filter((a) => (a.studio || '').startsWith('no-regrets')).length
    )
    expect(idx.matchText("London's Glitch")?.id).toBe('london-glitch')
    expect(idx.matchText('Some Unrelated Tattoo Parlour')).toBeUndefined()
  })

  it('never credits a pooled match to one arbitrarily-picked branch', () => {
    // A saying "you follow N artists" is only true of the brand as a whole
    // here — attributing it to one named city ("No Regrets Cheltenham") would
    // claim something about that specific branch that isn't so.
    const idx = buildStudioIndex(DEFAULT_ARTISTS, DEFAULT_STUDIOS)
    const noRegrets = idx.matchText('No Regrets Studios, Booth 380')
    expect(noRegrets.name).not.toMatch(/london|bristol|cardiff|cheltenham|worcester|birmingham/i)
    expect(noRegrets.name).toBe('No Regrets Studios')
  })

  it('names a single-branch match with that branch’s own saved name', () => {
    const idx = buildStudioIndex(DEFAULT_ARTISTS, DEFAULT_STUDIOS)
    expect(idx.matchText("London's Glitch, Booth 362")?.name).toBe('London Glitch')
  })
})

function ctxFor(artists) {
  const studioIndex = buildStudioIndex(artists, DEFAULT_STUDIOS)
  return { artists, attendingIds: [], studioIndex, styles: preferredStyles(artists) }
}

describe('scoreShowEntry', () => {
  const saved = {
    id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['dark-illustrative'], rank: 1,
    studio: 'no-regrets-london',
  }
  const stablemate = { name: 'Studio Mate', handle: '', note: 'No Regrets Studios, Booth 61' }
  const unknown = { name: 'Nobody Known', handle: '', note: 'Some Parlour, Booth 900' }

  it('scores a saved artist highest, a studio stablemate next, an unknown artist lowest', () => {
    const entries = indexLineup(
      [
        { name: '', handle: 'zoia.ink', note: 'Zoia’s Own Booth, Booth 5' },
        stablemate,
        unknown,
      ],
      [saved]
    )
    const ctx = ctxFor([saved])
    const scored = entries.map((e) => scoreShowEntry(e, ctx))
    const [mine, mate, other] = scored
    expect(mine.score).toBeGreaterThan(mate.score)
    expect(mate.score).toBeGreaterThan(other.score)
    expect(mine.savedArtistId).toBe('zoia.ink')
  })

  it('excludes an artist whose saved status is pass', () => {
    const passed = { ...saved, status: 'pass' }
    const [entry] = indexLineup([{ name: '', handle: 'zoia.ink', note: '' }], [passed])
    const result = scoreShowEntry(entry, ctxFor([passed]))
    expect(result.kind).toBe('skipped')
  })

  it('does not assume every saved artist has a status field', () => {
    // DEFAULT_ARTISTS ship with no `status` at all.
    const [entry] = indexLineup([{ name: '', handle: 'zoia.ink', note: '' }], [saved])
    expect(() => scoreShowEntry(entry, ctxFor([saved]))).not.toThrow()
    expect(scoreShowEntry(entry, ctxFor([saved])).kind).not.toBe('skipped')
  })

  it('scores an entry with no booth at all — it just cannot be routed', () => {
    const [entry] = indexLineup([{ name: 'No Booth Artist', handle: '', note: '' }], [])
    const result = scoreShowEntry(entry, ctxFor([]))
    expect(result.score).toEqual(expect.any(Number))
    expect(parseBooth(entry.note)).toBeNull()
  })

  it('credits style-tag overlap with the gallery’s preferred styles', () => {
    const withTags = { id: 'a', handle: 'a', tags: ['dark-illustrative'], rank: 1 }
    const other = { id: 'b', handle: 'b', tags: ['realism'], rank: 2 }
    const [entry] = indexLineup([{ name: '', handle: 'a', note: '' }], [withTags])
    const result = scoreShowEntry(entry, ctxFor([withTags, other]))
    expect(result.reasons.join(' ')).toMatch(/style/i)
  })

  it('never claims a style match for an entry with no known tags at all', () => {
    const [entry] = indexLineup([{ name: 'Nobody Known', handle: '', note: 'Booth 900' }], [])
    const result = scoreShowEntry(entry, ctxFor([]))
    expect(result.reasons.join(' ')).not.toMatch(/style/i)
  })
})

describe('buildShowPlan', () => {
  it('puts every saved artist attending the show in mustSee, and studio stablemates in suggested', () => {
    const entries = seedEntriesFor('big-london')
    const plan = buildShowPlan(entries, { artists: DEFAULT_ARTISTS, studios: DEFAULT_STUDIOS })

    const mustSeeHandles = plan.mustSee.map((m) => m.entry.handle)
    expect(mustSeeHandles).toEqual(
      expect.arrayContaining([
        'carl245tattoo',
        'berkbosveren',
        'androprimo_',
        'silas_balaio',
        'tattoo__amir',
        'johndarktattoo_',
      ])
    )
    expect(plan.mustSee).toHaveLength(6)

    // A No Regrets or Glitch stablemate with no saved-artist match of their own
    // should show up as a suggestion, not buried in the full A-Z list.
    expect(plan.suggested.length).toBeGreaterThan(0)
    const suggestedStudios = plan.suggested.map((s) => s.entry.note)
    expect(suggestedStudios.some((n) => /no regrets/i.test(n))).toBe(true)
  })

  it('never puts a passed artist in mustSee or suggested', () => {
    const passed = DEFAULT_ARTISTS.map((a) =>
      a.handle === 'carl245tattoo' ? { ...a, status: 'pass' } : a
    )
    const plan = buildShowPlan(seedEntriesFor('big-london'), { artists: passed, studios: DEFAULT_STUDIOS })
    expect(plan.mustSee.some((m) => m.entry.handle === 'carl245tattoo')).toBe(false)
    expect(plan.suggested.some((m) => m.entry.handle === 'carl245tattoo')).toBe(false)
    expect(plan.skipped.some((m) => m.entry.handle === 'carl245tattoo')).toBe(true)
  })

  it('returns empty sections rather than throwing for an empty line-up', () => {
    expect(buildShowPlan([], { artists: [], studios: [] })).toEqual({
      mustSee: [],
      suggested: [],
      skipped: [],
    })
  })
})
