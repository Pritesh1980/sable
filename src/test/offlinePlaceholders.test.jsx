import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { buildConceptWallItems, isDraftConcept } from '../data/concepts'
import { clearBlobUrls, registerBlobUrl } from '../data/blobUrls'
import { backend } from '../backend'
import ArtistDetail from '../components/ArtistDetail'
import ConceptPiece from '../components/ConceptPiece'
import ConceptVariantLab from '../components/ConceptVariantLab'

// #102. A photo whose bytes can't be fetched right now (offline, with a network
// backend) is kept in the data since #101, but was simply missing from the
// screen. It now shows as a placeholder tile in its place. Since #116 the
// artist's images hold the stored refs, and each tile (PhotoTile) resolves its
// own: unavailable → the placeholder, still loading → an empty busy box.

const KEY = 'user/u1/artists/zoia/own.jpg'
const offlineTiles = () => screen.queryAllByRole('img', { name: /available when online/i })
const noop = () => {}

describe('ArtistDetail offline photos', () => {
  const artist = {
    id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: [], rank: 1, studio: null,
    status: 'researching', notes: '',
    images: ['a.jpg', { key: KEY }],
  }
  const offline = () => vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
  const stillLoading = () => vi.spyOn(backend.blobs, 'getUrl').mockReturnValue(new Promise(() => {}))
  // The carousel's tiles, in order: what each one is.
  const tileKinds = () => {
    const carousel = document.querySelector('.snap-x')
    return [...carousel.children].map((tile) => {
      if (tile.querySelector('[aria-label="Photo available when online"]')) return 'offline'
      if (tile.getAttribute('aria-busy') === 'true') return 'loading'
      return tile.querySelector('img')?.getAttribute('src') || 'monogram'
    })
  }
  function lastSave(onSave, current) {
    return onSave.mock.calls.at(-1)[2](current)
  }

  beforeEach(() => {
    clearBlobUrls()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows a placeholder tile for a photo that cannot load, in its place, and counts it', async () => {
    offline()
    render(<ArtistDetail artist={artist} onClose={noop} onSave={noop} />)
    await waitFor(() => expect(offlineTiles()).toHaveLength(1))
    expect(tileKinds()).toEqual(['/a.jpg', 'offline'])
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })

  // The sheet's photo list is a snapshot taken on open (#79); placeholders are
  // part of it, so a prop change does not drop them.
  it('keeps its placeholders in step with its photo snapshot when the prop changes', async () => {
    offline()
    const { rerender } = render(<ArtistDetail artist={artist} onClose={noop} onSave={noop} />)
    await waitFor(() => expect(offlineTiles()).toHaveLength(1))
    rerender(<ArtistDetail artist={{ ...artist, images: ['a.jpg'] }} onClose={noop} onSave={noop} />)
    expect(offlineTiles()).toHaveLength(1)
  })

  it('shows no placeholder when every photo loaded', () => {
    registerBlobUrl(KEY, 'data:image/png;base64,T1dO')
    render(<ArtistDetail artist={artist} onClose={noop} onSave={noop} />)
    expect(offlineTiles()).toHaveLength(0)
    expect(tileKinds()).toEqual(['/a.jpg', 'data:image/png;base64,T1dO'])
  })

  it('shows a photo that is still loading as an empty busy box, never as unavailable', () => {
    stillLoading()
    render(<ArtistDetail artist={artist} onClose={noop} onSave={noop} />)
    expect(offlineTiles()).toHaveLength(0)
    expect(tileKinds()).toEqual(['/a.jpg', 'loading'])
  })

  // Remove and set cover act on the whole sequence, placeholders included, so
  // an offline photo keeps its place relative to its neighbours (codex/agy).
  const aub = { ...artist, images: ['a.jpg', { key: KEY }, 'b.jpg'] }

  it('removing a photo before a placeholder moves the placeholder up with it', async () => {
    offline()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn()
    render(<ArtistDetail artist={aub} onClose={noop} onSave={onSave} />)
    await waitFor(() => expect(offlineTiles()).toHaveLength(1))
    fireEvent.click(screen.getAllByTitle('Remove photo')[0])
    const saved = lastSave(onSave, { ...aub })
    expect(saved.images).toEqual([{ key: KEY }, 'b.jpg'])
    await waitFor(() => expect(offlineTiles()).toHaveLength(1))
    expect(tileKinds()).toEqual(['offline', '/b.jpg'])
  })

  it('setting a cover keeps the placeholder after the photo it followed', async () => {
    offline()
    const onSave = vi.fn()
    render(<ArtistDetail artist={aub} onClose={noop} onSave={onSave} />)
    await waitFor(() => expect(offlineTiles()).toHaveLength(1))
    fireEvent.click(screen.getByText('Set cover'))
    const saved = lastSave(onSave, { ...aub })
    expect(saved.images).toEqual(['b.jpg', 'a.jpg', { key: KEY }])
  })

  it('can replace a cover that is itself offline', async () => {
    offline()
    const onSave = vi.fn()
    const coverOffline = { ...aub, images: [{ key: KEY }, 'a.jpg', 'b.jpg'] }
    render(<ArtistDetail artist={coverOffline} onClose={noop} onSave={onSave} />)
    await waitFor(() => expect(offlineTiles()).toHaveLength(1))
    fireEvent.click(screen.getAllByText('Set cover')[1])
    const saved = lastSave(onSave, { ...coverOffline })
    expect(saved.images).toEqual(['b.jpg', { key: KEY }, 'a.jpg'])
  })

  it('keeps a photo that is still loading in its place through an edit', () => {
    stillLoading()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn()
    const loading = { ...artist, images: [{ key: KEY }, 'a.jpg', 'b.jpg'] }
    render(<ArtistDetail artist={loading} onClose={noop} onSave={onSave} />)
    fireEvent.click(screen.getAllByTitle('Remove photo')[0])
    const saved = lastSave(onSave, { ...loading })
    expect(saved.images).toEqual([{ key: KEY }, 'b.jpg'])
  })
})

