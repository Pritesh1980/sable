import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useWallKeyboard from '../hooks/useWallKeyboard'

function makeItems(spec) {
  // spec: [{ artistId, count }]
  const items = []
  for (const { artistId, count } of spec) {
    for (let i = 0; i < count; i++) {
      items.push({ artistId, artistName: artistId, imageIndex: i, image: `${artistId}-${i}.jpg` })
    }
  }
  return items
}

function fireKey(key) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useWallKeyboard', () => {
  it('moves right/left within the current artist, wrapping at the ends', () => {
    const items = makeItems([{ artistId: 'a', count: 3 }, { artistId: 'b', count: 2 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 0 }))

    fireKey('ArrowRight')
    expect(result.current.index).toBe(1)
    fireKey('ArrowRight')
    expect(result.current.index).toBe(2)
    fireKey('ArrowRight') // wraps within artist a (indices 0-2)
    expect(result.current.index).toBe(0)

    fireKey('ArrowLeft') // wraps backward
    expect(result.current.index).toBe(2)
  })

  it('never crosses into the next artist when moving left/right', () => {
    const items = makeItems([{ artistId: 'a', count: 2 }, { artistId: 'b', count: 2 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 1 }))

    fireKey('ArrowRight') // wraps to start of artist a, not into b
    expect(result.current.index).toBe(0)
    expect(result.current.current.artistId).toBe('a')
  })

  it('jumps to the previous/next artist\'s first image from mid-artist', () => {
    const items = makeItems([{ artistId: 'a', count: 3 }, { artistId: 'b', count: 3 }, { artistId: 'c', count: 2 }])
    // start mid-artist b (global index 4 -> b's 2nd image)
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 4 }))
    expect(result.current.current.artistId).toBe('b')

    fireKey('ArrowDown')
    expect(result.current.current.artistId).toBe('c')
    expect(result.current.positionInArtist).toBe(0)

    fireKey('ArrowUp')
    expect(result.current.current.artistId).toBe('b')
    expect(result.current.positionInArtist).toBe(0)

    fireKey('ArrowUp')
    expect(result.current.current.artistId).toBe('a')
    expect(result.current.positionInArtist).toBe(0)
  })

  it('does not jump past the first or last artist', () => {
    const items = makeItems([{ artistId: 'a', count: 2 }, { artistId: 'b', count: 2 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 0 }))

    fireKey('ArrowUp')
    expect(result.current.current.artistId).toBe('a')

    fireKey('ArrowDown')
    expect(result.current.current.artistId).toBe('b')
    fireKey('ArrowDown')
    expect(result.current.current.artistId).toBe('b')
  })

  it('single-artist edge case: up/down are no-ops', () => {
    const items = makeItems([{ artistId: 'a', count: 3 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 1 }))

    fireKey('ArrowUp')
    expect(result.current.index).toBe(1)
    fireKey('ArrowDown')
    expect(result.current.index).toBe(1)
    expect(result.current.artistCount).toBe(1)
    expect(result.current.artistOrdinal).toBe(1)
  })

  it('single-image artist: left/right are no-ops (trivial wrap)', () => {
    const items = makeItems([{ artistId: 'a', count: 1 }, { artistId: 'b', count: 1 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 0 }))

    fireKey('ArrowRight')
    expect(result.current.index).toBe(0)
    fireKey('ArrowLeft')
    expect(result.current.index).toBe(0)
    expect(result.current.artistImageCount).toBe(1)
  })

  it('calls onGenerate with the current item on G', () => {
    const items = makeItems([{ artistId: 'a', count: 2 }])
    const onGenerate = vi.fn()
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 1, onGenerate }))

    fireKey('g')
    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate.mock.calls[0][0]).toBe(result.current.current)
  })

  it('calls onToggleInfo on I and onClose on Escape', () => {
    const items = makeItems([{ artistId: 'a', count: 1 }])
    const onToggleInfo = vi.fn()
    const onClose = vi.fn()
    renderHook(() => useWallKeyboard({ items, onToggleInfo, onClose }))

    fireKey('I')
    expect(onToggleInfo).toHaveBeenCalledTimes(1)
    fireKey('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores keys while a form field has focus', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const items = makeItems([{ artistId: 'a', count: 3 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 0 }))

    fireKey('ArrowRight')
    expect(result.current.index).toBe(0)
  })

  it('reports artistOrdinal and artistCount across artists', () => {
    const items = makeItems([{ artistId: 'a', count: 2 }, { artistId: 'b', count: 1 }, { artistId: 'c', count: 4 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 2 }))

    expect(result.current.artistOrdinal).toBe(2)
    expect(result.current.artistCount).toBe(3)
    expect(result.current.artistImageCount).toBe(1)
  })

  it('does not attach listeners when enabled is false', () => {
    const items = makeItems([{ artistId: 'a', count: 2 }])
    const { result } = renderHook(() => useWallKeyboard({ items, initialIndex: 0, enabled: false }))

    fireKey('ArrowRight')
    expect(result.current.index).toBe(0)
  })
})
