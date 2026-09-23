import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Gallery from '../pages/Gallery'

vi.mock('../components/TasteMap', () => ({
  default: ({ artists, onOpenArtist, onClose }) => (
    <div data-testid="taste-map" data-count={artists.length}>
      <button type="button" onClick={() => onOpenArtist(artists[1])}>open second</button>
      <button type="button" onClick={onClose}>close map</button>
    </div>
  ),
}))

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['surrealism'], images: ['/z.jpg'], rank: 1, status: 'contact-next', notes: '', studio: null },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', tags: ['fine-line'], images: ['/o.jpg'], rank: 2, status: 'shortlisted', notes: '', studio: null },
]

describe('Artists page: taste map', () => {
  beforeEach(() => localStorage.clear())

  it('opens the map from the header; picking an artist closes it and opens their detail', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={artists} setArtists={vi.fn()} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByTestId('taste-map')).toHaveAttribute('data-count', '2')

    fireEvent.click(screen.getByRole('button', { name: 'open second' }))
    expect(screen.queryByTestId('taste-map')).not.toBeInTheDocument()
    // The artist detail sheet (same locator the existing detail tests use).
    const detail = document.querySelector('.fixed.inset-0.z-50')
    expect(detail).not.toBeNull()
    expect(within(detail).getAllByText('Oscar Akermo').length).toBeGreaterThan(0)
  })
})
