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
//
// Cross-model review of the first version of this fix (codex + agy,
// independently, same two findings): the button is still a DOM child of the
// outer div, so a click on it bubbles into the outer div's own onClick —
// onOpen fired twice per keyboard/AT activation — and its focus-visible ring
// was invisible, painted underneath the opaque aspect-ratio box occluding it
// for mouse purposes. Both are covered below.

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

  // Not just toHaveBeenCalledWith: that passes even if onOpen fired twice,
  // which is exactly the bubbling bug the review caught (the button is a
  // DOM child of the div that also calls onOpen on click).
  it('opens the artist exactly once on click, not twice via bubbling to the outer div', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoia' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  // The button paints underneath the opaque aspect-ratio box (so a mouse
  // can't reach it), which means a ring drawn on the button itself would be
  // invisible when it's focused. The ring has to live on the outer div,
  // reacting via :focus-within to the same focus event.
  it('gives the outer card a focus-within ring, since a ring on the occluded button would be invisible', () => {
    const { container } = render(<ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} />)
    const outer = container.firstChild
    expect(outer.className).toMatch(/focus-within:ring-2/)
    expect(outer).not.toBe(screen.getByRole('button', { name: 'Zoia' }))
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
