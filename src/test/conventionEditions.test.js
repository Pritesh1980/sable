import { describe, it, expect } from 'vitest'
import {
  CONVENTIONS,
  LEGACY_EDITION,
  currentEdition,
  editionKey,
  mergeConventionOverrides,
  migrateEditionMap,
  normaliseEditionKey,
  pastAttendance,
  toggleConventionAttendee,
  viewEdition,
} from '../data/conventions'
import { parseBackup } from '../data/export'

// #178: every show recurs, and attendance, line-ups and winners belong to one
// edition of it. Stored by show id alone, moving the dates on a year would have
// claimed everyone who went to Big London 2026 is going in 2027.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH = /^\d{4}-\d{2}$/
const NOV_2026 = new Date(2026, 10, 5)

describe('CONVENTIONS editions', () => {
  it('gives every show its editions, oldest first, one per year', () => {
    CONVENTIONS.forEach((c) => {
      const years = (c.editions || []).map((e) => e.year)
      expect(years.length, `${c.id} has no editions`).toBeGreaterThan(0)
      expect(years, `${c.id} editions out of order`).toEqual([...years].sort((a, b) => a - b))
      expect(new Set(years).size, `${c.id} repeats a year`).toBe(years.length)
      years.forEach((y) => expect(Number.isInteger(y), `${c.id} year ${y}`).toBe(true))
    })
  })

  it('lists the 2027 edition of every show', () => {
    CONVENTIONS.forEach((c) => {
      expect(c.editions.some((e) => e.year === 2027), `${c.id} has no 2027 edition`).toBe(true)
    })
  })

  it('dates every edition to the day, or to the month when the day is not known', () => {
    CONVENTIONS.forEach((c) => c.editions.forEach((e) => {
      const at = `${c.id}@${e.year}`
      expect(e.dates, `${at} missing dates text`).toBeTruthy()
      expect(e.dates, `${at} dates text should name its year`).toContain(String(e.year))
      if (e.endDate) {
        expect(e.endDate, `${at} endDate`).toMatch(ISO_DAY)
        expect(e.startDate, `${at} needs a startDate with its endDate`).toMatch(ISO_DAY)
        expect(e.startDate <= e.endDate, `${at} starts after it ends`).toBe(true)
        expect(e.startDate.slice(0, 4), `${at} starts in another year`).toBe(String(e.year))
      } else {
        // Month only: say so in the text, and claim no day.
        expect(e.endMonth, `${at} needs an endDate or endMonth`).toMatch(ISO_MONTH)
        expect(e.endMonth.slice(0, 4), `${at} endMonth in another year`).toBe(String(e.year))
        expect(e.startDate ?? null, `${at} has a startDate but no endDate`).toBeNull()
        expect(e.dates, `${at} month-only dates must say TBC`).toMatch(/TBC/)
      }
      if ('unconfirmed' in e) expect(typeof e.unconfirmed, `${at} unconfirmed`).toBe('boolean')
    }))
  })

  it('keeps show-level fields free of edition fields', () => {
    CONVENTIONS.forEach((c) => {
      for (const field of ['dates', 'startDate', 'endDate', 'endMonth', 'attendingArtistIds']) {
        expect(c, `${c.id} still has a top-level ${field}`).not.toHaveProperty(field)
      }
    })
  })
})

describe('editionKey / normaliseEditionKey', () => {
  it('names an edition by show and year', () => {
    expect(editionKey('big-london', 2027)).toBe('big-london@2027')
  })

  it('reads a bare show id as the edition everything was stored against before #178', () => {
    expect(LEGACY_EDITION).toBe(2026)
    expect(normaliseEditionKey('big-london')).toBe('big-london@2026')
    expect(normaliseEditionKey('big-london@2027')).toBe('big-london@2027')
  })

  it('leaves a key it does not recognise alone', () => {
    expect(normaliseEditionKey('not-a-show')).toBe('not-a-show')
  })
})

describe('currentEdition', () => {
  const show = {
    editions: [
      { year: 2026, endDate: '2026-09-06' },
      { year: 2027, endDate: null, endMonth: '2027-09' },
    ],
  }

  it('is the edition still to come, or still on', () => {
    expect(currentEdition(show, new Date(2026, 8, 6)).year).toBe(2026)
    expect(currentEdition(show, new Date(2026, 8, 7)).year).toBe(2027)
  })

  it('stays on the latest edition once every edition is over', () => {
    expect(currentEdition(show, new Date(2027, 9, 1)).year).toBe(2027)
  })

  it('does not depend on the order editions are listed in', () => {
    const reversed = { editions: [...show.editions].reverse() }
    expect(currentEdition(reversed, new Date(2026, 8, 7)).year).toBe(2027)
  })
})

describe('migrateEditionMap', () => {
  it('moves a bare show id onto its 2026 edition', () => {
    expect(migrateEditionMap({ 'big-london': ['a'] })).toEqual({ 'big-london@2026': ['a'] })
  })

  it('lets an edition key that is already there win over a bare one', () => {
    expect(migrateEditionMap({ 'big-london': ['old'], 'big-london@2026': ['new'] }))
      .toEqual({ 'big-london@2026': ['new'] })
  })

  it('keeps keys it does not recognise, rather than deleting data', () => {
    expect(migrateEditionMap({ 'gone-show': ['a'], 'brighton@2027': ['b'] }))
      .toEqual({ 'gone-show': ['a'], 'brighton@2027': ['b'] })
  })

  it('is idempotent, and hands back the same object when there is nothing to do', () => {
    const once = migrateEditionMap({ brighton: ['a'], 'brighton@2027': ['b'] })
    expect(migrateEditionMap(once)).toBe(once)
  })

  it('treats anything that is not a map as empty', () => {
    expect(migrateEditionMap(null)).toEqual({})
    expect(migrateEditionMap(['a'])).toEqual({})
    expect(migrateEditionMap('x')).toEqual({})
  })
})

