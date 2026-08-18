import { useEffect, useState } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

// #81. ArtistDetail's `draft` is a one-time snapshot of `artist` taken at
// mount, never re-synced. The explicit multi-field Save used to spread the
// *whole* draft back — `onSave(artist.id, (current) => ({ ...current,
// ...editedFields }))` where editedFields was every field but images — so a
// cross-device sync landing a change to (say) notes or status while the
// sheet was open, editing something else entirely, got silently reverted the
// moment Save fired. Same shape as #63/#79, closed the same way: patch only
// the fields this session actually touched, resolved by Gallery.saveArtist
// against whatever is latest at commit time.

vi.mock('../components/SimilarArtists', () => ({ default: () => null }))

const { default: Gallery } = await import('../pages/Gallery')

const seed = [
  {
    id: 'a1', handle: 'zoia.ink', name: 'Zoia', rank: 1, images: [],
    tags: ['fine-line'], status: 'researching', notes: 'Original notes', studio: null,
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

afterEach(() => cleanup())

describe('the explicit edit-form Save does not clobber a field synced in while editing (#81)', () => {
  it('keeps a notes change that landed via sync while only the name was edited', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))
    fireEvent.click(within(detailSheet()).getByText('Edit details'))

    fireEvent.change(within(detailSheet()).getByPlaceholderText('Display name (optional)'), {
      target: { value: 'Zoia (updated)' },
    })

    // A cross-device sync reconciliation lands a notes change while this
    // sheet is still open, editing something else entirely.
    act(() => {
      lastSetArtists((prev) =>
        prev.map((a) => (a.id === 'a1' ? { ...a, notes: 'Synced from another device' } : a))
      )
    })

    fireEvent.click(within(detailSheet()).getByText('Save'))

    expect(lastArtists[0].name).toBe('Zoia (updated)')
    expect(lastArtists[0].notes).toBe('Synced from another device')
  })

  it('keeps a status change that landed via sync while only the studio was edited', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))
    fireEvent.click(within(detailSheet()).getByText('Edit details'))

    fireEvent.change(within(detailSheet()).getByDisplayValue('— None —'), {
      target: { value: 'no-regrets-london' },
    })

    act(() => {
      lastSetArtists((prev) =>
        prev.map((a) => (a.id === 'a1' ? { ...a, status: 'shortlisted' } : a))
      )
    })

    fireEvent.click(within(detailSheet()).getByText('Save'))

    expect(lastArtists[0].studio).toBe('no-regrets-london')
    expect(lastArtists[0].status).toBe('shortlisted')
  })

  it('does not still patch a field that was touched, then abandoned via Cancel', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))
    fireEvent.click(within(detailSheet()).getByText('Edit details'))

    // Touch name, then back out — this edit is abandoned, not saved.
    fireEvent.change(within(detailSheet()).getByPlaceholderText('Display name (optional)'), {
      target: { value: 'Abandoned edit' },
    })
    fireEvent.click(within(detailSheet()).getByText('Cancel'))

    // A sync lands a name change while the sheet is still open, unedited.
    act(() => {
      lastSetArtists((prev) =>
        prev.map((a) => (a.id === 'a1' ? { ...a, name: 'Synced name' } : a))
      )
    })

    // A fresh edit session touches only notes.
    fireEvent.click(within(detailSheet()).getByText('Edit details'))
    fireEvent.change(within(detailSheet()).getByPlaceholderText('Personal notes about this artist…'), {
      target: { value: 'A fresh note' },
    })
    fireEvent.click(within(detailSheet()).getByText('Save'))

    expect(lastArtists[0].notes).toBe('A fresh note')
    expect(lastArtists[0].name).toBe('Synced name')
  })

  // codex review: toggleTag's out-of-editing branch auto-saves tags on its
  // own, independently of touchedRef — but it was still marking 'tags' as
  // touched, and nothing outside an edit session's save()/Cancel ever clears
  // that. A later edit session touching something else entirely would still
  // carry that stale entry into its patch.
  it('does not let an out-of-editing tag toggle leave a stale tags touch for a later edit session', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('Zoia'))

    // Toggle a tag while not editing — auto-saves immediately via its own
    // independent patch, nothing to do with a later explicit Save.
    fireEvent.click(within(detailSheet()).getByText('blackwork'))
    expect(lastArtists[0].tags).toEqual(expect.arrayContaining(['fine-line', 'blackwork']))

    // Another device syncs in a different tags set afterwards.
    act(() => {
      lastSetArtists((prev) =>
        prev.map((a) => (a.id === 'a1' ? { ...a, tags: ['surrealism'] } : a))
      )
    })

    // A later edit session touches only notes.
    fireEvent.click(within(detailSheet()).getByText('Edit details'))
    fireEvent.change(within(detailSheet()).getByPlaceholderText('Personal notes about this artist…'), {
      target: { value: 'Another note' },
    })
    fireEvent.click(within(detailSheet()).getByText('Save'))

    expect(lastArtists[0].notes).toBe('Another note')
    expect(lastArtists[0].tags).toEqual(['surrealism'])
  })
})
