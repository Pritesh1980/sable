import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import useSwipeTap from '../hooks/useSwipeTap'

function ev(x, y, overrides = {}) {
  return { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y, ...overrides }
}

function setup() {
  const onTap = vi.fn()
  const onSwipe = vi.fn()
  const { result } = renderHook(() => useSwipeTap({ onTap, onSwipe }))
  return { h: result.current, onTap, onSwipe }
}

describe('useSwipeTap', () => {
  it('reports a tap', () => {
    const { h, onTap, onSwipe } = setup()
    h.onPointerDown(ev(100, 100))
    h.onPointerUp(ev(103, 101))
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('reports a swipe with its direction', () => {
    const { h, onTap, onSwipe } = setup()
    h.onPointerDown(ev(200, 100))
    h.onPointerUp(ev(100, 110))
    expect(onSwipe).toHaveBeenCalledWith('left')
    expect(onTap).not.toHaveBeenCalled()
  })

  it('ignores the mouse so desktop clicks behave exactly as before', () => {
    const { h, onTap, onSwipe } = setup()
    h.onPointerDown(ev(100, 100, { pointerType: 'mouse' }))
    h.onPointerUp(ev(100, 100, { pointerType: 'mouse' }))
    h.onPointerDown(ev(200, 100, { pointerType: 'mouse' }))
    h.onPointerUp(ev(100, 100, { pointerType: 'mouse' }))
    expect(onTap).not.toHaveBeenCalled()
    expect(onSwipe).not.toHaveBeenCalled()
  })

  // A stylus on a (hover: none) tablet gets the touch layout, so it must be
  // able to drive it (codex review).
  it('accepts a pen like a finger', () => {
    const { h, onSwipe } = setup()
    h.onPointerDown(ev(200, 100, { pointerType: 'pen' }))
    h.onPointerUp(ev(100, 100, { pointerType: 'pen' }))
    expect(onSwipe).toHaveBeenCalledWith('left')
  })

  // While the page is pinch-zoomed a one-finger drag is a pan, not a swipe.
  it('does nothing while disabled', () => {
    const onTap = vi.fn()
    const onSwipe = vi.fn()
    const { result } = renderHook(() => useSwipeTap({ onTap, onSwipe, enabled: false }))
    result.current.onPointerDown(ev(200, 100))
    result.current.onPointerUp(ev(100, 100))
    result.current.onPointerDown(ev(100, 100))
    result.current.onPointerUp(ev(100, 100))
    expect(onTap).not.toHaveBeenCalled()
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('abandons the gesture when a second finger lands (pinch, not a swipe)', () => {
    const { h, onTap, onSwipe } = setup()
    h.onPointerDown(ev(100, 100, { pointerId: 1 }))
    h.onPointerDown(ev(300, 100, { pointerId: 2 }))
    h.onPointerUp(ev(20, 100, { pointerId: 1 }))
    h.onPointerUp(ev(300, 100, { pointerId: 2 }))
    expect(onTap).not.toHaveBeenCalled()
    expect(onSwipe).not.toHaveBeenCalled()
  })

  it('does nothing on pointercancel (the browser took the gesture over)', () => {
    const { h, onTap, onSwipe } = setup()
    h.onPointerDown(ev(100, 100))
    h.onPointerCancel(ev(100, 100))
    h.onPointerUp(ev(100, 100))
    expect(onTap).not.toHaveBeenCalled()
    expect(onSwipe).not.toHaveBeenCalled()
  })
})
