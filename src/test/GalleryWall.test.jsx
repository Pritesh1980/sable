import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router'
import Gallery from '../pages/Gallery'

// #220: the wall is the Artists page's default view.
vi.mock('../data/styleIndex', () => ({ loadVectors: vi.fn(async () => new Map()) }))

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: 'Zoia', tags: ['surrealism'], images: ['/images/a/1.jpg'], rank: 1, status: 'researching', notes: '', studio: null },
  { id: 'carl', handle: 'carl', name: 'Carl', tags: ['realism'], images: ['/images/b/1.jpg'], rank: 2, status: 'researching', notes: '', studio: null },
]

const probe = {}
function Where() {
  const location = useLocation()
  useEffect(() => { probe.location = location })
  return null
}

function renderGallery(route = '/gallery', props = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Where />
      <Gallery artists={artists} setArtists={vi.fn()} ideas={[]} {...props} />
    </MemoryRouter>
  )
}
const pieces = () => screen.getAllByRole('button', { name: /^Open / }).filter((b) => b.closest('figure'))

describe('Artists page wall (#220)', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to the wall, with the switcher showing it first and pressed', () => {
    renderGallery()
    const [first] = screen.getAllByRole('button', { name: /view$|artists$/i })
    expect(first).toHaveAccessibleName('Wall view')
    expect(screen.getByRole('button', { name: 'Wall view' })).toHaveAttribute('aria-pressed', 'true')
    expect(pieces()).toHaveLength(2)
    expect(screen.getAllByRole('main')).toHaveLength(1)
  })

  it('other views are still one tap away', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Filmstrip view' }))
    expect(pieces()).toHaveLength(0)
  })

  it('a style filter narrows the wall', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'realism' }))
    expect(pieces()).toHaveLength(1)
    expect(pieces()[0]).toHaveAccessibleName('Open Carl')
  })

  it('?photo= opens the viewer on the wall', () => {
    renderGallery('/gallery?photo=carl.1')
    expect(screen.getByRole('heading', { name: 'Carl' })).toBeInTheDocument()
  })

  it('a Consider-shelf add opens the add-artist modal prefilled', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: /consider/i }))
    const shelf = screen.getByRole('region', { name: 'Artists to consider' })
    fireEvent.click(within(shelf).getAllByRole('button', { name: '+ Add' })[0])
    const dialog = screen.getByRole('dialog', { name: 'Add an artist' })
    expect(within(dialog).getByPlaceholderText(/handle or instagram url/i).value).not.toBe('')
  })

  it('?add=1 opens the add-artist modal, and closing strips the param', () => {
    renderGallery('/gallery?add=1&demo=1')
    expect(screen.getByRole('dialog', { name: 'Add an artist' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Add an artist' })).toBeNull()
    expect(probe.location.search).toBe('?demo=1')
  })
})
