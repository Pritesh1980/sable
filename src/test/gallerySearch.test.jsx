import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import Gallery from '../pages/Gallery'

// The sheet itself is tested in PhotoSearch.test.jsx; here only how the
// Artists page opens it and acts on a picked photo.
vi.mock('../components/PhotoSearch', () => ({
  default: ({ artists, query, onQueryChange, onOpenItem, onClose }) => (
    <div data-testid="photo-search" data-count={artists.length} data-query={query}>
      <button type="button" onClick={() => onQueryChange('skull')}>search skull</button>
      <button type="button" onClick={() => onOpenItem({ artistId: 'oscarakermo', imageIndex: 1, image: '/o2.jpg' })}>pick photo</button>
      <button type="button" onClick={onClose}>close search</button>
    </div>
  ),
}))

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['surrealism'], images: ['/z.jpg'], rank: 1, notes: '', studio: null },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', tags: ['fine-line'], images: ['/o.jpg', '/o2.jpg'], rank: 2, notes: '', studio: null },
]

function Where() {
  return <p data-testid="where">{useLocation().search}</p>
}

function Back() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(-1)}>browser back</button>
}

function renderGallery(entry = '/gallery') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Gallery artists={artists} setArtists={vi.fn()} />
      <Where />
      <Back />
    </MemoryRouter>
  )
}

const where = () => screen.getByTestId('where').textContent

function openSearch() {
  fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Search' }))
}

describe('Artists page: search by words', () => {
  beforeEach(() => localStorage.clear())

  it('opens Search from Tools, with the whole library to search', () => {
    renderGallery()
    openSearch()
    expect(screen.getByTestId('photo-search')).toHaveAttribute('data-count', '2')
    expect(where()).toBe('?search=')
  })

  it('keeps the phrase in the address, and Back closes the sheet', () => {
    renderGallery()
    openSearch()
    fireEvent.click(screen.getByRole('button', { name: 'search skull' }))
    expect(where()).toBe('?search=skull')
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    expect(screen.queryByTestId('photo-search')).not.toBeInTheDocument()
  })

  it('reopens with the phrase from a link', () => {
    renderGallery('/gallery?search=raven')
    expect(screen.getByTestId('photo-search')).toHaveAttribute('data-query', 'raven')
  })

  it('opens a picked photo in the Wall viewer, over the results', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Filmstrip view' }))
    openSearch()
    fireEvent.click(screen.getByRole('button', { name: 'search skull' }))
    fireEvent.click(screen.getByRole('button', { name: 'pick photo' }))
    expect(where()).toBe('?search=skull&photo=oscarakermo.2')
    expect(screen.getByRole('button', { name: 'Wall view' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('photo-search')).toBeInTheDocument()
    // The topmost modal is the last in the page (isTopmostDialog), so the
    // sheet must come before the viewer that covers it, or Escape on the
    // photo closes the search underneath instead.
    const viewer = screen.getByRole('dialog', { name: /— image/ })
    expect(screen.getByTestId('photo-search').compareDocumentPosition(viewer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // Back from the photo lands on the results, not the wall.
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    expect(where()).toBe('?search=skull')
    expect(screen.getByTestId('photo-search')).toBeInTheDocument()
  })

  it('clears a style filter that would hide the picked photo', () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
    fireEvent.click(screen.getByRole('button', { name: 'surrealism' }))
    expect(screen.getByRole('button', { name: 'Clear filter: surrealism' })).toBeInTheDocument()
    openSearch()
    fireEvent.click(screen.getByRole('button', { name: 'pick photo' }))
    expect(screen.queryByRole('button', { name: 'Clear filter: surrealism' })).not.toBeInTheDocument()
  })

  it('is not offered when there are no photos to search', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={[{ ...artists[0], images: [] }]} setArtists={vi.fn()} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Tools' }))
    expect(screen.queryByRole('menuitem', { name: 'Search' })).not.toBeInTheDocument()
  })
})
