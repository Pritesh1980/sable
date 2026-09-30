import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { photoSlots, fromSlots } from '../data/offlineImages'
import { buildConceptWallItems, isDraftConcept } from '../data/concepts'
import ArtistDetail from '../components/ArtistDetail'
import ConceptPiece from '../components/ConceptPiece'
import ConceptVariantLab from '../components/ConceptVariantLab'

// #102. A photo whose bytes can't be fetched right now (offline, with a network
// backend) is kept in the data since #101, but was simply missing from the
// screen. It now shows as a placeholder tile in its place.

const KEY = 'user/u1/artists/zoia/own.jpg'
const offlineTiles = () => screen.queryAllByRole('img', { name: /available when online/i })
const noop = () => {}

describe('photoSlots', () => {
  it('is every displayed image, in order, when nothing is unresolved', () => {
    expect(photoSlots(['a.jpg', 'b.jpg'])).toEqual([
      { kind: 'image', src: 'a.jpg', imageIndex: 0 },
      { kind: 'image', src: 'b.jpg', imageIndex: 1 },
    ])
  })

  it('puts each unresolved photo back at its original position', () => {
    const slots = photoSlots(['a.jpg', 'b.jpg'], [
      { ref: { key: 'k2' }, index: 2 },
      { ref: { key: 'k0' }, index: 0 },
    ])
    expect(slots.map((s) => s.kind === 'image' ? s.src : 'offline')).toEqual(['offline', 'a.jpg', 'offline', 'b.jpg'])
    expect(slots[3].imageIndex).toBe(1)
  })

  it('appends a position past the end rather than dropping it', () => {
    const slots = photoSlots(['a.jpg'], [{ ref: { key: 'k' }, index: 9 }])
    expect(slots.map((s) => s.kind)).toEqual(['image', 'offline'])
  })

  it('round-trips: slots back to the displayed list plus offline positions', () => {
    const unresolved = [{ ref: { key: 'k0' }, index: 0 }, { ref: { key: 'k2' }, index: 2 }]
    expect(fromSlots(photoSlots(['a.jpg', 'b.jpg'], unresolved))).toEqual({ images: ['a.jpg', 'b.jpg'], unresolvedImages: unresolved })
  })

  it('ignores refs that are only waiting for first hydration', () => {
    expect(photoSlots([], [{ ref: { key: 'k' }, index: 0, pending: true }])).toEqual([])
  })
})

