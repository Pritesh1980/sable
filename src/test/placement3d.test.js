import { describe, it, expect } from 'vitest'
import {
  circumferenceAt, designSizeCm, clampPlacement, pinchWidth, wrapShare,
  isDarkBackground, toInkPixels, MIN_WIDTH_CM, MAX_WRAP,
} from '../data/placement3d'

const TABLE = [[0, 24], [10, 28], [20, 30], [31, 36]]
const ARM = { skinCm: [0, 31], perimeterCm: TABLE }

describe('circumferenceAt', () => {
  it('interpolates between the stations', () => {
    expect(circumferenceAt(TABLE, 5)).toBeCloseTo(26)
    expect(circumferenceAt(TABLE, 20)).toBe(30)
  })
  it('holds level past either end', () => {
    expect(circumferenceAt(TABLE, -4)).toBe(24)
    expect(circumferenceAt(TABLE, 99)).toBe(36)
  })
})

describe('designSizeCm', () => {
  it('takes its height from the image aspect', () => {
    expect(designSizeCm(12, 600, 760)).toEqual({ widthCm: 12, heightCm: 15.2 })
  })
})

describe('clampPlacement', () => {
  it('leaves a placement that fits alone', () => {
    const p = clampPlacement({ widthCm: 10, centreCm: 15, arcCm: 2 }, { ...ARM, aspect: 1 })
    expect(p).toEqual({ widthCm: 10, heightCm: 10, centreCm: 15, arcCm: 2 })
  })
  it('never goes below the minimum width', () => {
    expect(clampPlacement({ widthCm: 0.5, centreCm: 15 }, { ...ARM, aspect: 1 }).widthCm).toBe(MIN_WIDTH_CM)
  })
  it('caps the width at a share of the narrowest arm under the design', () => {
    const p = clampPlacement({ widthCm: 80, centreCm: 15 }, { ...ARM, aspect: 0.5 })
    expect(p.widthCm).toBeLessThanOrEqual(MAX_WRAP * circumferenceAt(TABLE, p.centreCm + p.heightCm / 2))
    expect(p.widthCm).toBeGreaterThan(20)
  })
  it('caps the height at the skin there is, keeping the aspect', () => {
    const p = clampPlacement({ widthCm: 20, centreCm: 15 }, { ...ARM, aspect: 2 })
    expect(p.heightCm).toBe(31)
    expect(p.widthCm).toBe(15.5)
  })
  it('slides the design back onto the skin', () => {
    expect(clampPlacement({ widthCm: 10, centreCm: 1 }, { ...ARM, aspect: 1 }).centreCm).toBe(5)
    expect(clampPlacement({ widthCm: 10, centreCm: 40 }, { ...ARM, aspect: 1 }).centreCm).toBe(26)
  })
  it('wraps the arc onto one turn of the arm', () => {
    const p = clampPlacement({ widthCm: 10, centreCm: 20, arcCm: 20 }, { ...ARM, aspect: 1 })
    expect(p.arcCm).toBeCloseTo(-10)
  })
})

describe('pinchWidth', () => {
  it('scales with the distance between the fingers', () => {
    expect(pinchWidth(12, 100, 150)).toBe(18)
  })
  it('ignores a degenerate start', () => {
    expect(pinchWidth(12, 0, 150)).toBe(12)
  })
})

describe('wrapShare', () => {
  it('is the share of the arm the design goes round at its centre', () => {
    expect(wrapShare({ widthCm: 15, centreCm: 20 }, TABLE)).toBe(0.5)
  })
})

const px = (...rgba) => new Uint8ClampedArray(rgba.flat())

describe('isDarkBackground', () => {
  it('reads the paper from the border', () => {
    const dark = [14, 13, 11, 255]
    const light = [250, 250, 250, 255]
    // 3x3: border dark, centre light
    expect(isDarkBackground(px(dark, dark, dark, dark, light, dark, dark, dark, dark), 3, 3)).toBe(true)
    expect(isDarkBackground(px(light, light, light, light, dark, light, light, light, light), 3, 3)).toBe(false)
  })
  it('treats a transparent border as paper', () => {
    const clear = [0, 0, 0, 0]
    expect(isDarkBackground(px(clear, clear, clear, clear), 2, 2)).toBe(false)
  })
})

describe('toInkPixels', () => {
  it('keeps dark ink on white paper as it is', () => {
    const out = toInkPixels(px([255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]), 3, 1)
    expect([...out.slice(0, 8)]).toEqual([255, 255, 255, 255, 0, 0, 0, 255])
  })
  it('flips light lines on a dark card, keeping hue', () => {
    const out = toInkPixels(px([10, 10, 10, 255], [240, 240, 240, 255], [200, 40, 40, 255], [10, 10, 10, 255]), 4, 1)
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 255]) // paper → bare skin, past the white point
    expect([...out.slice(4, 8)]).toEqual([17, 17, 17, 255]) // line → ink
    const [r, g, b] = out.slice(8, 11)
    expect(r).toBeGreaterThan(g) // red stays red
    expect(g).toBe(b)
  })
  it('turns transparency into bare skin', () => {
    const out = toInkPixels(px([0, 0, 0, 0], [0, 0, 0, 255]), 2, 1)
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 255])
  })
})
