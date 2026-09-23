import { describe, expect, it } from 'vitest'
import {
  CARD_WIDTH_MM,
  dragTransform,
  formatDesignWidth,
  pinchTransform,
  pxPerMmFromCard,
} from '../lib/tryOnTransform'

const base = { x: 100, y: 200, scale: 1, rotation: 0 }

describe('dragTransform', () => {
  it('moves the design by how far the finger travelled', () => {
    expect(dragTransform({ x: 10, y: 10 }, { x: 40, y: -5 }, base)).toEqual({ x: 130, y: 185, scale: 1, rotation: 0 })
  })
})

describe('pinchTransform', () => {
  const start = { a: { x: 0, y: 0 }, b: { x: 100, y: 0 } }

  it('scales by the change in finger spread', () => {
    const out = pinchTransform(start, { a: { x: -50, y: 0 }, b: { x: 150, y: 0 } }, base)
    expect(out.scale).toBeCloseTo(2)
    expect(out.rotation).toBeCloseTo(0)
  })

  it('rotates by the change in angle between the fingers', () => {
    const out = pinchTransform(start, { a: { x: 50, y: -50 }, b: { x: 50, y: 50 } }, base)
    expect(out.rotation).toBeCloseTo(90)
    expect(out.scale).toBeCloseTo(1)
  })

  it('follows the midpoint of the two fingers', () => {
    const out = pinchTransform(start, { a: { x: 20, y: 30 }, b: { x: 120, y: 30 } }, base)
    expect(out.x).toBeCloseTo(120)
    expect(out.y).toBeCloseTo(230)
  })

  // codex review: zoom and twist happen about the point between the fingers
  // (like Photos), so a pinch near one edge doesn't slide the design away.
  it('scales and rotates about the fingers, not the design centre', () => {
    const b = { x: 0, y: 0, scale: 1, rotation: 0 }
    const fingers = { a: { x: 90, y: 0 }, b: { x: 110, y: 0 } } // midpoint (100, 0)
    const spread = pinchTransform(fingers, { a: { x: 80, y: 0 }, b: { x: 120, y: 0 } }, b)
    expect(spread.scale).toBeCloseTo(2)
    expect(spread.x).toBeCloseTo(-100) // centre was 100 left of the fingers, now 200 left
    expect(spread.y).toBeCloseTo(0)

    const twist = pinchTransform(fingers, { a: { x: 100, y: -10 }, b: { x: 100, y: 10 } }, b)
    expect(twist.rotation).toBeCloseTo(90)
    expect(twist.x).toBeCloseTo(100) // centre swung round the fingers: (-100,0) → (0,-100)
    expect(twist.y).toBeCloseTo(-100)
  })

  it('keeps the scale within sensible limits', () => {
    expect(pinchTransform(start, { a: { x: 49, y: 0 }, b: { x: 51, y: 0 } }, base).scale).toBeGreaterThanOrEqual(0.1)
    expect(pinchTransform(start, { a: { x: -5000, y: 0 }, b: { x: 5000, y: 0 } }, base).scale).toBeLessThanOrEqual(8)
  })
})

describe('real-size calibration', () => {
  it('derives pixels per millimetre from a bank card matched on screen', () => {
    expect(CARD_WIDTH_MM).toBeCloseTo(85.6)
    expect(pxPerMmFromCard(171.2)).toBeCloseTo(2)
  })

  it('reports the design width in centimetres once calibrated', () => {
    expect(formatDesignWidth(190, 2)).toBe('≈ 9.5 cm wide')
    expect(formatDesignWidth(190, null)).toBe('')
  })
})
