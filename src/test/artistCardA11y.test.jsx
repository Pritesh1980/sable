import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ArtistCard from '../components/ArtistCard'

// #30 gave the card's "open artist" action keyboard/AT operability. #83 then
// found that the original shape — role="button" wrapping the whole card,
// including the drag handle and quick-upload buttons while editing — put
// focusable descendants inside a button-role element, which role="button"
// is not supposed to have (a conforming AT combination isn't guaranteed to
// expose them). The fix: the "open artist" control is a real, empty
// <button> laid out as a sibling of everything else, not an ancestor of it.
// A native <button> needs no bespoke keydown handling to be Enter/Space
// operable — that's the browser's own default action for the element, not
// application logic, so it isn't re-tested here (confirmed empirically that
// jsdom's fireEvent doesn't simulate it, unlike a real browser: testing it
// would only be testing jsdom, not this component).

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

describe('ArtistCard keyboard accessibility (#30, #83)', () => {
  it('exposes the card as a real, labeled <button>', () => {
    render(<ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} />)
    const card = screen.getByRole('button', { name: 'Zoia' })
    expect(card.tagName).toBe('BUTTON')
  })

  it('opens the artist on click', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoia' }))
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  // The point of #83: while editing nests genuinely interactive controls
  // (drag handle, quick-upload buttons) elsewhere in the card, none of them
  // may be descendants of the "open artist" button itself.
  it('has zero descendants of the "open artist" button, even while editing', () => {
    render(<ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} editing />)
    const card = screen.getByRole('button', { name: 'Zoia' })
    expect(card.children).toHaveLength(0)
  })

  it('does not also open the artist when the nested quick-upload button is clicked', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} editing />)
    fireEvent.click(screen.getByRole('button', { name: 'Add photos' }))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('still opens the artist on click when editing is off, with no interactive descendants to compete', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    expect(screen.queryAllByRole('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Zoia' }))
    expect(onOpen).toHaveBeenCalledWith(artist)
  })
})
