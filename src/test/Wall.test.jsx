import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
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
    studio: 'no-regrets-london',
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

// The RankRail Top-5 dock also renders artist names + thumbnails above the
// masonry, so masonry-targeting queries scope to <main> to stay unambiguous.
const main = () => within(screen.getByRole('main'))

describe('Wall page', () => {
  it('renders one piece per image across all artists', () => {
    renderWall()
    expect(main().getAllByRole('img')).toHaveLength(3)
  })

  it('surfaces the Top-5 dock on the wall', () => {
    renderWall()
    expect(screen.getByRole('region', { name: /your top five/i })).toBeInTheDocument()
  })

  it('captions with a prominent artist name and their studio — no style tags', () => {
    renderWall()
    const caption = main().getByText('Carlos Valera').closest('figcaption')
    expect(caption).toHaveTextContent('No Regrets London')
    expect(caption).not.toHaveTextContent('realism')
    expect(caption.className).toMatch(/opacity-0/)
    expect(caption.className).toMatch(/group-hover:opacity-100/)
  })

  it('omits the studio line when the artist has none', () => {
    renderWall()
    const caption = screen.getAllByText('zoia.ink').find((el) => el.closest('figcaption')).closest('figcaption')
    expect(caption).not.toHaveTextContent('No Regrets')
  })

  it('shows a recent dot only for recent items', () => {
    renderWall()
    const dots = screen.getAllByTitle('New since your last visit')
    expect(dots).toHaveLength(1)
  })

  it('calls onOpen with the right item when a piece is clicked', () => {
    const onOpenArtist = vi.fn()
    renderWall({ onOpenArtist })
    fireEvent.click(main().getByText('Carlos Valera').closest('figure'))
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
    expect(screen.queryByRole('region', { name: /your top five/i })).toBeNull()
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
      const figure = main().getAllByRole('img')[0].closest('figure')
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