describe('mergeConventionOverrides', () => {
  const find = (merged, id) => merged.find((c) => c.id === id)

  it('shows each show as its current edition', () => {
    const bigLondon = find(mergeConventionOverrides({}, NOV_2026), 'big-london')
    expect(bigLondon.year).toBe(2027)
    expect(bigLondon.editionKey).toBe('big-london@2027')
    expect(bigLondon.dates).toContain('2027')
    expect(bigLondon.label).toBe('Big London Tattoo Show 2027')
  })

  it('does not carry 2026 attendance into 2027 — the bug #178 fixes', () => {
    const merged = mergeConventionOverrides({ 'big-london': ['carlosvalera', 'zoia.ink'] }, NOV_2026)
    const bigLondon = find(merged, 'big-london')
    expect(bigLondon.attendingArtistIds).toEqual([])
    // …and the shipped 2026 attendees stay on 2026 too.
    const y2026 = bigLondon.editions.find((e) => e.year === 2026)
    expect(y2026.attendingArtistIds).toEqual(['carlosvalera', 'zoia.ink'])
  })

  it('falls back to the shipped attendees of an edition with no override', () => {
    const y2026 = find(mergeConventionOverrides({}, NOV_2026), 'big-london').editions.find((e) => e.year === 2026)
    expect(y2026.attendingArtistIds).toContain('carlosvalera')
  })

  it('reads an override stored against an edition key', () => {
    const merged = mergeConventionOverrides({ 'brighton@2027': ['zoia.ink'] }, NOV_2026)
    expect(find(merged, 'brighton').attendingArtistIds).toEqual(['zoia.ink'])
  })

  it('still shows a show on its 2026 edition before that edition is over', () => {
    const bigLondon = find(mergeConventionOverrides({ 'big-london': ['zoia.ink'] }, new Date(2026, 7, 1)), 'big-london')
    expect(bigLondon.year).toBe(2026)
    expect(bigLondon.attendingArtistIds).toEqual(['zoia.ink'])
  })
})

describe('viewEdition', () => {
  it('shows a show as any one of its editions', () => {
    const bigLondon = mergeConventionOverrides({}, NOV_2026).find((c) => c.id === 'big-london')
    const past = viewEdition(bigLondon, 2026)
    expect(past.year).toBe(2026)
    expect(past.editionKey).toBe('big-london@2026')
    expect(past.dates).toContain('2026')
    expect(past.attendingArtistIds).toContain('carlosvalera')
    expect(past.label).toBe('Big London Tattoo Show 2026')
    // Show-level fields come along unchanged.
    expect(past.name).toBe(bigLondon.name)
    expect(past.editions).toBe(bigLondon.editions)
  })

  it('falls back to the current edition for a year the show does not have', () => {
    const bigLondon = mergeConventionOverrides({}, NOV_2026).find((c) => c.id === 'big-london')
    expect(viewEdition(bigLondon, 1999).year).toBe(bigLondon.year)
  })
})

describe('toggleConventionAttendee with edition keys', () => {
  it('writes to the edition it is given', () => {
    const next = toggleConventionAttendee({}, 'brighton@2027', 'zoia.ink', [])
    expect(next).toEqual({ 'brighton@2027': ['zoia.ink'] })
  })

  it('migrates bare keys on the way, so the stored map ends up all edition keys', () => {
    const next = toggleConventionAttendee({ 'big-london': ['a'] }, 'big-london@2027', 'b', [])
    expect(next).toEqual({ 'big-london@2026': ['a'], 'big-london@2027': ['b'] })
  })
})

describe('pastAttendance', () => {
  it('lists the past editions an artist was at, as history', () => {
    const merged = mergeConventionOverrides({}, NOV_2026)
    const history = pastAttendance(merged, 'carlosvalera', NOV_2026)
    expect(history.map((c) => c.editionKey)).toEqual(['big-london@2026'])
    expect(history[0].label).toBe('Big London Tattoo Show 2026')
  })

  it('leaves out the current edition, which is shown as upcoming instead', () => {
    const merged = mergeConventionOverrides({ 'big-london@2027': ['carlosvalera'] }, NOV_2026)
    expect(pastAttendance(merged, 'carlosvalera', NOV_2026).map((c) => c.editionKey)).toEqual(['big-london@2026'])
  })

  it('is empty for an artist who was at nothing', () => {
    expect(pastAttendance(mergeConventionOverrides({}, NOV_2026), 'nobody', NOV_2026)).toEqual([])
  })

  it('puts the most recent first', () => {
    const merged = [{
      id: 's', name: 'S', editionKey: 's@2027', year: 2027,
      editions: [
        { year: 2025, key: 's@2025', endDate: '2025-05-01', attendingArtistIds: ['a'] },
        { year: 2026, key: 's@2026', endDate: '2026-05-01', attendingArtistIds: ['a'] },
        { year: 2027, key: 's@2027', endDate: '2027-05-01', attendingArtistIds: ['a'] },
      ],
    }]
    expect(pastAttendance(merged, 'a', NOV_2026).map((c) => c.year)).toEqual([2026, 2025])
  })
})

describe('restoring an old backup', () => {
  it('brings bare-id attendance in as the 2026 edition', () => {
    const raw = JSON.stringify({
      version: 1,
      exportedAt: '2026-09-01T00:00:00.000Z',
      data: { artists: [], ideas: [], boards: [], concepts: [], conventionOverrides: { 'big-london': ['a'] } },
    })
    expect(parseBackup(raw).conventionOverrides).toEqual({ 'big-london@2026': ['a'] })
  })
})
