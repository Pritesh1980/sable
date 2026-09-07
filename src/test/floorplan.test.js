import { describe, it, expect } from 'vitest'
import { BIG_LONDON_2026_FLOORPLAN, INTERPOLATED_BOOTHS } from '../data/lineups/bigLondon2026Floorplan'
import { seedEntriesFor } from '../data/lineupSeeds'
import { DEFAULT_ARTISTS } from '../data/artists'

const boothOf = (note) => (note.match(/Booth ([A-Z]{0,2}[0-9]+)/) || [])[1] || ''
const entries = seedEntriesFor('big-london')

describe('Big London floorplan coordinates', () => {
  it('places 398 of the line-up booths', () => {
    expect(Object.keys(BIG_LONDON_2026_FLOORPLAN)).toHaveLength(398)
  })

  it('holds every position as a normalised [x, y] inside the plan', () => {
    for (const [booth, xy] of Object.entries(BIG_LONDON_2026_FLOORPLAN)) {
      expect(xy, booth).toHaveLength(2)
      for (const v of xy) {
        expect(Number.isFinite(v), booth).toBe(true)
        expect(v, booth).toBeGreaterThanOrEqual(0)
        expect(v, booth).toBeLessThanOrEqual(1)
      }
    }
  })

  it('only places booths that someone in the line-up actually occupies', () => {
    const occupied = new Set(entries.map((e) => boothOf(e.note)).filter(Boolean))
    const stray = Object.keys(BIG_LONDON_2026_FLOORPLAN).filter((b) => !occupied.has(b))
    expect(stray).toEqual([])
  })

  // The point of the whole exercise: the owner's own artists must be placeable.
  it('places every saved artist who is at the show', () => {
    const handles = new Set(DEFAULT_ARTISTS.map((a) => a.handle.toLowerCase()))
    const mine = entries.filter((e) => handles.has(e.handle))
    expect(mine.length).toBeGreaterThanOrEqual(6)
    for (const e of mine) {
      expect(BIG_LONDON_2026_FLOORPLAN[boothOf(e.note)], `${e.name} @${e.handle}`).toBeDefined()
    }
  })

  // Guards the documented gaps: a future re-extraction that silently invents
  // positions for these would be wrong, not an improvement.
  it('leaves the booths the plan does not draw unplaced', () => {
    for (const booth of ['122', '233', '322', '521', '556', 'T1', 'P2']) {
      expect(BIG_LONDON_2026_FLOORPLAN[booth], booth).toBeUndefined()
    }
  })

  it('flags the interpolated booths, and they are all placed', () => {
    expect(INTERPOLATED_BOOTHS).toHaveLength(8)
    for (const booth of INTERPOLATED_BOOTHS) {
      expect(BIG_LONDON_2026_FLOORPLAN[booth], booth).toBeDefined()
    }
  })
})
