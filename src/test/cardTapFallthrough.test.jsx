import { StrictMode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DRAG_CLICK_WINDOW_MS } from '../data/dragTap'

// #54: the drag handle claims a 44pt corner of a 113x150 card. It is a drag
// activator, not a button, so a tap on it should fall through and open the
// artist — while the click a real drag produces must still be swallowed.
//
// Every card here renders with `editing` on, because #70 moved the handle and
// the quick-upload + behind that mode. The rules below are what happens once
// they are on screen; whether they appear at all is gridEditMode.test.jsx.
// dnd-kit is mocked so the test can drive `isDragging` directly; the wiring
// under test is ours, not the library's.
//
// What these tests deliberately cannot prove (codex review): the real
// pointerup -> React commit -> synthesized click ordering. jsdom has no such
// sequence, and the mock removes dnd-kit's own capture-phase suppressor, so
// only a browser exercises it. That ordering was checked by hand against a dev
// server — tap opens the artist, a paused drag reorders without opening it, and
// a tap immediately after a drag still opens it.
let sortable
const listenerCalls = []

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => sortable,
}))

const { default: SortableArtistCard } = await import('../components/SortableArtistCard')

const artist = { id: 'a1', handle: 'zoia.ink', name: 'Zoia', rank: 1, images: [] }

// dnd-kit's real `attributes`, so the handle is found the way a user's assistive
// tech would find it rather than by a test-only hook.
const HANDLE = '[aria-roledescription="sortable"]'

function setSortable(overrides = {}) {
  sortable = {
    attributes: { role: 'button', tabIndex: 0, 'aria-roledescription': 'sortable' },
    listeners: {
      onPointerDown: (e) => listenerCalls.push(['onPointerDown', e.type]),
      onKeyDown: (e) => listenerCalls.push(['onKeyDown', e.type]),
    },
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
    ...overrides,
  }
}

function renderCard(onOpen) {
  return render(
    <SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />
  )
}

describe('artist card tap fall-through (#54)', () => {
  let now

  beforeEach(() => {
    listenerCalls.length = 0
    now = 1000
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    setSortable()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('opens the artist when the handle is tapped without dragging', () => {
    const onOpen = vi.fn()
    const { container } = renderCard(onOpen)

    fireEvent.click(container.querySelector(HANDLE))

    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  it('does not open the artist on the click a finished drag produces', () => {
    const onOpen = vi.fn()
    const { container, rerender } = renderCard(onOpen)

    setSortable({ isDragging: true })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)
    setSortable({ isDragging: false })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)

    fireEvent.click(container.querySelector(HANDLE))

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('opens the artist on a fresh tap after a drag, however soon it comes', () => {
    const onOpen = vi.fn()
    const { container, rerender } = renderCard(onOpen)

    setSortable({ isDragging: true })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)
    setSortable({ isDragging: false })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)

    // The drag's own click never arrived, so a bare latch would still be set.
    // The pointerdown that starts this tap is what clears it — note the clock has
    // barely moved, so the backstop alone would not save this.
    now += 5
    const handle = container.querySelector(HANDLE)
    fireEvent.pointerDown(handle)
    fireEvent.click(handle)

    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  // agy's finding 3: persisting and re-rendering the whole ranked list can delay
  // the echo click well past a tight window on a slow device.
  it('still swallows an echo click delayed by a slow re-render', () => {
    const onOpen = vi.fn()
    const { container, rerender } = renderCard(onOpen)

    setSortable({ isDragging: true })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)
    setSortable({ isDragging: false })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)

    now += 400
    fireEvent.click(container.querySelector(HANDLE))

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('eventually gives up rather than swallowing clicks forever', () => {
    const onOpen = vi.fn()
    const { container, rerender } = renderCard(onOpen)

    setSortable({ isDragging: true })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)
    setSortable({ isDragging: false })
    rerender(<SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />)

    // No pointerdown at all — e.g. an assistive-technology activation.
    now += DRAG_CLICK_WINDOW_MS
    fireEvent.click(container.querySelector(HANDLE))

    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  // codex review of #69/#70. The echo latch exists to swallow the click a
  // *pointer* drag produces. A keyboard drag produces no click at all, so arming
  // it there only eats the next assistive-technology activation — which has no
  // pointerdown to clear it, so the 1.5s backstop is all that saves it.
  it('does not arm the echo guard for a keyboard-initiated drag', () => {
    const onOpen = vi.fn()
    const { container, rerender } = renderCard(onOpen)
    const again = () => rerender(
      <SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />
    )
    const handle = container.querySelector(HANDLE)

    // Space on the handle is how dnd-kit's KeyboardSensor picks a card up.
    fireEvent.keyDown(handle, { key: ' ' })
    setSortable({ isDragging: true }); again()
    setSortable({ isDragging: false }); again()

    // The AT click that follows the drop, with no pointerdown anywhere.
    fireEvent.click(container.querySelector(HANDLE))

    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  it('still arms it when the pointer was the more recent activator', () => {
    const onOpen = vi.fn()
    const { container, rerender } = renderCard(onOpen)
    const again = () => rerender(
      <SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />
    )
    const handle = container.querySelector(HANDLE)

    // A keyboard drag earlier in the session must not disarm a later pointer drag.
    fireEvent.keyDown(handle, { key: ' ' })
    now += 50
    fireEvent.pointerDown(handle)
    setSortable({ isDragging: true }); again()
    setSortable({ isDragging: false }); again()

    fireEvent.click(container.querySelector(HANDLE))

    expect(onOpen).not.toHaveBeenCalled()
  })

  it("still hands pointerdown to dnd-kit, so dragging isn't traded away", () => {
    const { container } = renderCard(vi.fn())

    fireEvent.pointerDown(container.querySelector(HANDLE))

    expect(listenerCalls.map(([name]) => name)).toContain('onPointerDown')
  })

  // codex review: a card that mounts while its id is already the active drag
  // gets StrictMode's extra setup -> cleanup probe. Keying off the cleanup would
  // stamp a drag-end that never happened and swallow the next click.
  it('does not treat a StrictMode mount probe as a drag ending', () => {
    const onOpen = vi.fn()
    setSortable({ isDragging: true })
    const { container } = render(
      <StrictMode>
        <SortableArtistCard artist={artist} onOpen={onOpen} onSaveImages={() => {}} index={0} editing />
      </StrictMode>
    )

    fireEvent.click(container.querySelector(HANDLE))

    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  it('leaves the quick-upload button as a button — a tap there must not open the artist', () => {
    const onOpen = vi.fn()
    render(
      <SortableArtistCard
        artist={{ ...artist, images: ['/images/a.jpg'] }}
        onOpen={onOpen}
        onSaveImages={() => {}}
        index={0}
        editing
      />
    )

    fireEvent.click(screen.getByLabelText('Add photos'))

    expect(onOpen).not.toHaveBeenCalled()
  })

  // Same trap on the other route into the picker: an empty tile offers a text
  // button instead of the overlay +.
  it('does not open the artist when an empty tile’s "+ Add photo" is used', () => {
    const onOpen = vi.fn()
    renderCard(onOpen)

    fireEvent.click(screen.getByText('+ Add photo'))

    expect(onOpen).not.toHaveBeenCalled()
  })
})
