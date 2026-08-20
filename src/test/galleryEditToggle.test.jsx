import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Gallery from '../pages/Gallery'

const root = join(import.meta.dirname, '../..')

const baseArtists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['surrealism'], images: [], rank: 1, status: 'contact-next', notes: '', studio: null },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', tags: ['fine-line'], images: [], rank: 2, status: 'shortlisted', notes: '', studio: null },
]

function renderGallery({ artists = baseArtists, setArtists = vi.fn() } = {}) {
  render(
    <MemoryRouter initialEntries={['/gallery']}>
      <Gallery artists={artists} setArtists={setArtists} />
    </MemoryRouter>
  )
  return { setArtists }
}

const toGrid = () => fireEvent.click(screen.getByTitle('Grid view'))
const editToggle = () => screen.getByRole('button', { name: /reorder/i })
const handles = () => document.querySelectorAll('[aria-roledescription="sortable"]')

describe('Gallery edit toggle (#70)', () => {
  beforeEach(() => localStorage.clear())

  it('offers the toggle only in grid view — the only view that has cards to reorder', () => {
    renderGallery()
    // Filmstrip is the default view.
    expect(screen.queryByRole('button', { name: /reorder/i })).not.toBeInTheDocument()

    toGrid()
    expect(editToggle()).toBeInTheDocument()
  })

  it('starts off, so grid cards carry no controls', () => {
    renderGallery()
    toGrid()
    expect(handles()).toHaveLength(0)
  })

  it('reveals a drag handle on every card when switched on, and hides them again', () => {
    renderGallery()
    toGrid()

    fireEvent.click(editToggle())
    expect(handles()).toHaveLength(baseArtists.length)

    fireEvent.click(editToggle())
    expect(handles()).toHaveLength(0)
  })

  it('says whether it is on', () => {
    renderGallery()
    toGrid()
    expect(editToggle()).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(editToggle())
    expect(editToggle()).toHaveAttribute('aria-pressed', 'true')
  })

  // codex review: Manage replaces the browsing views entirely, so the Reorder
  // switch is not on screen while you are in there. Returning with handles still
  // on would restore a mode the user could not have set from where they were.
  it('drops back to browsing after a detour through Manage', () => {
    renderGallery()
    toGrid()
    fireEvent.click(editToggle())
    expect(handles()).toHaveLength(baseArtists.length)

    // The ⊞ in the label is aria-hidden, so the accessible name is just "Manage".
    fireEvent.click(screen.getByRole('button', { name: /^manage$/i }))
    expect(screen.getByText('Add New Artist')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^manage$/i }))

    expect(handles()).toHaveLength(0)
  })

  // Leaving grid view with editing still on would strand the state: the toggle
  // that turns it off is gone.
  it('drops back to browsing when the view changes', () => {
    renderGallery()
    toGrid()
    fireEvent.click(editToggle())
    expect(handles()).toHaveLength(baseArtists.length)

    fireEvent.click(screen.getByTitle('Filmstrip view'))
    toGrid()
    expect(handles()).toHaveLength(0)
  })
})

// #71. iOS's universal "rearrange this grid" gesture is a long-press on a
// tile — before this, the ⇅ toggle was the only way in.
describe('long-press enters Reorder (#71)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  function press(el) {
    fireEvent.pointerDown(el, { pointerType: 'touch', button: 0, clientX: 0, clientY: 0 })
  }

  it('turns Reorder on after holding a card', () => {
    renderGallery()
    toGrid()
    expect(editToggle()).toHaveAttribute('aria-pressed', 'false')

    const card = screen.getByRole('button', { name: '@zoia.ink' }).parentElement
    press(card)
    act(() => vi.advanceTimersByTime(500))

    expect(editToggle()).toHaveAttribute('aria-pressed', 'true')
    expect(handles()).toHaveLength(baseArtists.length)
  })

  it('does not turn Reorder on for an ordinary quick tap', () => {
    renderGallery()
    toGrid()

    const card = screen.getByRole('button', { name: '@zoia.ink' }).parentElement
    press(card)
    vi.advanceTimersByTime(100)
    fireEvent.pointerUp(card)
    fireEvent.click(card)

    expect(editToggle()).toHaveAttribute('aria-pressed', 'false')
  })
})

// #69. dnd-kit's attributes announce "To pick up a draggable item, press the
// space bar" on every handle, but only PointerSensor and TouchSensor were
// registered — so that had never been true. A source check, because driving
// dnd-kit's keyboard sorting through jsdom asserts the library, not us.
describe('keyboard sorting is registered (#69)', () => {
  const src = readFileSync(join(root, 'src/pages/Gallery.jsx'), 'utf8')

  it('registers a KeyboardSensor', () => {
    expect(src).toMatch(/useSensor\(\s*KeyboardSensor/)
  })

  it('gives it the sortable coordinate getter, without which arrows do nothing', () => {
    expect(src).toMatch(/coordinateGetter:\s*sortableKeyboardCoordinates/)
  })

  it('imports both from dnd-kit rather than hand-rolling them', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bKeyboardSensor\b[^}]*\}\s*from\s*'@dnd-kit\/core'/s)
    expect(src).toMatch(/import\s*\{[^}]*\bsortableKeyboardCoordinates\b[^}]*\}\s*from\s*'@dnd-kit\/sortable'/s)
  })
})
