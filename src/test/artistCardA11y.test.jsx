import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import ArtistCard from '../components/ArtistCard'

// #30. The card's primary "open artist" action was a plain div onClick, with
// no button/link semantics, no keyboard activation, and no focus affordance —
// unreachable and inoperable from keyboard/AT. It can't become a real
// <button>: it hosts genuinely nested interactive controls in editing mode
// (a drag handle, quick-upload buttons, a hidden file input), and a <button>
// containing other interactive controls is invalid, broken semantics. So it
// stays a non-button container with role="button" + tabIndex + a real
// keydown handler, matching WAI-ARIA's authoring practice for that shape.

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

describe('ArtistCard keyboard accessibility (#30)', () => {
  it('exposes the card as a focusable, labeled button', () => {
    render(<ArtistCard artist={artist} onOpen={vi.fn()} onSaveImages={vi.fn()} />)
    const card = screen.getByRole('button', { name: 'Zoia' })
    expect(card).toHaveAttribute('tabIndex', '0')
  })

  it('opens the artist on Enter', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Zoia' }), { key: 'Enter' })
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  it('opens the artist on Space', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Zoia' }), { key: ' ' })
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  it('still opens the artist on click', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoia' }))
    expect(onOpen).toHaveBeenCalledWith(artist)
  })

  it('does not also open the artist when Enter is pressed on the nested quick-upload button', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} editing />)
    const card = screen.getByRole('button', { name: 'Zoia' })
    const addPhotos = within(card).getByRole('button', { name: 'Add photos' })
    fireEvent.keyDown(addPhotos, { key: 'Enter' })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('does not also open the artist when the nested quick-upload button is clicked', () => {
    const onOpen = vi.fn()
    render(<ArtistCard artist={artist} onOpen={onOpen} onSaveImages={vi.fn()} editing />)
    const card = screen.getByRole('button', { name: 'Zoia' })
    fireEvent.click(within(card).getByRole('button', { name: 'Add photos' }))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
