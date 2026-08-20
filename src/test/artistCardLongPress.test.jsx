import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import ArtistCard from '../components/ArtistCard'

// #71: on iOS the universal gesture for "rearrange this grid" is a long-press
// on a tile — the Home Screen, Photos, Files all work that way. Before this,
// Sable required finding and tapping the ⇅ toolbar glyph first.

const artist = {
  id: 'a1',
  handle: 'zoia.ink',
  name: 'Zoia',
  rank: 1,
  images: ['first.jpg'],
  tags: [],
  status: 'researching',
  notes: '',
  studio: null,
}

function press(el, { x = 0, y = 0 } = {}) {
  fireEvent.pointerDown(el, { pointerType: 'touch', button: 0, clientX: x, clientY: y })
}

describe('ArtistCard long-press to reorder (#71)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('calls onLongPress after holding the card', () => {
    const onLongPress = vi.fn()
    const { container } = render(
      <ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} onLongPress={onLongPress} />
    )
    press(container.firstChild)
    vi.advanceTimersByTime(500)
    expect(onLongPress).toHaveBeenCalledTimes(1)
  })

  it('does not open the artist when the press completes into a long-press', () => {
    const onOpen = vi.fn()
    const onLongPress = vi.fn()
    const { container } = render(
      <ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} onLongPress={onLongPress} />
    )
    press(container.firstChild)
    vi.advanceTimersByTime(500)
    fireEvent.click(container.firstChild)
    expect(onLongPress).toHaveBeenCalledTimes(1)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('still opens the artist on an ordinary quick tap', () => {
    const onOpen = vi.fn()
    const onLongPress = vi.fn()
    const { container } = render(
      <ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} onLongPress={onLongPress} />
    )
    press(container.firstChild)
    vi.advanceTimersByTime(100)
    fireEvent.pointerUp(container.firstChild)
    fireEvent.click(container.firstChild)
    expect(onLongPress).not.toHaveBeenCalled()
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  it('does not fire while already editing — the drag handle owns the gesture then', () => {
    const onLongPress = vi.fn()
    const { container } = render(
      <ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} onLongPress={onLongPress} editing />
    )
    press(container.firstChild)
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('does not fire on a hold that drifts — a scroll, not a hold', () => {
    const onLongPress = vi.fn()
    const { container } = render(
      <ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} onLongPress={onLongPress} />
    )
    press(container.firstChild, { x: 0, y: 0 })
    fireEvent.pointerMove(container.firstChild, { pointerType: 'touch', clientX: 0, clientY: 40 })
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })

  it('renders and opens normally when onLongPress is not provided', () => {
    const onOpen = vi.fn()
    const { container } = render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    fireEvent.click(container.firstChild)
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  // #71 cross-model review, finding 5: without onLongPress there is nothing
  // for a hold to do — it must not arm the recognizer and eat the click that
  // opens the artist.
  it('still opens the artist after a held press when onLongPress is not provided', () => {
    const onOpen = vi.fn()
    const { container } = render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    press(container.firstChild)
    vi.advanceTimersByTime(500)
    fireEvent.click(container.firstChild)
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  // Finding 2: enabled has to reach the already-armed timer, not just future
  // renders' prop wiring — otherwise a hold started just before editing
  // turns on (e.g. from another card's own long-press) still fires later.
  it('does not fire once editing turns on mid-hold', () => {
    const onLongPress = vi.fn()
    const { container, rerender } = render(
      <ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} onLongPress={onLongPress} editing={false} />
    )
    press(container.firstChild)
    vi.advanceTimersByTime(300)
    rerender(
      <ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} onLongPress={onLongPress} editing />
    )
    vi.advanceTimersByTime(500)
    expect(onLongPress).not.toHaveBeenCalled()
  })
})