describe('ArtistDetail offline photos', () => {
  const artist = {
    id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: [], rank: 1, studio: null,
    status: 'researching', notes: '',
    images: ['a.jpg'],
    unresolvedImages: [{ ref: { key: KEY }, index: 1 }],
  }

  it('shows a placeholder tile for a photo that cannot load, and counts it', () => {
    render(<ArtistDetail artist={artist} onClose={noop} onSave={noop} />)
    expect(offlineTiles()).toHaveLength(1)
    expect(screen.getByText('1 / 2')).toBeTruthy()
  })

  // The sheet's photo list is a snapshot taken on open (#79); placeholders are
  // positioned against it, so they must come from the same snapshot.
  it('keeps its placeholders in step with its photo snapshot when the prop changes', () => {
    const { rerender } = render(<ArtistDetail artist={artist} onClose={noop} onSave={noop} />)
    rerender(<ArtistDetail artist={{ ...artist, unresolvedImages: undefined }} onClose={noop} onSave={noop} />)
    expect(offlineTiles()).toHaveLength(1)
  })

  it('shows no placeholder when every photo loaded', () => {
    render(<ArtistDetail artist={{ ...artist, unresolvedImages: undefined }} onClose={noop} onSave={noop} />)
    expect(offlineTiles()).toHaveLength(0)
  })

  // Remove and set cover act on the whole sequence, placeholders included, so
  // an offline photo keeps its place relative to its neighbours (codex/agy).
  const U = { ref: { key: KEY }, index: 1 }
  const aub = { ...artist, images: ['a.jpg', 'b.jpg'], unresolvedImages: [U] }
  function lastSave(onSave, current) {
    return onSave.mock.calls.at(-1)[2](current)
  }

  it('removing a photo before a placeholder moves the placeholder up with it', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn()
    render(<ArtistDetail artist={aub} onClose={noop} onSave={onSave} />)
    fireEvent.click(screen.getAllByTitle('Remove photo')[0])
    const saved = lastSave(onSave, { ...aub })
    expect(saved.images).toEqual(['b.jpg'])
    expect(saved.unresolvedImages).toEqual([{ ref: { key: KEY }, index: 0 }])
    expect(offlineTiles()).toHaveLength(1)
    vi.restoreAllMocks()
  })

  it('setting a cover keeps the placeholder after the photo it followed', () => {
    const onSave = vi.fn()
    render(<ArtistDetail artist={aub} onClose={noop} onSave={onSave} />)
    fireEvent.click(screen.getByText('Set cover'))
    const saved = lastSave(onSave, { ...aub })
    expect(saved.images).toEqual(['b.jpg', 'a.jpg'])
    expect(saved.unresolvedImages).toEqual([{ ref: { key: KEY }, index: 2 }])
  })

  it('can replace a cover that is itself offline', () => {
    const onSave = vi.fn()
    const coverOffline = { ...aub, unresolvedImages: [{ ref: { key: KEY }, index: 0 }] }
    render(<ArtistDetail artist={coverOffline} onClose={noop} onSave={onSave} />)
    fireEvent.click(screen.getAllByText('Set cover')[1])
    const saved = lastSave(onSave, { ...coverOffline })
    expect(saved.images).toEqual(['b.jpg', 'a.jpg'])
    expect(saved.unresolvedImages).toEqual([{ ref: { key: KEY }, index: 1 }])
  })

  it('leaves photos that are still loading alone', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const onSave = vi.fn()
    const pending = [{ ref: { key: KEY }, index: 0, pending: true }]
    const loading = { ...artist, images: ['a.jpg', 'b.jpg'], unresolvedImages: pending }
    render(<ArtistDetail artist={loading} onClose={noop} onSave={onSave} />)
    fireEvent.click(screen.getAllByTitle('Remove photo')[0])
    const saved = lastSave(onSave, { ...loading })
    expect(saved.images).toEqual(['b.jpg'])
    expect(saved.unresolvedImages).toBe(pending)
    vi.restoreAllMocks()
  })
})

describe('concepts whose image cannot load', () => {
  const offline = { id: 'c1', prompt: 'Moth', imageUrl: '', unresolvedImageKey: 'user/u1/concepts/c1.png' }
  const waiting = { id: 'c2', prompt: 'Raven', imageUrl: '' }

  it('stay on the wall as offline pieces', () => {
    const items = buildConceptWallItems([offline, waiting], [])
    expect(items.map((i) => [i.id, i.offline])).toEqual([['c1', true]])
  })

  it('are not drafts; a concept that never had an image is', () => {
    expect(isDraftConcept(offline)).toBe(false)
    expect(isDraftConcept(waiting)).toBe(true)
  })

  it('render a placeholder that does not open the viewer', () => {
    const onOpen = vi.fn()
    const [item] = buildConceptWallItems([offline], [])
    render(<ConceptPiece item={item} onOpen={onOpen} />)
    const tile = offlineTiles()[0]
    expect(tile).toBeTruthy()
    fireEvent.click(tile)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('a variant says its image is offline rather than missing', () => {
    const concept = {
      id: 'c1', prompt: 'Moth', variants: [
        { id: 'v1', provider: 'gemini', imageUrl: '', unresolvedImageKey: 'user/u1/concepts/v1.png', createdAt: '2026-09-01T00:00:00.000Z' },
      ],
    }
    render(<ConceptVariantLab concept={concept} onAddVariant={noop} onMarkBest={noop} onDeleteVariant={noop} onRateVariant={noop} />)
    expect(screen.queryByText(/no image/i)).toBeNull()
    expect(offlineTiles().length).toBeGreaterThan(0)
  })
})
