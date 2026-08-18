import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Gallery from '../pages/Gallery'

// #74. dnd-kit's KeyboardSensor drives an active drag through document-level
// listeners it installs when the drag activates — listeners that are only
// torn down in the drag's own handleEnd/handleCancel, not on unmount. If the
// transitions below unmount the Grid/DndContext or hide the dragged card's
// handle mid-drag, that listener is orphaned: still capturing key/pointer
// input, possibly committing a reorder against a list no longer on screen.
//
// Fix: track drag-active state via DndContext's own onDragStart/onDragEnd/
// onDragCancel and disable those transitions while a drag is live, rather
// than trying to unmount cleanly out from under an active drag.
//
// Driving a *real* dnd-kit keyboard drag through jsdom tests the library, not
// us (see #69's own test file) — mocking DndContext's callback wiring lets
// this test exercise Gallery's own reaction without that fragility.

let dndCallbacks = {}
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }) => {
      dndCallbacks = { onDragStart, onDragEnd, onDragCancel }
      return children
    },
  }
})

vi.mock('@dnd-kit/sortable', async (importOriginal) => ({
  ...(await importOriginal()),
  useSortable: () => ({
    attributes: { role: 'button', tabIndex: 0 },
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}))

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
const manageToggle = () => screen.getByRole('button', { name: /^manage$/i })

beforeEach(() => {
  localStorage.clear()
  dndCallbacks = {}
})

describe('guards transitions that would orphan an active keyboard drag (#74)', () => {
  it('disables the view switcher, Reorder toggle, Manage, and filters once a drag starts', () => {
    renderGallery()
    toGrid()
    fireEvent.click(editToggle())

    expect(screen.getByTitle('Filmstrip view')).not.toBeDisabled()

    act(() => dndCallbacks.onDragStart({ active: { id: baseArtists[0].id } }))

    expect(screen.getByTitle('Filmstrip view')).toBeDisabled()
    expect(screen.getByTitle('Compare artists')).toBeDisabled()
    expect(screen.getByTitle('Grid view')).toBeDisabled()
    expect(screen.getByTitle('Style wall')).toBeDisabled()
    expect(editToggle()).toBeDisabled()
    expect(manageToggle()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'All' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'surrealism' })).toBeDisabled()
  })

  it('re-enables everything once the drag ends', () => {
    renderGallery()
    toGrid()
    act(() => dndCallbacks.onDragStart({ active: { id: baseArtists[0].id } }))
    expect(editToggle()).toBeDisabled()

    act(() => dndCallbacks.onDragEnd({ active: { id: baseArtists[0].id }, over: null }))

    expect(editToggle()).not.toBeDisabled()
    expect(manageToggle()).not.toBeDisabled()
  })

  it('re-enables everything on drag cancel too (e.g. Escape mid-drag)', () => {
    renderGallery()
    toGrid()
    act(() => dndCallbacks.onDragStart({ active: { id: baseArtists[0].id } }))
    expect(editToggle()).toBeDisabled()

    act(() => dndCallbacks.onDragCancel())

    expect(editToggle()).not.toBeDisabled()
  })

  it('does not disable anything before a drag has ever started', () => {
    renderGallery()
    toGrid()
    expect(editToggle()).not.toBeDisabled()
    expect(manageToggle()).not.toBeDisabled()
    expect(screen.getByRole('button', { name: 'All' })).not.toBeDisabled()
  })
})
