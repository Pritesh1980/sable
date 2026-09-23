import { describe, it, expect } from 'vitest'
import { classifyGesture } from '../lib/gesture'

// dx/dy are finger travel (end - start). Directions name where the finger
// went, not what the viewer does with it.
describe('classifyGesture', () => {
  it('is a tap when the finger barely moves', () => {
    expect(classifyGesture(0, 0)).toBe('tap')
    expect(classifyGesture(6, -5)).toBe('tap')
  })

  it('reads a clear horizontal swipe', () => {
    expect(classifyGesture(-80, 10)).toBe('left')
    expect(classifyGesture(80, -10)).toBe('right')
  })

  it('reads a clear vertical swipe', () => {
    expect(classifyGesture(5, -90)).toBe('up')
    expect(classifyGesture(-5, 90)).toBe('down')
  })

  it('ignores a short drag that is neither a tap nor a swipe', () => {
    expect(classifyGesture(25, 0)).toBe(null)
  })

  it('ignores a diagonal drag with no dominant axis', () => {
    expect(classifyGesture(70, 60)).toBe(null)
  })
})
