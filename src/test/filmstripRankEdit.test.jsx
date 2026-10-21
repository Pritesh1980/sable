import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilmstripView from '../components/FilmstripView'

// Typing a rank into the filmstrip: only a whole number within 1..N that
// differs from the current rank is saved; anything else just closes the editor.
const artists = [
  { id: 'a', handle: 'a.ink', name: 'Ana', tags: [], images: [], rank: 1, status: 'researching', notes: '', studio: null },
  { id: 'b', handle: 'b.ink', name: 'Bo', tags: [], images: [], rank: 2, status: 'researching', notes: '', studio: null },
  { id: 'c', handle: 'c.ink', name: 'Cy', tags: [], images: [], rank: 3, status: 'researching', notes: '', studio: null },
]

function editRankOfFirst(value, finish = 'Enter') {
  const onSetRank = vi.fn()
  render(<FilmstripView artists={artists} onOpenArtist={vi.fn()} onSetRank={onSetRank} onSetStatus={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /^#?1$/ }))
  const input = screen.getByRole('spinbutton')
  fireEvent.change(input, { target: { value } })
  if (finish === 'blur') fireEvent.blur(input)
  else fireEvent.keyDown(input, { key: finish })
  return { onSetRank }
}

describe('filmstrip rank editing', () => {
  it('saves a valid new rank on Enter', () => {
    const { onSetRank } = editRankOfFirst('3')
    expect(onSetRank).toHaveBeenCalledWith('a', 3)
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('saves on blur too', () => {
    const { onSetRank } = editRankOfFirst('2', 'blur')
    expect(onSetRank).toHaveBeenCalledWith('a', 2)
  })

  it.each([
    ['not a number', ''],
    ['below 1', '0'],
    ['above the number of artists', '9'],
    ['the rank it already has', '1'],
  ])('ignores %s', (_label, value) => {
    const { onSetRank } = editRankOfFirst(value)
    expect(onSetRank).not.toHaveBeenCalled()
    expect(screen.queryByRole('spinbutton')).toBeNull()
  })

  it('Escape cancels without saving', () => {
    const { onSetRank } = editRankOfFirst('3', 'Escape')
    expect(onSetRank).not.toHaveBeenCalled()
  })
})
