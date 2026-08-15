import { describe, it, expect } from 'vitest'
import {
  MIN_TARGET_PX,
  isHittable,
  isUndersized,
  isInlineTextLink,
  shortfall,
  summarise,
  formatOffender,
} from '../a11y/touchTargets'

const el = (over = {}) => ({
  route: '/gallery',
  tag: 'BUTTON',
  label: 'Grid view',
  width: 44,
  height: 44,
  visibility: 'visible',
  display: 'block',
  pointerEvents: 'auto',
  disabled: false,
  proseAround: 0,
  occluded: false,
  ...over,
})

describe('isHittable', () => {
  it('accepts a rendered control', () => {
    expect(isHittable(el())).toBe(true)
  })

  it('rejects zero-box wrappers, which are not targets at all', () => {
    expect(isHittable(el({ width: 0 }))).toBe(false)
    expect(isHittable(el({ height: 0 }))).toBe(false)
  })

  it('rejects hidden controls', () => {
    expect(isHittable(el({ visibility: 'hidden' }))).toBe(false)
    expect(isHittable(el({ display: 'none' }))).toBe(false)
  })

  it('rejects nothing', () => {
    expect(isHittable(null)).toBe(false)
  })

  // codex review: a positive rectangle is not the same as an actionable target.
  // Counting these as offenders pads the worklist with controls nobody can tap.
  it('rejects controls that cannot receive a tap', () => {
    expect(isHittable(el({ pointerEvents: 'none' }))).toBe(false)
    expect(isHittable(el({ disabled: true }))).toBe(false)
  })
})

describe('isUndersized', () => {
  it('passes a control at exactly the minimum', () => {
    expect(isUndersized(el({ width: MIN_TARGET_PX, height: MIN_TARGET_PX }))).toBe(false)
  })

  // The bug this whole issue is about: 24x28.
  it('fails a control short on both axes', () => {
    expect(isUndersized(el({ width: 24, height: 28 }))).toBe(true)
  })

  // A wide, short control is just as hard to hit as a narrow, tall one — the
  // guard #51 left behind checked both axes, and so does this.
  it('fails a control short on only one axis', () => {
    expect(isUndersized(el({ width: 200, height: 28 }))).toBe(true)
    expect(isUndersized(el({ width: 24, height: 200 }))).toBe(true)
  })

  it('honours a caller-supplied minimum', () => {
    expect(isUndersized(el({ width: 30, height: 30 }), 24)).toBe(false)
  })
})

describe('isInlineTextLink', () => {
  it('excuses a link with real prose around it', () => {
    expect(isInlineTextLink(el({ tag: 'A', proseAround: 80 }))).toBe(true)
  })

  it('does not excuse a standalone link', () => {
    expect(isInlineTextLink(el({ tag: 'A', proseAround: 0 }))).toBe(false)
  })

  // codex review: a <p> used purely as a wrapper around a call to action is not
  // prose, and exempting on ancestry alone hid those controls entirely.
  it('does not excuse a call to action that merely sits in a <p>', () => {
    expect(isInlineTextLink(el({ tag: 'A', proseAround: 6 }))).toBe(false)
  })

  it('never excuses a button', () => {
    expect(isInlineTextLink(el({ tag: 'BUTTON', proseAround: 200 }))).toBe(false)
  })
})

// Growing a target is exactly the activity that creates occlusion — a control
// enlarged with a negative margin covers its neighbour and starts stealing taps.
// Size alone cannot see that: the thief measures 44x44 and passes (#76).
describe('occlusion', () => {
  it('reports a control whose centre lands on something else', () => {
    const out = summarise([el({ label: 'Instagram link', occluded: true, width: 99, height: 44 })])
    expect(out.occluded.map((o) => o.label)).toEqual(['Instagram link'])
  })

  it('keeps it out of the undersized list — it is a different defect', () => {
    const out = summarise([el({ occluded: true, width: 99, height: 44 })])
    expect(out.offenders).toHaveLength(0)
  })

  it('reports a control that is both too small and covered, in both lists', () => {
    const out = summarise([el({ occluded: true, width: 20, height: 20 })])
    expect(out.occluded).toHaveLength(1)
    expect(out.offenders).toHaveLength(1)
  })

  it('says nothing when every control receives its own taps', () => {
    expect(summarise([el(), el({ route: '/brief' })]).occluded).toEqual([])
  })
})

