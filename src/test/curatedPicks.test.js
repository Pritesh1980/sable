import { describe, it, expect } from 'vitest'
import { BIG_LONDON_2026_PICKS } from '../data/lineups/bigLondon2026Picks'
import { CURATED_PICKS, seedEntriesFor } from '../data/lineupSeeds'
import { buildShowPlan } from '../data/showPlan'
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS } from '../data/artists'

const entries = seedEntriesFor('big-london')
const lineupHandles = new Set(entries.map((e) => e.handle).filter(Boolean))

describe('Big London curated picks', () => {
  it('is wired to the convention it belongs to', () => {
    expect(CURATED_PICKS['big-london']).toBe(BIG_LONDON_2026_PICKS)
  })

  it('uses only the two meaningful tiers', () => {
    for (const [handle, pick] of Object.entries(BIG_LONDON_2026_PICKS)) {
      expect(['priority', 'wildcard'], handle).toContain(pick.tier)
      expect(pick.why, handle).toBeTruthy()
    }
  })

  // The trap this guards: the field guide gave Clara Grech as @claragrechtattoo
  // while the show lists her as @zap.ink. A pick keyed on the wrong handle
  // matches nothing and silently vanishes from Top picks.
  it('keys picks on handles the show actually lists, so none silently miss', () => {
    const notInLineup = Object.keys(BIG_LONDON_2026_PICKS).filter((h) => !lineupHandles.has(h))
    // Tolga is the one known exception: a saved favourite the line-up omits.
    expect(notInLineup).toEqual(['tolgatemirlenk.ink'])
  })

  it('puts the priority picks in mustSee and the wildcards in their own section', () => {
    const plan = buildShowPlan(entries, {
      artists: DEFAULT_ARTISTS,
      studios: DEFAULT_STUDIOS,
      curated: BIG_LONDON_2026_PICKS,
    })
    const mustSee = plan.mustSee.map((m) => m.entry.handle)
    for (const h of ['thomascarlijarlier', 'lennoxtattoo', 'davidcorden', 'zap.ink']) {
      expect(mustSee, h).toContain(h)
    }
    expect(plan.wildcards.map((w) => w.entry.handle).sort()).toEqual(
      ['atewamz', 'carterhewlett', 'jonnyransomtattoo', 'kubalizmus', 'londonslade'].sort()
    )
  })

  it('reports the favourite the line-up does not list, rather than dropping him', () => {
    const plan = buildShowPlan(entries, {
      artists: DEFAULT_ARTISTS,
      studios: DEFAULT_STUDIOS,
      curated: BIG_LONDON_2026_PICKS,
    })
    expect(plan.missing.map((m) => m.handle)).toEqual(['tolgatemirlenk.ink'])
  })

  it('never lets a wildcard outrank a saved artist or a priority pick', () => {
    const plan = buildShowPlan(entries, {
      artists: DEFAULT_ARTISTS,
      studios: DEFAULT_STUDIOS,
      curated: BIG_LONDON_2026_PICKS,
    })
    const lowestMustSee = Math.min(...plan.mustSee.map((m) => m.score))
    const highestWildcard = Math.max(...plan.wildcards.map((w) => w.score))
    expect(highestWildcard).toBeLessThan(lowestMustSee)
  })
})
