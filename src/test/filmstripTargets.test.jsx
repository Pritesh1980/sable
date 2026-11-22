import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import FilmstripView from '../components/FilmstripView'

// #76 measured the row's @handle link at 17px tall. #220 E moved the handle to
// the artist's page and put every row control on one line, so that line is
// where the 44pt floor now has to hold. jsdom has no layout, so this asserts
// the declared size that produces it.
function declares44pt(className) {
  return /(?:^|\s)(?:min-h-11|h-11)(?![\w-])/.test(className)
}

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: [], images: [], rank: 1, status: 'researching', notes: '', studio: null },
  { id: 'b', handle: 'b', name: 'Ben', tags: [], images: [], rank: 2, status: 'researching', notes: '', studio: null },
]

describe('FilmstripView touch targets (#76)', () => {
  it('gives every control on the title line a 44pt-tall hit area', () => {
    render(<FilmstripView artists={artists} onOpenArtist={vi.fn()} onSetRank={vi.fn()} />)
    const row = screen.getAllByTestId('filmstrip-row')[0]
    const controls = within(row).getAllByRole('button')
    expect(controls.length).toBeGreaterThanOrEqual(4)
    for (const control of controls) {
      expect(declares44pt(control.className), control.getAttribute('aria-label') || control.textContent).toBe(true)
    }
  })

  it('no longer carries the Instagram link, which lives on the artist page', () => {
    render(<FilmstripView artists={artists} onOpenArtist={vi.fn()} onSetRank={vi.fn()} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
