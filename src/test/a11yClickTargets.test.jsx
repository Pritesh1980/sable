import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import StyleWall from '../components/StyleWall'
import FilmstripView from '../components/FilmstripView'
import ArtistDetail from '../components/ArtistDetail'
import Brief from '../pages/Brief'
import Nav from '../components/Nav'
import { ThemeProvider } from '../context/ThemeContext'
import { AuthProvider } from '../context/AuthContext'

// #104 (SonarQube S6848): everything you can click to open is reachable and
// operable from the keyboard, and every overlay closes with Escape.

const artist = {
  id: 'zoia.ink', handle: 'zoia.ink', name: 'Zoia', tags: ['blackwork'],
  images: ['/images/demo/a.svg', '/images/demo/b.svg'], rank: 1, status: 'researching', notes: '', studio: null,
}
const pressEscape = () => fireEvent.keyDown(document, { key: 'Escape' })

beforeEach(() => localStorage.clear())

describe('keyboard-operable click targets', () => {
  it('style wall tiles open the artist', () => {
    const onOpenArtist = vi.fn()
    render(<StyleWall artists={[artist]} onOpenArtist={onOpenArtist} />)
    const [tile] = screen.getAllByRole('button', { name: /open zoia/i })
    expect(tile).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(tile, { key: 'Enter' })
    expect(onOpenArtist).toHaveBeenCalledWith(artist)
  })

  it('filmstrip thumbnails and the artist block open the artist', () => {
    const onOpenArtist = vi.fn()
    render(<FilmstripView artists={[artist]} onOpenArtist={onOpenArtist} onSetRank={vi.fn()} onSetStatus={vi.fn()} />)
    const buttons = screen.getAllByRole('button', { name: /open zoia/i })
    expect(buttons.length).toBe(3) // artist block + two thumbnails
    for (const b of buttons) fireEvent.keyDown(b, { key: ' ' })
    expect(onOpenArtist).toHaveBeenCalledTimes(3)
  })

  it('a key pressed on the filmstrip @handle link does not also open the artist', () => {
    const onOpenArtist = vi.fn()
    render(<FilmstripView artists={[artist]} onOpenArtist={onOpenArtist} onSetRank={vi.fn()} onSetStatus={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('link', { name: /@zoia\.ink/i }), { key: 'Enter' })
    expect(onOpenArtist).not.toHaveBeenCalled()
  })

  it('idea cards open the idea from the keyboard', () => {
    render(
      <MemoryRouter>
        <Brief
          ideas={[{ id: 'i1', title: 'Koru unfurling', tags: [], images: [], status: 'idea', placement: '', description: '', linkedArtists: [] }]}
          setIdeas={vi.fn()} artists={[]} boards={[]} setBoards={vi.fn()}
        />
      </MemoryRouter>
    )
    fireEvent.keyDown(screen.getByRole('button', { name: /koru unfurling/i }), { key: 'Enter' })
    // The editor opens with the idea's title in it.
    expect(screen.getByDisplayValue('Koru unfurling')).toBeInTheDocument()
  })
})

describe('artist detail lightbox', () => {
  it('opens from the keyboard, is a labelled dialog, and closes with Escape', () => {
    render(<ArtistDetail artist={artist} onClose={vi.fn()} onSave={vi.fn()} />)
    fireEvent.keyDown(screen.getByRole('button', { name: /view image 1 full screen/i }), { key: 'Enter' })
    const box = screen.getByRole('dialog', { name: /image viewer/i })
    expect(within(box).getByRole('button', { name: /close/i })).toBeInTheDocument()
    expect(within(box).getByRole('button', { name: /next image/i })).toBeInTheDocument()
    pressEscape()
    expect(screen.queryByRole('dialog', { name: /image viewer/i })).toBeNull()
  })

  it('closes from its labelled close button', () => {
    render(<ArtistDetail artist={artist} onClose={vi.fn()} onSave={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /view image 1 full screen/i }))
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog', { name: /image viewer/i })).toBeNull()
  })
})

describe('overlays close with Escape', () => {
  it('the More menu is a labelled dialog that Escape closes', () => {
    render(
      <AuthProvider><ThemeProvider><MemoryRouter initialEntries={['/gallery']}><Nav /></MemoryRouter></ThemeProvider></AuthProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    expect(screen.getByRole('dialog', { name: /more/i })).toBeInTheDocument()
    pressEscape()
    expect(screen.queryByRole('dialog', { name: /more/i })).toBeNull()
  })

  it('the filmstrip status picker closes with Escape', () => {
    render(<FilmstripView artists={[artist]} onOpenArtist={vi.fn()} onSetRank={vi.fn()} onSetStatus={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /researching/i }))
    const options = () => screen.queryAllByRole('button', { name: /shortlisted/i })
    expect(options().length).toBeGreaterThan(0)
    pressEscape()
    expect(options().length).toBe(0)
  })
})
