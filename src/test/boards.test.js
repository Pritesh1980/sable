import { describe, it, expect } from 'vitest'
import {
  BLANK_BOARD,
  addIdeaToBoard,
  removeIdeaFromBoard,
  moveIdeaInBoard,
  getBoardIdeas,
  getBoardCover,
} from '../data/boards'

describe('BLANK_BOARD', () => {
  it('has name, description, ideaIds, cover fields', () => {
    expect(BLANK_BOARD).toMatchObject({
      name: '',
      description: '',
      ideaIds: [],
      cover: '',
    })
  })
})

describe('addIdeaToBoard', () => {
  it('appends an idea id', () => {
    const board = { ideaIds: ['a'] }
    expect(addIdeaToBoard(board, 'b').ideaIds).toEqual(['a', 'b'])
  })

  it('does not duplicate when idea already in board', () => {
    const board = { ideaIds: ['a', 'b'] }
    expect(addIdeaToBoard(board, 'a').ideaIds).toEqual(['a', 'b'])
  })

  it('returns a new object (immutable)', () => {
    const board = { ideaIds: ['a'] }
    const next = addIdeaToBoard(board, 'b')
    expect(next).not.toBe(board)
    expect(board.ideaIds).toEqual(['a'])
  })
})

describe('removeIdeaFromBoard', () => {
  it('removes the given id', () => {
    const board = { ideaIds: ['a', 'b', 'c'] }
    expect(removeIdeaFromBoard(board, 'b').ideaIds).toEqual(['a', 'c'])
  })

  it('is a no-op when id not in board', () => {
    const board = { ideaIds: ['a'] }
    expect(removeIdeaFromBoard(board, 'x').ideaIds).toEqual(['a'])
  })
})

describe('moveIdeaInBoard', () => {
  it('nudges an idea up by one', () => {
    const board = { ideaIds: ['a', 'b', 'c'] }
    expect(moveIdeaInBoard(board, 'c', -1).ideaIds).toEqual(['a', 'c', 'b'])
  })

  it('nudges an idea down by one', () => {
    const board = { ideaIds: ['a', 'b', 'c'] }
    expect(moveIdeaInBoard(board, 'a', 1).ideaIds).toEqual(['b', 'a', 'c'])
  })

  it('clamps at start of list', () => {
    const board = { ideaIds: ['a', 'b'] }
    expect(moveIdeaInBoard(board, 'a', -1).ideaIds).toEqual(['a', 'b'])
  })

  it('clamps at end of list', () => {
    const board = { ideaIds: ['a', 'b'] }
    expect(moveIdeaInBoard(board, 'b', 1).ideaIds).toEqual(['a', 'b'])
  })

  it('is a no-op for unknown id', () => {
    const board = { ideaIds: ['a', 'b'] }
    expect(moveIdeaInBoard(board, 'x', 1).ideaIds).toEqual(['a', 'b'])
  })
})

describe('getBoardIdeas', () => {
  const ideas = [
    { id: 'a', title: 'A' },
    { id: 'b', title: 'B' },
    { id: 'c', title: 'C' },
  ]

  it('returns ideas in board order', () => {
    const board = { ideaIds: ['c', 'a'] }
    expect(getBoardIdeas(board, ideas).map((i) => i.id)).toEqual(['c', 'a'])
  })

  it('skips ids that do not match an idea (stale reference)', () => {
    const board = { ideaIds: ['a', 'missing', 'b'] }
    expect(getBoardIdeas(board, ideas).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('returns empty for empty board', () => {
    expect(getBoardIdeas({ ideaIds: [] }, ideas)).toEqual([])
  })
})

describe('getBoardCover', () => {
  const ideas = [
    { id: 'a', images: [] },
    { id: 'b', images: ['img-b-1.jpg', 'img-b-2.jpg'] },
    { id: 'c', images: ['img-c-1.jpg'] },
  ]

  it('returns the explicit cover when set', () => {
    const board = { cover: 'custom.jpg', ideaIds: ['b'] }
    expect(getBoardCover(board, ideas)).toBe('custom.jpg')
  })

  it('falls back to first image of first idea with images', () => {
    const board = { cover: '', ideaIds: ['a', 'b', 'c'] }
    expect(getBoardCover(board, ideas)).toBe('img-b-1.jpg')
  })

  it('returns empty string when no idea has an image', () => {
    const board = { cover: '', ideaIds: ['a'] }
    expect(getBoardCover(board, ideas)).toBe('')
  })

  it('returns empty string for empty board', () => {
    expect(getBoardCover({ cover: '', ideaIds: [] }, ideas)).toBe('')
  })
})
