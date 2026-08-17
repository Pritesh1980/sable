import { describe, it, expect } from 'vitest'
import { intersectsViewport } from '../data/viewport'

const viewport = { width: 400, height: 800 }
const rect = (over = {}) => ({ top: 0, left: 0, right: 100, bottom: 100, width: 100, height: 100, ...over })

describe('intersectsViewport', () => {
  it('is true for a rect fully inside the viewport', () => {
    expect(intersectsViewport(rect({ top: 100, bottom: 200, left: 100, right: 200 }), viewport)).toBe(true)
  })

  // The bug this exists to fix: a row scrolled well below the fold.
  it('is false for a rect entirely below the viewport', () => {
    expect(intersectsViewport(rect({ top: 900, bottom: 1000 }), viewport)).toBe(false)
  })

  it('is false for a rect entirely above the viewport', () => {
    expect(intersectsViewport(rect({ top: -200, bottom: -100 }), viewport)).toBe(false)
  })

  it('is false for a rect entirely to the right of the viewport', () => {
    expect(intersectsViewport(rect({ left: 500, right: 600 }), viewport)).toBe(false)
  })

  it('is false for a rect entirely to the left of the viewport', () => {
    expect(intersectsViewport(rect({ left: -300, right: -200 }), viewport)).toBe(false)
  })

  it('is true for a rect only partly on screen', () => {
    expect(intersectsViewport(rect({ top: 780, bottom: 900 }), viewport)).toBe(true)
  })

  // jsdom's getBoundingClientRect on an element that was never laid out (or is
  // display:none) returns a zero rect. That must read as "not visible", not as
  // "a rect that happens to touch the top-left corner" — 0,0,0,0 technically
  // has top<height and left<width, so the edges alone are not enough.
  it('is false for a zero-size rect', () => {
    expect(intersectsViewport(rect({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }), viewport)).toBe(false)
  })

  it('is false for a null rect', () => {
    expect(intersectsViewport(null, viewport)).toBe(false)
  })

  it('touching an edge exactly does not count as overlapping', () => {
    expect(intersectsViewport(rect({ top: 800, bottom: 900 }), viewport)).toBe(false)
    expect(intersectsViewport(rect({ left: 400, right: 500 }), viewport)).toBe(false)
  })
})
