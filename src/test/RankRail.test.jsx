import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RankRail from '../components/RankRail'

const artists = [
  { id: 'a', handle: 'a', name: 'Aaa', rank: 1, images: ['a.jpg'] },
  { id: 'b', handle: 'b', name: 'Bbb', rank: 2, images: ['b.jpg'] },
  { id: 'c', handle: 'c', name: 'Ccc', rank: 3, images: [] },
  { id: 'd', handle: 'd', name: 'Ddd', rank: 4, images: [] },
  { id: 'e', handle: 'e', name: 'Eee', rank: 5, images: [] },
  { id: 'f', handle: 'f', name: 'Fff', rank: 6, images: [] },
]

it('renders the five lowest-rank artists in order', () => {
  render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={vi.fn()} />)
  const tiles = screen.getAllByTestId('rank-tile')
  expect(tiles).toHaveLength(5)
  expect(tiles[0]).toHaveTextContent('Aaa')
  expect(tiles[4]).toHaveTextContent('Eee')
})

it('moves an artist up via the functional setter', () => {
  const setArtists = vi.fn()
  render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Bbb up/i }))
  const updater = setArtists.mock.calls[0][0]
  const next = updater(artists)
  expect(next.find((x) => x.id === 'b').rank).toBe(1)
})

it('▲ on rank 1 is a no-op result', () => {
  const setArtists = vi.fn()
  render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Aaa up/i }))
  const next = setArtists.mock.calls[0][0](artists)
  expect(next.find((x) => x.id === 'a').rank).toBe(1)
})

it('▼ on the visible rank-5 tile pushes it to rank 6', () => {
  const setArtists = vi.fn()
  render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Eee down/i }))
  const next = setArtists.mock.calls[0][0](artists)
  expect(next.find((x) => x.id === 'e').rank).toBe(6)
  expect(next.find((x) => x.id === 'f').rank).toBe(5)
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
