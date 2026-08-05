import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useUndoableRemoval } from '../hooks/useUndoableRemoval'

describe('useUndoableRemoval', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup(initial = ['a', 'b', 'c'], duration) {
    const onChange = vi.fn()
    const view = renderHook(
      ({ list }) => useUndoableRemoval(list, onChange, duration),
      { initialProps: { list: initial } }
    )
    return { onChange, ...view }
  }

  it('removes the item and offers it back', () => {
    const { result, onChange } = setup()

    act(() => result.current.remove(1))

    expect(onChange).toHaveBeenCalledWith(['a', 'c'])
    expect(result.current.pending).toMatchObject({ item: 'b' })
  })

  it('restores the item to its original position on undo', () => {
    const { result, onChange, rerender } = setup()

    act(() => result.current.remove(1))
    rerender({ list: ['a', 'c'] })
    act(() => result.current.undo())

    expect(onChange).toHaveBeenLastCalledWith(['a', 'b', 'c'])
    expect(result.current.pending).toBeNull()
  })

  it('withdraws the offer once the window passes', () => {
    const { result } = setup(['a', 'b'], 5000)

    act(() => result.current.remove(0))
    expect(result.current.pending).not.toBeNull()

    act(() => vi.advanceTimersByTime(5000))

    expect(result.current.pending).toBeNull()
  })

  it('does not resurrect the item when the window passes', () => {
    const { result, onChange } = setup(['a', 'b'], 5000)

    act(() => result.current.remove(0))
    onChange.mockClear()
    act(() => vi.advanceTimersByTime(5000))

    expect(onChange).not.toHaveBeenCalled()
  })

  it('offers only the most recent removal when two happen in quick succession', () => {
    const { result, onChange, rerender } = setup(['a', 'b', 'c'], 5000)

    act(() => result.current.remove(0)) // 'a'
    rerender({ list: ['b', 'c'] })
    act(() => result.current.remove(0)) // 'b'
    rerender({ list: ['c'] })

    expect(result.current.pending).toMatchObject({ item: 'b' })

    act(() => result.current.undo())

    // Only 'b' comes back; 'a' is already committed.
    expect(onChange).toHaveBeenLastCalledWith(['b', 'c'])
  })

  it('can be dismissed without restoring', () => {
    const { result, onChange } = setup()

    act(() => result.current.remove(1))
    onChange.mockClear()
    act(() => result.current.dismiss())

    expect(result.current.pending).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ignores an index that is not in the list', () => {
    const { result, onChange } = setup(['a'])

    act(() => result.current.remove(9))

    expect(onChange).not.toHaveBeenCalled()
    expect(result.current.pending).toBeNull()
  })

  // main.jsx renders the app inside <StrictMode>, which double-invokes state
  // updaters. Anything with a side effect in an updater restores twice.
  it('restores exactly once under StrictMode', () => {
    const onChange = vi.fn()
    const { result, rerender } = renderHook(
      ({ list }) => useUndoableRemoval(list, onChange),
      { initialProps: { list: ['a', 'b', 'c'] }, wrapper: StrictMode }
    )

    act(() => result.current.remove(1))
    rerender({ list: ['a', 'c'] })
    onChange.mockClear()
    act(() => result.current.undo())

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(['a', 'b', 'c'])
  })

  it('drops its timer on unmount', () => {
    const { result, unmount } = setup(['a', 'b'], 5000)

    act(() => result.current.remove(0))
    unmount()

    expect(() => act(() => vi.advanceTimersByTime(5000))).not.toThrow()
  })
})
