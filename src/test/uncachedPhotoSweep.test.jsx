import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// Consumer sweep (#116, D6). Artist state holds stored *refs*, so every surface
// that lists photos can meet a `{ key }` whose bytes are not cached (yet). Each
// case gives a surface an artist whose ONLY photo is such a key — offline, so
// the key never resolves — beside an artist with no photos, and pins that the
// surface (a) renders, (b) shows the monogram rather than a broken <img>, and
// (c) counts the offline photo (D6) while still excluding the photo-less artist.

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))
const loadVectors = vi.fn()
vi.mock('../data/styleIndex', () => ({
  loadVectors: (...args) => loadVectors(...args),
  buildStyleIndex: vi.fn(async () => new Map()),
}))

const { clearBlobUrls } = await import('../data/blobUrls')
const { UndoProvider } = await import('../context/UndoContext')
const { default: ArtistCard } = await import('../components/ArtistCard')
const { default: ArtistBrowse } = await import('../components/ArtistBrowse')
const { default: ArtistTable } = await import('../components/ArtistTable')
const { default: CompareView } = await import('../components/CompareView')
const { default: FilmstripView } = await import('../components/FilmstripView')
const { default: RankingMode } = await import('../components/RankingMode')
const { default: StyleWall } = await import('../components/StyleWall')
const { default: Top5Hero } = await import('../components/Top5Hero')
const { default: TasteMap } = await import('../components/TasteMap')
const { default: SimilarArtists } = await import('../components/SimilarArtists')
const { default: WallPiece } = await import('../components/WallPiece')
const { default: WallViewer } = await import('../components/WallViewer')
const { default: Wall } = await import('../pages/Wall')
const { default: Gallery } = await import('../pages/Gallery')
const { default: Dashboard } = await import('../pages/Dashboard')
const { buildWallItems } = await import('../data/wall')

const REF = { key: 'user/u1/artists/zoia/1.jpg' }
const OFFLINE = {
  id: 'zoia', handle: 'zoia.ink', name: 'Zoia', rank: 1, status: 'contact-next',
  tags: ['surrealism'], images: [REF], notes: '', studio: null,
}
const NONE = {
  id: 'bare', handle: 'bare.ink', name: 'Bare', rank: 2, status: 'shortlisted',
  tags: ['blackwork'], images: [], notes: '', studio: null,
}

