import { describe, it, expect } from 'vitest'
import { isDragEcho, DRAG_CLICK_WINDOW_MS } from '../data/dragTap'

// #54. The rule the grid card leans on: the click a drag produces must be
// swallowed, while a deliberate tap on the handle must reach the card and open
// the artist. The deciding signal is whether a fresh pointerdown has begun a new
// interaction since the drag ended; time is only a backstop.
describe('isDragEcho', () => {
  const NEVER = null

  it('is false when no drag has happened', () => {
    expect(isDragEcho(NEVER, NEVER, 1000)).toBe(false)
    expect(isDragEcho(undefined, undefined, 1000)).toBe(false)
  })

  it('is true for the click that follows a drag with no new pointerdown', () => {
    expect(isDragEcho(1000, 900, 1010)).toBe(true)
  })

  it('is false once a new pointerdown has begun a fresh interaction', () => {
    // Drag ended at 1000; the user then pressed the handle again at 2000. The
    // click at 2010 belongs to that press, not to the drag.
    expect(isDragEcho(1000, 2000, 2010)).toBe(false)
  })

  // agy's finding 3: a drop re-renders and persists the whole ranked list, so on
  // a slow device the echo click can arrive far later than a tight window allows.
  it('still catches an echo delayed by a slow re-render', () => {
    expect(isDragEcho(1000, 900, 1400)).toBe(true)
    expect(isDragEcho(1000, 900, 1000 + DRAG_CLICK_WINDOW_MS - 1)).toBe(true)
  })

  it('gives up at the backstop rather than swallowing forever', () => {
    expect(isDragEcho(1000, 900, 1000 + DRAG_CLICK_WINDOW_MS)).toBe(false)
    expect(isDragEcho(1000, 900, 60000)).toBe(false)
  })

  // The two halves guard each other: neither signal alone is safe.
  it('cannot latch — a drag that produced no click still lets the next tap through', () => {
    const endedAt = 1000
    // No click arrived. The user taps the handle: pointerdown first, then click.
    expect(isDragEcho(endedAt, 4000, 4010)).toBe(false)
  })

  it('treats a backwards clock as "not an echo" rather than swallowing forever', () => {
    expect(isDragEcho(5000, NEVER, 1000)).toBe(false)
  })

  it('honours a caller-supplied window', () => {
    expect(isDragEcho(1000, NEVER, 1050, 40)).toBe(false)
    expect(isDragEcho(1000, NEVER, 1030, 40)).toBe(true)
  })

  // A pointerdown from before the drag ended is the drag's own activator and
  // must not be mistaken for a new interaction.
  it('ignores the pointerdown that started the drag', () => {
    expect(isDragEcho(1000, 1000, 1010)).toBe(true)
    expect(isDragEcho(1000, 200, 1010)).toBe(true)
  })
})
