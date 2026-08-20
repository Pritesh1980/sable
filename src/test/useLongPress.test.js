import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLongPress } from '../hooks/useLongPress'

function down(x = 0, y = 0, overrides = {}) {
  return { pointerType: 'touch', button: 0, clientX: x, clientY: y, ...overrides }
}

describe('useLongPress (#71)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires after the delay following a press', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(499)
    expect(onLongPress).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('does not fire if released before the delay', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(300)
    result.current.onPointerUp(down())
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('does not fire if the pointer leaves before the delay', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(300)
    result.current.onPointerLeave(down())
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('does not fire if the pointer moves past the threshold — a drag or scroll, not a hold', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500, moveThreshold: 10 }))
    result.current.onPointerDown(down(0, 0))
    result.current.onPointerMove(down(20, 0))
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('still fires if the pointer moves only slightly, within the threshold', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500, moveThreshold: 10 }))
    result.current.onPointerDown(down(0, 0))
    result.current.onPointerMove(down(3, 3))
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('ignores a non-primary mouse button', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down(0, 0, { pointerType: 'mouse', button: 2 }))
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('consumeIfFired reports true exactly once after a completed long-press', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(500)
    expect(result.current.consumeIfFired()).toBe(true)
    expect(result.current.consumeIfFired()).toBe(false)
  })

  it('consumeIfFired reports false when the press never completed', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(300)
    result.current.onPointerUp(down())
    expect(result.current.consumeIfFired()).toBe(false)
  })

  // #71 cross-model review, finding 1: a second finger on the same target
  // must not arm an independent timer that fires (or gets canceled)
  // regardless of the first finger.
  it('ignores a second pointer while the first press is still live', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down(0, 0, { pointerId: 1 }))
    result.current.onPointerDown(down(0, 0, { pointerId: 2 })) // second finger — must be ignored
    // Lifting the *original* tracked pointer must still cancel it. If the
    // second pointerdown had been allowed to adopt tracking (the bug this
    // guards against), this pointerup wouldn't match it, both the orphaned
    // first timer and the wrongly-armed second timer would be left running
    // uncanceled, and onLongPress would fire — twice.
    result.current.onPointerUp(down(0, 0, { pointerId: 1 }))
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  // Finding 2: `enabled` flipping false mid-hold (editing turned on some
  // other way, or the component is about to unmount) must cancel the
  // pending timer — prop wiring in JSX alone doesn't reach an already-armed
  // setTimeout.
  it('cancels a pending press when enabled flips false', () => {
    const onLongPress = vi.fn()
    const { result, rerender } = renderHook(
      ({ enabled }) => useLongPress(onLongPress, { delay: 500, enabled }),
      { initialProps: { enabled: true } }
    )
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(300)
    rerender({ enabled: false })
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('cancels a pending press on unmount', () => {
    const onLongPress = vi.fn()
    const { result, unmount } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(300)
    unmount()
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  // Finding 3: a completed long-press whose trailing click the browser never
  // delivers (iOS's own callout intercepting it, say) must not leave
  // `firedRef` armed forever — the next, unrelated press's own click must
  // resolve on its own terms.
  it('does not let a long-press with no trailing click swallow a later, unrelated tap', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500 }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(500) // fires; consumeIfFired() is never called — click never arrived
    // A new, unrelated quick tap.
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(100)
    result.current.onPointerUp(down())
    expect(result.current.consumeIfFired()).toBe(false)
  })

  // Finding 5: a caller with nothing to do on long-press (enabled: false)
  // must not arm the recognizer at all, or an ordinary tap's click gets
  // swallowed for no reason.
  it('never fires or arms consumeIfFired when disabled', () => {
    const onLongPress = vi.fn()
    const { result } = renderHook(() => useLongPress(onLongPress, { delay: 500, enabled: false }))
    result.current.onPointerDown(down())
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(result.current.consumeIfFired()).toBe(false)
  })
})
