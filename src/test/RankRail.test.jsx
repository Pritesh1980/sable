import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import RankRail from '../components/RankRail'

const artists = [
  { id: 'a', handle: 'a', name: 'Aaa', rank: 1, images: ['a.jpg'] },
  { id: 'b', handle: 'b', name: 'Bbb', rank: 2, images: ['b.jpg'] },
  { id: 'c', handle: 'c', name: 'Ccc', rank: 3, images: [] },
  { id: 'd', handle: 'd', name: 'Ddd', rank: 4, images: [] },
  { id: 'e', handle: 'e', name: 'Eee', rank: 5, images: [] },
  { id: 'f', handle: 'f', name: 'Fff', rank: 6, images: [] },
]

// #87. Driving a real dnd-kit pointer/keyboard drag through jsdom tests the
// library, not RankRail (see galleryDragGuard.test.jsx's own note on this).
// Capture DndContext's onDragEnd and exercise RankRail's reaction directly.
let capturedOnDragEnd
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }) => {
      capturedOnDragEnd = onDragEnd
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

beforeEach(() => {
  capturedOnDragEnd = undefined
})

it('renders the five lowest-rank artists in order', () => {
  render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={vi.fn()} />)
  const tiles = screen.getAllByTestId('rank-tile')
  expect(tiles).toHaveLength(5)
  expect(tiles[0]).toHaveTextContent('Aaa')
  expect(tiles[4]).toHaveTextContent('Eee')
})

it('renders even when no artist has images', () => {
  const noImgs = artists.map((a) => ({ ...a, images: [] }))
  render(<RankRail artists={noImgs} setArtists={vi.fn()} onOpenBoard={vi.fn()} />)
  expect(screen.getAllByTestId('rank-tile')).toHaveLength(5)
})

it('opens the board', () => {
  const onOpenBoard = vi.fn()
  render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={onOpenBoard} />)
  fireEvent.click(screen.getByRole('button', { name: /rank ⤢/i }))
  expect(onOpenBoard).toHaveBeenCalled()
})

describe('drag-to-reorder rank handle (#87)', () => {
  it('gives the rank digit a 44pt drag handle', () => {
    render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={vi.fn()} />)
    const handle = screen.getByRole('button', { name: /reorder aaa/i })
    expect(handle.className).toMatch(/\bw-11\b/)
    expect(handle.className).toMatch(/\bh-11\b/)
  })

  it('no longer renders separate up/down buttons', () => {
    render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /move .* up/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /move .* down/i })).not.toBeInTheDocument()
  })

  it('dropping a tile onto another moves it to that rank, shifting the rest', () => {
    const setArtists = vi.fn()
    render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)

    act(() => capturedOnDragEnd({ active: { id: 'b' }, over: { id: 'd' } }))

    const next = setArtists.mock.calls[0][0](artists)
    expect(next.find((x) => x.id === 'b').rank).toBe(4)
    expect(next.find((x) => x.id === 'c').rank).toBe(2)
    expect(next.find((x) => x.id === 'd').rank).toBe(3)
    expect(next.find((x) => x.id === 'a').rank).toBe(1)
    expect(next.find((x) => x.id === 'e').rank).toBe(5)
    // artists outside the visible top 5 are untouched
    expect(next.find((x) => x.id === 'f').rank).toBe(6)
  })

  it('dropping a tile back onto itself is a no-op', () => {
    const setArtists = vi.fn()
    render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
    act(() => capturedOnDragEnd({ active: { id: 'a' }, over: { id: 'a' } }))
    expect(setArtists).not.toHaveBeenCalled()
  })

  it('dropping outside any tile is a no-op', () => {
    const setArtists = vi.fn()
    render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
    act(() => capturedOnDragEnd({ active: { id: 'a' }, over: null }))
    expect(setArtists).not.toHaveBeenCalled()
  })
})
