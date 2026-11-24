import { describe, it, expect } from 'vitest'
import { buildShowRoute, formatRoute, NEARBY_RADIUS } from '../data/showRoute'
import { buildShowPlan } from '../data/showPlan'
import { floorplanFor, seedEntriesFor, curatedPicksFor } from '../data/lineupSeeds'
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS } from '../data/artists'

// A pick as buildShowPlan returns it — only the fields the route reads.
const pick = (handle, booth, name = handle) => ({
  entry: { handle, name, label: name, note: booth ? `Studio, Booth ${booth}` : 'Studio' },
  reasons: [],
})
const emptyPlan = { mustSee: [], fieldGuide: [], wildcards: [], suggested: [] }
const handles = (items) => items.map((s) => s.pick.entry.handle)

// Numbered to serpentine, the way the real hall is: 1 and 3 are near the
// entrance, 2 is across the hall.
const plan = { aspect: 1, entrance: [1, 1], booths: { 1: [0.9, 1], 2: [0.1, 1], 3: [0.8, 1] } }

describe('buildShowRoute', () => {
  it('walks to the nearest pick each time from the entrance, not in booth-number order', () => {
    const route = buildShowRoute({ ...emptyPlan, mustSee: [pick('a', 1), pick('b', 2), pick('c', 3)] }, plan)
    expect(handles(route.stops)).toEqual(['a', 'c', 'b'])
    expect(route.stops.map((s) => s.booth)).toEqual(['1', '3', '2'])
  })

  it('scales y by the plan’s aspect ratio, so distance means distance on the floor', () => {
    // 0.3 across vs 0.4 down; on a plan half as tall as it is wide, down is nearer.
    const wide = { aspect: 0.5, entrance: [0, 0], booths: { 10: [0.3, 0], 20: [0, 0.4] } }
    const route = buildShowRoute({ ...emptyPlan, mustSee: [pick('across', 10), pick('down', 20)] }, wide)
    expect(handles(route.stops)).toEqual(['down', 'across'])
  })

  it('routes Must see and field-guide picks together', () => {
    const route = buildShowRoute({ ...emptyPlan, mustSee: [pick('a', 2)], fieldGuide: [pick('g', 1)] }, plan)
    expect(handles(route.stops)).toEqual(['g', 'a'])
  })

  it('puts a booth that is not on the plan under Elsewhere, never at a made-up spot', () => {
    const route = buildShowRoute({ ...emptyPlan, mustSee: [pick('a', 1), pick('t', 'T24'), pick('none', null)] }, plan)
    expect(handles(route.stops)).toEqual(['a'])
    expect(route.elsewhere.map((e) => [e.pick.entry.handle, e.booth])).toEqual([['t', 'T24'], ['none', null]])
  })

  it('picks up Worth a look and wildcards close to a stop, and leaves the far ones out', () => {
    const near = { aspect: 1, entrance: [1, 1], booths: { 1: [0.5, 0.5], 2: [0.5 + NEARBY_RADIUS / 2, 0.5], 3: [0.1, 0.1], 4: [0.5, 0.5 + NEARBY_RADIUS / 3] } }
    const route = buildShowRoute(
      { ...emptyPlan, mustSee: [pick('a', 1)], suggested: [pick('close', 2), pick('far', 3)], wildcards: [pick('wild', 4)] },
      near
    )
    expect(route.stops).toHaveLength(1)
    expect(route.stops[0].nearby.map((n) => [n.pick.entry.handle, n.booth])).toEqual([['wild', '4'], ['close', '2']])
  })

  it('gives each pickup to its closest stop only once', () => {
    const two = { aspect: 1, entrance: [0, 0], booths: { 1: [0.1, 0], 2: [0.14, 0], 3: [0.13, 0] } }
    const route = buildShowRoute({ ...emptyPlan, mustSee: [pick('a', 1), pick('b', 2)], suggested: [pick('mate', 3)] }, two)
    expect(route.stops.map((s) => s.nearby.map((n) => n.pick.entry.handle))).toEqual([[], ['mate']])
  })

  it('does not list the same artist twice when they turn up in two sections', () => {
    const route = buildShowRoute({ ...emptyPlan, mustSee: [pick('a', 1)], fieldGuide: [pick('a', 1)] }, plan)
    expect(handles(route.stops)).toEqual(['a'])
  })

  it('is empty without a floor plan', () => {
    expect(buildShowRoute({ ...emptyPlan, mustSee: [pick('a', 1)] }, null)).toEqual({ stops: [], elsewhere: [] })
  })
})

describe('formatRoute', () => {
  it('writes a numbered list for Notes, with pickups and the unplaced booths', () => {
    const near = { aspect: 1, entrance: [1, 1], booths: { 1: [0.9, 1], 2: [0.91, 1] } }
    const route = buildShowRoute(
      { ...emptyPlan, mustSee: [pick('a.ink', 1, 'Ada')], suggested: [pick('b.ink', 2, 'Bo')], fieldGuide: [pick('c.ink', 'T3', 'Cy')] },
      near
    )
    expect(formatRoute(route, { title: 'Big London Tattoo Show 2026' })).toBe([
      'Big London Tattoo Show 2026: route',
      'Ordered across the floor from the entrance.',
      '',
      '1. Booth 1 · Ada (@a.ink)',
      '   Close by: Booth 2 · Bo (@b.ink)',
      '',
      'Elsewhere in the hall (not on the floor plan):',
      '- Booth T3 · Cy (@c.ink)',
    ].join('\n'))
  })

  it('never claims the route is the shortest', () => {
    const route = buildShowRoute({ ...emptyPlan, mustSee: [pick('a', 1)] }, plan)
    expect(formatRoute(route, { title: 'Show' })).not.toMatch(/shortest|optimal/i)
  })
})

// The 2026 floor plan is the fixture: the logic is ready before the 2027 plan
// is published, and only the coordinates change.
describe('route over Big London 2026', () => {
  const key = 'big-london@2026'
  const showPlan = buildShowPlan(seedEntriesFor(key), {
    artists: DEFAULT_ARTISTS,
    studios: DEFAULT_STUDIOS,
    curated: curatedPicksFor(key),
  })
  const route = buildShowRoute(showPlan, floorplanFor(key))

  it('places every Must see artist and the field-guide picks that are on the plan', () => {
    expect(route.stops).toHaveLength(showPlan.mustSee.length + showPlan.fieldGuide.length - 1)
    expect(route.elsewhere.map((e) => [e.pick.entry.handle, e.booth])).toEqual([['davidcorden', 'T24']])
  })

  it('starts at the stand nearest the entrance', () => {
    expect(route.stops[0].pick.entry.handle).toBe('johndarktattoo_')
  })

  it('does not follow booth numbers, which zigzag across the hall', () => {
    const numbers = route.stops.map((s) => Number(s.booth))
    expect(numbers).not.toEqual([...numbers].sort((a, b) => a - b))
  })

  it('picks up the London’s Glitch stablemate across the aisle from Clara Grech', () => {
    const zap = route.stops.find((s) => s.pick.entry.handle === 'zap.ink')
    expect(zap.nearby.map((n) => n.pick.entry.handle)).toContain('alyatattooing_itsme')
  })
})
