import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// #79. Every ArtistDetail save sent the whole record:
//   onSave({ ...artist, ...draft, images: newImages })   // saveImages
//   onSave({ ...draft, images })                          // the edit-form Save
// Gallery.saveArtist then replaced the stored record outright. Two saves for
// the same artist in flight at once raced on whichever payload was captured
// last — no switching, no second artist, just a stale closure overwriting a
// fresh one on the same entity. #78's identity guard cannot help: both
// payloads carry the same id.
//
// Concrete shape from the issue: open artist A, start an upload. Before it
// resolves, tap a style tag — that auto-saves immediately and lands first,
// correctly. The upload resolves after, but its saveImages closure was
// captured before the tag toggle, so it still holds the pre-toggle draft —
// sending the whole record back silently reverts the tag.
//
// Fixed by having onSave carry (id, patch) rather than a snapshot, resolved by
// Gallery against whatever is latest in the artists array at commit time —
// not against whatever draft/images a stale closure happened to be holding.
const pending = []
vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(
    (files) => new Promise((resolve) => { pending.push({ resolve, count: files.length }) })
  ),
  compressImages: vi.fn(async () => []),
}))
vi.mock('../components/SimilarArtists', () => ({ default: () => null }))

const { default: Gallery } = await import('../pages/Gallery')

const seed = [
  { id: 'a1', handle: 'zoia.ink', name: 'Zoia', rank: 1, images: ['first.jpg'], tags: [], status: 'researching', notes: '', studio: null },
]

let lastArtists = seed

function Harness() {
  const [artists, setArtists] = useState(seed)
  lastArtists = artists
  return (
    <MemoryRouter initialEntries={['/gallery']}>
      <Gallery artists={artists} setArtists={setArtists} />
    </MemoryRouter>
  )
}

function detailSheet() {
  return document.querySelector('.fixed.inset-0.z-50')
}

beforeEach(() => { pending.length = 0 })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('a tag toggle survives a slower upload landing after it (#79)', () => {
  it('keeps the tag when the upload that started first resolves last', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))

    // Start the upload — its closure captures the artist/draft as they are now.
    fireEvent.change(detailSheet().querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(pending).toHaveLength(1))

    // Before it resolves, toggle a tag — auto-saves immediately, lands first.
    fireEvent.click(within(detailSheet()).getByText('fine-line'))

    // The upload resolves after — its saveImages call must not carry the
    // pre-toggle draft back over the tag that landed while it was in flight.
    pending[0].resolve(['new-uploaded.jpg'])
    await waitFor(() => expect(lastArtists[0].images).toContain('new-uploaded.jpg'))

    expect(lastArtists[0].tags).toContain('fine-line')
    expect(lastArtists[0].images).toEqual(expect.arrayContaining(['first.jpg', 'new-uploaded.jpg']))
  })

  it('keeps the image when the tag toggle lands after the upload resolves', async () => {
    // The reverse ordering: the upload settles first, the tag comes after —
    // this direction always worked, kept as a companion regression check.
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))

    fireEvent.change(detailSheet().querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(pending).toHaveLength(1))
    pending[0].resolve(['new-uploaded.jpg'])
    await waitFor(() => expect(lastArtists[0].images).toContain('new-uploaded.jpg'))

    fireEvent.click(within(detailSheet()).getByText('fine-line'))

    expect(lastArtists[0].tags).toContain('fine-line')
    expect(lastArtists[0].images).toContain('new-uploaded.jpg')
  })
})

describe('the explicit edit-form Save does not clobber a concurrent image change (#79)', () => {
  it('keeps an image added while the edit form was open', async () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))
    fireEvent.click(screen.getByText('Edit details'))

    fireEvent.change(screen.getByPlaceholderText('Display name (optional)'), {
      target: { value: 'Zoia (updated)' },
    })

    // An image lands via the always-editable photo section while the name
    // field is still being edited — the explicit Save that follows must not
    // revert it.
    fireEvent.change(detailSheet().querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'mid-edit.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(pending).toHaveLength(1))
    pending[0].resolve(['mid-edit-uploaded.jpg'])
    await waitFor(() => expect(lastArtists[0].images).toContain('mid-edit-uploaded.jpg'))

    fireEvent.click(screen.getByText('Save'))

    expect(lastArtists[0].name).toBe('Zoia (updated)')
    expect(lastArtists[0].images).toContain('mid-edit-uploaded.jpg')
  })
})
