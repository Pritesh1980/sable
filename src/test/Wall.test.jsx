import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Wall from '../pages/Wall'

vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(async (files) => files.map((_, i) => `data:image/jpeg;base64,DROPPED${i}`)),
}))

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
        setArtists={vi.fn()}
        onOpenArtist={vi.fn()}
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
    const onOpenDrawer = vi.fn()
    const onSwitchView = vi.fn()
    renderWall({ onOpenDrawer, onSwitchView })

    expect(screen.getByText('Sable')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /⋯/ }))
    expect(onOpenDrawer).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /concepts/i }))
    expect(onSwitchView).toHaveBeenCalledWith('concepts')
  })

  it('opens the quick-add modal from the bar\'s + Add artist button', () => {
    renderWall()
    fireEvent.click(screen.getByRole('button', { name: /\+ add artist/i }))
    expect(screen.getByText('Add an artist')).toBeInTheDocument()
  })

  it('renders an empty state with an add-artist CTA that opens the quick-add modal', () => {
    renderWall({ artists: [] })
    expect(screen.queryAllByRole('img')).toHaveLength(0)
    const ctas = screen.getAllByRole('button', { name: /add artist/i })
    fireEvent.click(ctas[ctas.length - 1])
    expect(screen.getByText('Add an artist')).toBeInTheDocument()
  })

  describe('quick-add end to end', () => {
    beforeEach(() => vi.clearAllMocks())

    it('adds a new artist in exactly two clicks: + Add artist, then Save', async () => {
      const setArtists = vi.fn()
      renderWall({ setArtists })

      // Click 1
      fireEvent.click(screen.getByRole('button', { name: /\+ add artist/i }))
      fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), {
        target: { value: '@new_artist' },
      })
      // Click 2
      fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

      await waitFor(() => expect(setArtists).toHaveBeenCalled())
      const next = setArtists.mock.calls[0][0](baseArtists)
      expect(next.some((a) => a.handle === 'new_artist')).toBe(true)
    })
  })

  describe('drop-zone and paste wiring', () => {
    beforeEach(() => vi.clearAllMocks())

    it('dropping a file on a wall piece adds a stamped image to that artist', async () => {
      const setArtists = vi.fn()
      renderWall({ setArtists })
      const figure = screen.getAllByRole('img')[0].closest('figure')
      const file = new File(['x'], 'ref.jpg', { type: 'image/jpeg' })

      fireEvent.drop(figure, { dataTransfer: { files: [file] } })

      await waitFor(() => expect(setArtists).toHaveBeenCalled())
      const next = setArtists.mock.calls[0][0](baseArtists)
      const zoia = next.find((a) => a.id === 'zoia.ink')
      expect(zoia.images.at(-1)).toMatchObject({ url: 'data:image/jpeg;base64,DROPPED0' })
      expect(zoia.images.at(-1).addedAt).toBeTruthy()
    })
  })
})
