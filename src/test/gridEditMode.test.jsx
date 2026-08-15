import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

// #69 + #70. The grid card carried two 44pt overlay controls — a drag handle and
// a quick-upload + — which between them claimed 13.9% of a 113x150 card even
// after #54 gave the handle's corner back. Both now live behind an explicit Edit
// toggle, so a card in the default browsing view is 100% "open this artist".
//
// This also makes the handle honest: it is only present in a mode that says what
// it is for, which is what lets a KeyboardSensor be registered (#69) instead of
// dnd-kit's attributes announcing a gesture that never worked.
let sortable

vi.mock('@dnd-kit/sortable', async (importOriginal) => ({
  ...(await importOriginal()),
  useSortable: () => sortable,
}))

const { default: SortableArtistCard } = await import('../components/SortableArtistCard')

const artist = { id: 'a1', handle: 'zoia.ink', name: 'Zoia', rank: 1, images: ['/i/a.jpg'] }
const empty = { id: 'a2', handle: 'nova.ink', name: 'Nova', rank: 2, images: [] }
const HANDLE = '[aria-roledescription="sortable"]'

function setSortable(overrides = {}) {
  sortable = {
    attributes: { role: 'button', tabIndex: 0, 'aria-roledescription': 'sortable' },
    listeners: { onPointerDown: () => {}, onKeyDown: () => {} },
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
    ...overrides,
  }
}

function renderCard(props = {}) {
  return render(
    <SortableArtistCard
      artist={artist}
      onOpen={() => {}}
      onSaveImages={() => {}}
      index={0}
      {...props}
    />
  )
}

beforeEach(() => setSortable())
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('grid card in the default browsing view (#70)', () => {
  it('shows no drag handle', () => {
    const { container } = renderCard()
    expect(container.querySelector(HANDLE)).toBeNull()
  })

  it('shows no quick-upload button', () => {
    renderCard()
    expect(screen.queryByLabelText('Add photos')).toBeNull()
  })

  it('shows no "+ Add photo" prompt on an empty tile', () => {
    renderCard({ artist: empty })
    expect(screen.queryByText('+ Add photo')).toBeNull()
  })

  // The promise this whole change rests on: nothing inside the card competes
  // with opening the artist.
  it('leaves nothing on the card that is not "open this artist"', () => {
    const { container } = renderCard()
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelector('[role="button"]')).toBeNull()
  })

  // The buttons are gated; the input behind them deliberately is not. Toggling
  // editing off while the OS picker is open would otherwise unmount the element
  // that receives the chosen files, silently dropping the upload.
  it('keeps the file input mounted so an open picker still delivers', () => {
    const { container } = renderCard()
    expect(container.querySelector('input[type="file"]')).not.toBeNull()
  })

  it('opens the artist when the card is tapped', () => {
    const onOpen = vi.fn()
    const { container } = renderCard({ onOpen })
    fireEvent.click(container.querySelector('.cursor-pointer'))
    expect(onOpen).toHaveBeenCalledWith(artist)
  })
})

describe('grid card with editing on (#70)', () => {
  it('shows the drag handle', () => {
    const { container } = renderCard({ editing: true })
    expect(container.querySelector(HANDLE)).not.toBeNull()
  })

  it('shows the quick-upload button', () => {
    renderCard({ editing: true })
    expect(screen.getByLabelText('Add photos')).toBeTruthy()
  })

  it('offers "+ Add photo" on an empty tile', () => {
    renderCard({ artist: empty, editing: true })
    expect(screen.getByText('+ Add photo')).toBeTruthy()
  })

  // Carried over from #54: the handle is a drag activator, so a tap on it still
  // falls through rather than being a dead zone even here.
  it('still lets a tap on the handle open the artist', () => {
    const onOpen = vi.fn()
    const { container } = renderCard({ editing: true, onOpen })
    fireEvent.click(container.querySelector(HANDLE))
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  // #50's lesson: a control you can reach with Tab but cannot see is not
  // reachable. The handle is focusable (dnd-kit sets tabIndex 0), so it needs a
  // visible focus ring like every other control.
  it('gives the handle a visible focus affordance', () => {
    const { container } = renderCard({ editing: true })
    const cls = container.querySelector(HANDLE).className
    expect(cls).toMatch(/focus-visible:/)
    expect(cls).not.toMatch(/(?:ring|border)-(?:0|transparent)(?![\w-])/)
  })
})
