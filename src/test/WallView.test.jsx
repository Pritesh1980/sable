import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import WallView from '../components/WallView'

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
      <WallView
        artists={baseArtists}
        setArtists={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  )
}

// The RankRail Top-5 dock also renders artist names + thumbnails above the
// masonry, so masonry-targeting queries scope to the masonry column container.
const main = () => within(document.querySelector('[class*="columns-"]'))

describe('WallView (#220)', () => {
  it('renders one piece per image across all artists', () => {
    renderWall()
    expect(main().getAllByRole('img')).toHaveLength(3)
  })

  // #161: a new artist is unranked, so their photos land at the foot of the wall.
  it('brings a just-added artist into view', () => {
    const original = Element.prototype.scrollIntoView
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    try {
      renderWall({ revealArtistId: baseArtists[baseArtists.length - 1].id })
      expect(scrollIntoView).toHaveBeenCalledTimes(1)
      expect(scrollIntoView.mock.instances[0].dataset.artistId).toBe(baseArtists[baseArtists.length - 1].id)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('says so when a style filter leaves nothing to show', () => {
    renderWall({ wallArtists: [] })
    expect(screen.getByText(/no artists match this filter/i)).toBeInTheDocument()
  })

  it('is not a landmark of its own: the Artists page owns <main>', () => {
    renderWall()
    expect(screen.queryByRole('main')).toBeNull()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('surfaces the Top-5 dock on the wall', () => {
    renderWall()
    expect(screen.getByRole('region', { name: /your top five/i })).toBeInTheDocument()
  })

  it('always shows the artist name; only the studio waits for hover', () => {
    renderWall()
    const caption = main().getByText('Carlos Valera').closest('figcaption')
    expect(caption.className).not.toMatch(/opacity-0/)
    const studio = within(caption).getByText('No Regrets London')
    expect(studio.className).toMatch(/can-hover:opacity-0/)
    expect(studio.className).toMatch(/group-hover:opacity-100/)
    expect(caption).not.toHaveTextContent('realism')
  })

  it('omits the studio line when the artist has none', () => {
    renderWall()
    const caption = screen.getAllByText('zoia.ink').find((el) => el.closest('figcaption')).closest('figcaption')
    expect(caption).not.toHaveTextContent('No Regrets')
  })

  it('shows a recent dot only for recent items', () => {
    renderWall()
    expect(screen.getAllByTitle('New since your last visit')).toHaveLength(1)
  })

  it('builds the masonry from wallArtists (the filtered list) while the rail keeps everyone', () => {
    renderWall({ wallArtists: [baseArtists[1]] })
    expect(main().getAllByRole('img')).toHaveLength(1)
    expect(main().queryByRole('button', { name: 'Open zoia.ink' })).toBeNull()
    expect(within(screen.getByRole('region', { name: /your top five/i })).getAllByRole('listitem')).toHaveLength(2)
  })

  it('opens the photo viewer on click', () => {
    renderWall()
    fireEvent.click(main().getByRole('button', { name: 'Open Carlos Valera' }))
    expect(screen.getByRole('heading', { name: 'Carlos Valera' })).toBeInTheDocument()
  })

  it('has no add-artist or demo chrome of its own', () => {
    renderWall()
    expect(screen.queryByRole('button', { name: /add artist/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /view the full demo/i })).toBeNull()
  })

  describe('drop-zone and paste wiring', () => {
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
