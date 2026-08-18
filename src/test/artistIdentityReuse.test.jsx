import { useEffect, useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// #80. Artist ids are handles, not generated identifiers — delete an artist
// and re-add the same handle, and the new record gets the identical id the
// old one had. Gallery.saveArtist's identity guard (#78) is an equality check
// on id alone, so it can't tell "id zoia.ink today" from "id zoia.ink five
// minutes ago". A save/upload closure captured while viewing the original
// artist, resolving after it was deleted and a new artist with the same
// handle was added, would land on the recreated artist's record.
//
// Fixed with an opaque `generation` field, assigned fresh by createArtist
// every time it runs (including a re-add after delete). ArtistDetail captures
// it alongside the artist id at open; Gallery.saveArtist rejects a save whose
// generation doesn't match the currently-live record's, even when the id
// (handle) matches.

const pending = []
vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(
    (files) => new Promise((resolve) => { pending.push({ resolve, count: files.length }) })
  ),
  compressImages: vi.fn(async () => []),
}))
vi.mock('../components/SimilarArtists', () => ({ default: () => null }))

const { default: Gallery } = await import('../pages/Gallery')
const { createArtist } = await import('../data/artists')

const seed = [
  {
    id: 'zoia.ink', handle: 'zoia.ink', name: 'Zoia', rank: 1, images: [],
    tags: [], status: 'researching', notes: '', studio: null, generation: 'g-original',
  },
]

let lastArtists = seed
let lastSetArtists = () => {}

function Harness() {
  const [artists, setArtists] = useState(seed)
  useEffect(() => {
    lastArtists = artists
    lastSetArtists = setArtists
  }, [artists])
  return (
    <MemoryRouter initialEntries={['/gallery']}>
      <Gallery artists={artists} setArtists={setArtists} />
    </MemoryRouter>
  )
}

function detailSheet() {
  return document.querySelector('.fixed.inset-0.z-50')
}

beforeEach(() => { pending.length = 0; lastArtists = seed })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('artist identity survives delete + re-add with the same handle (#80)', () => {
  it('a stale upload started before delete+re-add does not land on the recreated artist', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))

    // Start an upload — its onSave closure captures the artist's identity now.
    fireEvent.change(detailSheet().querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(pending).toHaveLength(1))

    // Close the sheet, then delete the artist and add a new one with the same
    // handle — the exact reproduction from the issue.
    fireEvent.click(screen.getByText('← Back'))
    const recreated = createArtist({ handle: 'zoia.ink', name: 'New Zoia', tags: [] }, [])
    act(() => { lastSetArtists([recreated]) })
    expect(lastArtists[0].name).toBe('New Zoia') // sanity: the swap took effect

    // The stale upload finally resolves — its onSave call still carries the
    // original artist's id (same handle) and its own (now stale) generation.
    await act(async () => { pending[0].resolve(['stale-uploaded.jpg']) })

    const now = lastArtists.find((a) => a.handle === 'zoia.ink')
    expect(now.name).toBe('New Zoia')
    expect(now.images || []).not.toContain('stale-uploaded.jpg')
  })

  it('a live artist (same identity throughout) still saves normally', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))

    fireEvent.change(detailSheet().querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(pending).toHaveLength(1))
    pending[0].resolve(['uploaded.jpg'])

    await waitFor(() => expect(lastArtists[0].images).toContain('uploaded.jpg'))
  })
})
