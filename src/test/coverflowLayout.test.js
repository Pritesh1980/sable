import { describe, it, expect } from 'vitest'
import { coverflowLayout } from '../data/coverflowLayout'

describe('coverflowLayout', () => {
  it('returns one transform per card', () => {
    expect(coverflowLayout(5, 0)).toHaveLength(5)
    expect(coverflowLayout(1, 0)).toHaveLength(1)
    expect(coverflowLayout(0, 0)).toHaveLength(0)
  })

  it('places the active card centered, forward, upright and fully visible', () => {
    const layout = coverflowLayout(5, 2)
    const active = layout[2]
    expect(active.x).toBeCloseTo(0)
    expect(active.z).toBe(0)
    expect(active.rotationY).toBe(0)
    expect(active.scale).toBe(1)
    expect(active.opacity).toBe(1)
  })

  it('is the frontmost card — every other card sits behind it', () => {
    const layout = coverflowLayout(5, 2)
    layout.forEach((card, i) => {
      if (i !== 2) expect(card.z).toBeLessThan(0)
    })
  })

  it('mirrors cards either side of the active one', () => {
    const layout = coverflowLayout(5, 2)
    const left = layout[1]
    const right = layout[3]
    expect(left.x).toBeCloseTo(-right.x)
    expect(left.rotationY).toBeCloseTo(-right.rotationY)
    expect(left.z).toBeCloseTo(right.z)
    expect(left.scale).toBeCloseTo(right.scale)
    expect(left.opacity).toBeCloseTo(right.opacity)
  })

  it('cards turn inward toward the viewer (left rotates one way, right the other)', () => {
    const layout = coverflowLayout(5, 2)
    expect(Math.sign(layout[1].rotationY)).toBe(-Math.sign(layout[3].rotationY))
    expect(layout[3].rotationY).not.toBe(0)
  })

  it('recedes monotonically with distance from the active card', () => {
    const layout = coverflowLayout(7, 3)
    // walk outward to the right: |x| grows, z drops, scale & opacity shrink
    for (let i = 4; i < 7; i++) {
      expect(Math.abs(layout[i].x)).toBeGreaterThan(Math.abs(layout[i - 1].x))
      expect(layout[i].z).toBeLessThan(layout[i - 1].z)
      expect(layout[i].scale).toBeLessThanOrEqual(layout[i - 1].scale)
      expect(layout[i].opacity).toBeLessThanOrEqual(layout[i - 1].opacity)
    }
  })

  it('never collapses scale or opacity below a visible floor', () => {
    const layout = coverflowLayout(20, 0)
    layout.forEach((card) => {
      expect(card.scale).toBeGreaterThan(0)
      expect(card.opacity).toBeGreaterThanOrEqual(0)
    })
    const far = layout[19]
    expect(far.scale).toBeGreaterThanOrEqual(0.3)
  })

  it('clamps the active index into range', () => {
    expect(coverflowLayout(5, 99)[4].z).toBe(0)
    expect(coverflowLayout(5, -3)[0].z).toBe(0)
  })
})