beforeEach(() => {
  clearBlobUrls()
  localStorage.clear()
  getUrl.mockReset().mockRejectedValue(new Error('offline'))
  loadVectors.mockReset().mockResolvedValue(new Map())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// The unavailable photo settles to the monogram: a labelled box holding the
// artist's initial, and never an <img> with a dead src.
const settledMonogram = async (scope, label = 'Zoia') => {
  await waitFor(() => expect(getUrl).toHaveBeenCalled())
  expect(await within(scope).findAllByText('Z')).not.toHaveLength(0)
  expect(within(scope).queryByRole('img')).not.toBeInTheDocument()
  expect(within(scope).getAllByLabelText(label).length).toBeGreaterThan(0)
}

describe('uncached { key } photo across artist-photo surfaces (D6)', () => {
  it('ArtistCard: counts as having photos (no empty state) and shows the monogram', async () => {
    const { container } = render(<ArtistCard artist={OFFLINE} onOpen={vi.fn()} onSaveImages={vi.fn()} />)
    expect(screen.queryByText(/no photos|add photo/i)).not.toBeInTheDocument()
    await settledMonogram(container)
  })

  it('ArtistBrowse: the offline-photo artist is in the browse set, the photo-less one is not', async () => {
    const { container } = render(<ArtistBrowse artists={[NONE, OFFLINE]} onClose={vi.fn()} />)
    expect(screen.getAllByText('1 / 1').length).toBeGreaterThan(0)
    await settledMonogram(container)
  })

  it('ArtistTable: lists the photo, counts it, and undoing its removal restores the same ref', async () => {
    const seen = { images: [REF, { key: 'user/u1/artists/zoia/2.jpg' }] }
    function Harness() {
      const [artist, setArtist] = useState({ ...OFFLINE, images: seen.images })
      seen.latest = artist.images
      return (
        <UndoProvider undoWindowMs={5000}>
          <table><tbody>
            <ArtistTable
              artists={[artist]}
              onSaveImages={(id, updater) => setArtist((a) => ({
                ...a, images: typeof updater === 'function' ? updater(a.images) : updater,
              }))}
              onUpdate={vi.fn()}
              onRemove={vi.fn()}
            />
          </tbody></table>
        </UndoProvider>
      )
    }
    const { container } = render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))
    expect(screen.getByText(/Photos \(2\)/)).toBeInTheDocument()
    await settledMonogram(container)

    fireEvent.click(screen.getAllByLabelText('Remove photo')[0])
    expect(seen.latest).toEqual([{ key: 'user/u1/artists/zoia/2.jpg' }])
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))
    expect(seen.latest).toEqual([REF, { key: 'user/u1/artists/zoia/2.jpg' }])
  })

  it('CompareView: the picker thumbnail and the column both cope with the offline photo', async () => {
    const { container } = render(<CompareView artists={[OFFLINE, NONE]} onOpenArtist={vi.fn()} />)
    await settledMonogram(container)
    fireEvent.click(screen.getByText('Zoia'))
    expect(screen.queryByText('No images')).not.toBeInTheDocument()
  })

  it('FilmstripView: the row has a photo strip (not "No images yet") holding the monogram', async () => {
    const { container } = render(
      <FilmstripView artists={[OFFLINE, NONE]} onOpenArtist={vi.fn()} onSetRank={vi.fn()} onSetStatus={vi.fn()} />,
    )
    await settledMonogram(container)
    expect(screen.getAllByText('No images yet')).toHaveLength(1) // only the photo-less artist
  })

  it('RankingMode: the offline-photo artist is queued, the photo-less one is not', async () => {
    const { container } = render(<RankingMode artists={[NONE, OFFLINE]} onClose={vi.fn()} onApplyRanking={vi.fn()} />)
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Zoia' })).toBeInTheDocument()
    await settledMonogram(container)
  })

  it('StyleWall: gives the offline photo a tile instead of the empty state', async () => {
    const { container } = render(<StyleWall artists={[OFFLINE, NONE]} onOpenArtist={vi.fn()} />)
    expect(screen.queryByText(/No images yet/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Open Zoia' })).toHaveLength(1)
    await settledMonogram(container)
  })

  it('Gallery: "N with photos" counts the offline photo and not the photo-less artist', () => {
    render(
      <MemoryRouter initialEntries={['/gallery?mode=manage']}>
        <Gallery artists={[OFFLINE, NONE]} setArtists={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/2 artists · 1 with photos/)).toBeInTheDocument()
  })

  it('Gallery: the Rank queue includes the offline-photo artist', async () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={[OFFLINE, NONE]} setArtists={vi.fn()} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rank' }))
    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
  })

  it('Dashboard: the stage card shows the monogram for the offline cover photo', async () => {
    const { container } = render(
      <MemoryRouter><Dashboard artists={[OFFLINE, NONE]} ideas={[]} boards={[]} /></MemoryRouter>,
    )
    await waitFor(() => expect(getUrl).toHaveBeenCalled())
    expect(within(container).queryByRole('img')).not.toBeInTheDocument()
    expect(within(container).getAllByText('Z').length).toBeGreaterThan(0)
  })

  it('Wall page: the offline photo is a piece of the masonry', async () => {
    const { container } = render(
      <MemoryRouter>
        <Wall
          artists={[OFFLINE, NONE]} setArtists={vi.fn()} onOpenArtist={vi.fn()}
          onOpenDrawer={vi.fn()} onSwitchView={vi.fn()} activeView="artists"
        />
      </MemoryRouter>,
    )
    const main = within(container.querySelector('main'))
    await waitFor(() => expect(getUrl).toHaveBeenCalled())
    expect(main.getAllByText('Z').length).toBeGreaterThan(0)
    expect(main.queryByRole('img')).not.toBeInTheDocument()
  })

  it('WallPiece: renders the offline photo as a monogram box', async () => {
    const [item] = buildWallItems([OFFLINE])
    expect(item.image).toEqual(REF) // the ref travels intact, unresolved
    const { container } = render(<WallPiece item={item} onOpen={vi.fn()} />)
    await settledMonogram(container)
  })

  it('WallViewer: opens on the offline photo and its thumbnail without throwing', async () => {
    const items = buildWallItems([OFFLINE])
    render(
      <WallViewer items={items} initialIndex={0} artists={[OFFLINE]} ideas={[]} onClose={vi.fn()} onGenerate={vi.fn()} />,
    )
    await waitFor(() => expect(getUrl).toHaveBeenCalled())
    expect(await screen.findAllByText('Z')).not.toHaveLength(0)
    expect(screen.queryByRole('img', { name: /Zoia/ })).not.toBeInTheDocument()
  })

  it('Top5Hero: the cover tile for the offline photo shows the monogram', async () => {
    const { container } = render(
      <MemoryRouter><Top5Hero artists={[OFFLINE]} bench={[NONE]} /></MemoryRouter>,
    )
    await waitFor(() => expect(getUrl).toHaveBeenCalled())
    expect(within(container).queryByRole('img')).not.toBeInTheDocument()
  })

  it('TasteMap: an artist whose only photo is uncached is not placed (no vector) while an indexed one is', async () => {
    const indexed = { ...NONE, id: 'indexed', handle: 'ink.i', name: 'Indexed', images: ['/i1.jpg'] }
    const also = { ...NONE, id: 'also', handle: 'ink.j', name: 'Also', images: ['/j1.jpg'] }
    loadVectors.mockResolvedValue(new Map([['/i1.jpg', [1, 0]], ['/j1.jpg', [0, 1]]]))
    render(<TasteMap artists={[OFFLINE, indexed, also]} onOpenArtist={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /Indexed/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Zoia/ })).not.toBeInTheDocument()
    expect(screen.getByText(/1 artist not shown/)).toBeInTheDocument()
  })

  it('SimilarArtists: an uncached-only artist as subject or as candidate does not crash and offers the index build', async () => {
    const other = { ...OFFLINE, id: 'other', handle: 'other.ink', name: 'Other' }
    render(<SimilarArtists artists={[OFFLINE, other]} artist={OFFLINE} />)
    expect(await screen.findByRole('button', { name: /build style index/i })).toBeInTheDocument()
  })
})
