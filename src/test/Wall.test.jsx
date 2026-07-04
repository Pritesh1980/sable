import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Wall from '../pages/Wall'

const baseArtists = [
  {
    id: 'zoia.ink',
    handle: 'zoia.ink',
    name: '',
    tags: ['dark-illustrative', 'surrealism'],
    images: ['/images/artists/zoia.ink/1.jpg', '/images/artists/zoia.ink/2.jpg'],
  },
  {
    id: 'carlosvalera',
    handle: 'carl245tattoo',
    name: 'Carlos Valera',
    tags: ['realism'],
    images: [{ key: 'blob-key', url: '/images/artists/carlosvalera/1.jpg', addedAt: new Date().toISOString() }],
  },
]

function renderWall(props = {}, { initialEntries = ['/'] } = {}) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Wall
        artists={baseArtists}
        onOpenArtist={vi.fn()}
        onAddArtist={vi.fn()}
        onOpenDrawer={vi.fn()}
        onSwitchView={vi.fn()}
        activeView="artists"
        {...props}
      />
    </MemoryRouter>
  )
}

describe('Wall page', () => {
  it('renders one piece per image across all artists', () => {
    renderWall()
    expect(screen.getAllByRole('img')).toHaveLength(3)
  })

  it('renders the artist name and style tags as caption text, hidden until hover', () => {
    renderWall()
    const caption = screen.getByText('Carlos Valera').closest('figcaption')
    expect(caption).toHaveTextContent('realism')
    expect(caption.className).toMatch(/opacity-0/)
    expect(caption.className).toMatch(/group-hover:opacity-100/)
  })

  it('shows a recent dot only for recent items', () => {
    renderWall()
    const dots = screen.getAllByTitle('New since your last visit')
    expect(dots).toHaveLength(1)
  })

  it('calls onOpen with the right item when a piece is clicked', () => {
    const onOpenArtist = vi.fn()
    renderWall({ onOpenArtist })
    fireEvent.click(screen.getByText('Carlos Valera').closest('figure'))
    expect(onOpenArtist).toHaveBeenCalledTimes(1)
    expect(onOpenArtist.mock.calls[0][0]).toMatchObject({ artistId: 'carlosvalera' })
  })

  it('renders the hairline bar with wordmark, view switch, add-artist and drawer controls', () => {
    const onAddArtist = vi.fn()
    const onOpenDrawer = vi.fn()
    const onSwitchView = vi.fn()
    renderWall({ onAddArtist, onOpenDrawer, onSwitchView })

    expect(screen.getByText('Sable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /\+ add artist/i }))
    expect(onAddArtist).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /⋯/ }))
    expect(onOpenDrawer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /concepts/i }))
    expect(onSwitchView).toHaveBeenCalledWith('concepts')
  })

  it('renders an empty state with an add-artist CTA when there are no artists', () => {
    const onAddArtist = vi.fn()
    renderWall({ artists: [], onAddArtist })
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    const ctas = screen.getAllByRole('button', { name: /add artist/i })
    fireEvent.click(ctas[ctas.length - 1])
    expect(onAddArtist).toHaveBeenCalled()
  })
})
