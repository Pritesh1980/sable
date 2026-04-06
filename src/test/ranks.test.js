import { describe, it, expect } from 'vitest'
import { arrayMove } from '@dnd-kit/sortable'

// Mirrors the handleDragEnd logic in Gallery.jsx
function rerank(artists, activeId, overId) {
  const all = artists.slice().sort((a, b) => a.rank - b.rank)
  const oldIndex = all.findIndex((a) => a.id === activeId)
  const newIndex = all.findIndex((a) => a.id === overId)
  return arrayMove(all, oldIndex, newIndex).map((a, i) => ({ ...a, rank: i + 1 }))
}

// Mirrors the addArtist logic in Manage.jsx
function addArtist(artists, { handle, name }) {
  const maxRank = artists.reduce((m, a) => Math.max(m, a.rank), 0)
  return { id: handle, handle, name, tags: [], images: [], rank: maxRank + 1, studio: null }
}

const ARTISTS = [
  { id: 'a', handle: 'a', rank: 1 },
  { id: 'b', handle: 'b', rank: 2 },
  { id: 'c', handle: 'c', rank: 3 },
  { id: 'd', handle: 'd', rank: 4 },
]

describe('Gallery drag-to-rerank', () => {
  it('moves an artist forward in the list', () => {
    const result = rerank(ARTISTS, 'a', 'c')
    expect(result.find((a) => a.id === 'a').rank).toBe(3)
    expect(result.find((a) => a.id === 'c').rank).toBe(2)
  })

  it('moves an artist backward in the list', () => {
    const result = rerank(ARTISTS, 'd', 'b')
    expect(result.find((a) => a.id === 'd').rank).toBe(2)
    expect(result.find((a) => a.id === 'b').rank).toBe(3)
  })

  it('ranks are always sequential after a move', () => {
    const result = rerank(ARTISTS, 'c', 'a')
    const ranks = result.map((a) => a.rank).sort((x, y) => x - y)
    expect(ranks).toEqual([1, 2, 3, 4])
  })

  it('no-op when dragging onto self', () => {
    // Gallery guards against active.id === over.id before calling rerank,
    // but rerank itself should still produce valid sequential ranks
    const result = rerank(ARTISTS, 'b', 'b')
    const ranks = result.map((a) => a.rank).sort((x, y) => x - y)
    expect(ranks).toEqual([1, 2, 3, 4])
  })
})

describe('Manage addArtist', () => {
  it('assigns rank one higher than the current maximum', () => {
    const newArtist = addArtist(ARTISTS, { handle: 'e', name: '' })
    expect(newArtist.rank).toBe(5)
  })

  it('assigns rank 1 when the list is empty', () => {
    const newArtist = addArtist([], { handle: 'first', name: '' })
    expect(newArtist.rank).toBe(1)
  })

  it('new artist has no tier field', () => {
    const newArtist = addArtist(ARTISTS, { handle: 'x', name: '' })
    expect(newArtist).not.toHaveProperty('tier')
  })

  it('new artist has required fields', () => {
    const newArtist = addArtist(ARTISTS, { handle: 'new_handle', name: 'New Name' })
    expect(newArtist).toMatchObject({
      id: 'new_handle',
      handle: 'new_handle',
      name: 'New Name',
      tags: [],
      images: [],
      studio: null,
    })
  })
})