describe('concepts whose image cannot load', () => {
  // Concept state holds the stored key (#117); "offline" is what rendering it finds.
  const offline = { id: 'c1', prompt: 'Moth', imageUrl: 'user/u1/concepts/c1.png' }
  const waiting = { id: 'c2', prompt: 'Raven', imageUrl: '' }

  beforeEach(() => {
    clearBlobUrls()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
  })
  afterEach(() => vi.restoreAllMocks())

  it('stay on the wall, carrying their stored key', () => {
    const items = buildConceptWallItems([offline, waiting], [])
    expect(items.map((i) => [i.id, i.imageUrl])).toEqual([['c1', 'user/u1/concepts/c1.png']])
  })

  it('are not drafts; a concept that never had an image is', () => {
    expect(isDraftConcept(offline)).toBe(false)
    expect(isDraftConcept(waiting)).toBe(true)
  })

  it('render a placeholder that does not open the viewer', async () => {
    const onOpen = vi.fn()
    const [item] = buildConceptWallItems([offline], [])
    render(<ConceptPiece item={item} onOpen={onOpen} />)
    await waitFor(() => expect(offlineTiles()).toHaveLength(1))
    const tile = offlineTiles()[0]
    fireEvent.click(tile)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a variant says its image is offline rather than missing', async () => {
    const concept = {
      id: 'c1', prompt: 'Moth', variants: [
        { id: 'v1', provider: 'gemini', imageUrl: 'user/u1/concepts/v1.png', createdAt: '2026-09-01T00:00:00.000Z' },
      ],
    }
    render(<ConceptVariantLab concept={concept} onAddVariant={noop} onMarkBest={noop} onDeleteVariant={noop} onRateVariant={noop} />)
    await waitFor(() => expect(offlineTiles().length).toBeGreaterThan(0))
    expect(screen.queryByText(/no image/i)).toBeNull()
  })
})
