import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useIdleFade from '../hooks/useIdleFade'

describe('useIdleFade', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('starts active (not idle)', () => {
    const { result } = renderHook(() => useIdleFade(2000))
    expect(result.current).toBe(false)
  })

  it('becomes idle after the timeout with no activity', () => {
    const { result } = renderHook(() => useIdleFade(2000))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current).toBe(true)
  })

  it('resets on mousemove', () => {
    const { result } = renderHook(() => useIdleFade(2000))
    act(() => { vi.advanceTimersByTime(1900) })
    act(() => { window.dispatchEvent(new Event('mousemove')) })
    act(() => { vi.advanceTimersByTime(1900) })
    expect(result.current).toBe(false)
    act(() => { vi.advanceTimersByTime(200) })
    expect(result.current).toBe(true)
  })

  it('resets on keydown', () => {
    const { result } = renderHook(() => useIdleFade(2000))
    act(() => { vi.advanceTimersByTime(2000) })
    expect(result.current).toBe(true)
    act(() => { window.dispatchEvent(new Event('keydown')) })
    expect(result.current).toBe(false)
  })

  it('never goes idle when prefers-reduced-motion is set', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    const { result } = renderHook(() => useIdleFade(2000))
    act(() => { vi.advanceTimersByTime(5000) })
    expect(result.current).toBe(false)
    window.matchMedia = original
  })
})