describe('shortfall', () => {
  it('reports how far short each axis is', () => {
    expect(shortfall(el({ width: 24, height: 28 }))).toEqual({ width: 20, height: 16 })
  })

  it('never reports a negative shortfall for an oversized control', () => {
    expect(shortfall(el({ width: 100, height: 100 }))).toEqual({ width: 0, height: 0 })
  })
})

describe('summarise', () => {
  it('counts only hittable controls as checked', () => {
    const out = summarise([el(), el({ width: 0 }), el({ display: 'none' })])
    expect(out.checked).toBe(1)
    expect(out.offenders).toHaveLength(0)
  })

  it('reports offenders worst-first, by their largest single-axis shortfall', () => {
    const out = summarise([
      el({ label: 'mild', width: 40, height: 40 }),
      el({ label: 'severe', width: 16, height: 44 }),
      el({ label: 'middling', width: 30, height: 44 }),
    ])
    expect(out.offenders.map((o) => o.label)).toEqual(['severe', 'middling', 'mild'])
  })

  it('groups the count by route, so a page with many is obvious', () => {
    const out = summarise([
      el({ route: '/gallery', width: 24 }),
      el({ route: '/gallery', width: 24 }),
      el({ route: '/brief', width: 24 }),
      el({ route: '/brief', width: 44, height: 44 }),
    ])
    expect(out.byRoute).toEqual({ '/gallery': 2, '/brief': 1 })
  })

  it('leaves inline prose links out of the worklist', () => {
    const out = summarise([el({ tag: 'A', proseAround: 90, width: 30, height: 18 })])
    expect(out.offenders).toHaveLength(0)
    expect(out.checked).toBe(1)
  })

  // codex review: the nav and its font/theme/sign-out buttons render on every
  // route, so a raw count reports the same three controls eight times and makes
  // the debt look far larger than it is.
  it('counts a shared-shell control once, while still saying where it appears', () => {
    const shell = (route) => el({ route, label: 'Sign out', width: 32, height: 32 })
    const out = summarise([shell('/gallery'), shell('/brief'), shell('/help'), el({ label: 'New idea', route: '/brief', width: 40, height: 40 })])

    expect(out.offenders).toHaveLength(4)
    expect(out.uniqueOffenders).toHaveLength(2)
    const signOut = out.uniqueOffenders.find((o) => o.label === 'Sign out')
    expect(signOut.routes).toEqual(['/gallery', '/brief', '/help'])
    expect(signOut.sightings).toBe(3)
  })

  // A status pill repeated down one page is three sightings on one route. The
  // first cut reported that as "3 routes", which read as a shared-shell control.
  it('does not inflate route count when one page repeats a control', () => {
    const pill = () => el({ route: '/gallery', label: 'Shortlisted', width: 77, height: 15 })
    const out = summarise([pill(), pill(), pill()])

    const found = out.uniqueOffenders[0]
    expect(found.routes).toEqual(['/gallery'])
    expect(found.sightings).toBe(3)
  })

  it('treats same-label controls of different sizes as different controls', () => {
    const out = summarise([
      el({ label: 'Edit', route: '/conventions', width: 28, height: 15 }),
      el({ label: 'Edit', route: '/brief', width: 40, height: 40 }),
    ])
    expect(out.uniqueOffenders).toHaveLength(2)
  })
})

describe('formatOffender', () => {
  it('reads as a worklist line', () => {
    expect(formatOffender(el({ width: 24.4, height: 28.2 })))
      .toBe('/gallery  24x28  <button> Grid view')
  })

  it('says so when a control has no accessible name at all', () => {
    expect(formatOffender(el({ label: '' }))).toMatch(/\(no accessible name\)/)
  })
})
