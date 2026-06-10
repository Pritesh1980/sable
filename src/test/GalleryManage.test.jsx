import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Gallery from '../pages/Gallery'

const baseArtists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['surrealism'], images: [], rank: 1, status: 'contact-next', notes: '', studio: null },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', tags: ['fine-line'], images: [], rank: 2, status: 'shortlisted', notes: '', studio: null },
]

function renderGallery({ artists = baseArtists, setArtists = vi.fn(), route = '/gallery' } = {}) {
  render(
    <MemoryRouter initialEntries={[route]}>
      <Gallery artists={artists} setArtists={setArtists} />
    </MemoryRouter>
  )
  return { setArtists }
}

describe('Gallery manage mode', () => {
  beforeEach(() => localStorage.clear())

  it('shows a Manage button even when there are no artists', () => {
    renderGallery({ artists: [] })
    expect(screen.getByRole('button', { name: /manage/i })).toBeInTheDocument()
  })

  it('toggles the add-artist form and maintenance table', () => {
    renderGallery()
    expect(screen.queryByText('Add New Artist')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /manage/i }))
    expect(screen.getByText('Add New Artist')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search artists…')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^manage$/i }))
    expect(screen.queryByText('Add New Artist')).not.toBeInTheDocument()
  })

  it('adds an artist with the next rank via the form', () => {
    const { setArtists } = renderGallery()
    fireEvent.click(screen.getByRole('button', { name: /manage/i }))

    fireEvent.change(screen.getByPlaceholderText('@handle'), { target: { value: 'new_artist' } })
    fireEvent.click(screen.getByRole('button', { name: /add artist/i }))

    expect(setArtists).toHaveBeenCalledTimes(1)
    const updater = setArtists.mock.calls[0][0]
    const next = updater(baseArtists)
    expect(next).toHaveLength(3)
    expect(next[2]).toMatchObject({ id: 'new_artist', rank: 3, status: 'researching' })
  })

  it('opens manage mode from a ?mode=manage deep link', () => {
    renderGallery({ route: '/gallery?mode=manage' })
    expect(screen.getByText('Add New Artist')).toBeInTheDocument()
  })
})
