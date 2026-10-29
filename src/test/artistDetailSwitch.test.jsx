import { useEffect, useState } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, cleanup, fireEvent, screen, within, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'

// #78. Gallery renders <ArtistDetail artist={selected} …> — before this fix,
// with no key. ArtistDetail's local images/draft initialise once from props
// and never re-sync, and the sheet can change which artist is open from
// inside itself via Similar ink (onSelectArtist -> setSelected). Without a
// key, a save made just after switching still wrote onto the artist that was
// open first: tapping a tag outside edit mode saves immediately via
// `onSave({ ...artist, ...next, images })`, and `next` carries stale draft's
// id, spread last, so it wins over the fresh artist prop.
//
// codex review, twice over:
// 1. The first cut hardcoded the key onto a bare <ArtistDetail>, so it could
//    not tell whether Gallery's render site keeps it. Fixed by rendering
//    Gallery itself and driving the switch through a stubbed SimilarArtists —
//    the real one needs the on-device CLIP index built first.
// 2. Gallery.saveArtist also had to stop calling setSelected(updated)
//    unconditionally, or an in-flight write for the artist that was open
//    first can bounce the sheet back onto them after a genuine switch. That
//    fix (a functional setSelected guarded on current?.id) means the *sheet*
//    no longer shows the symptom even when the underlying write is still
//    corrupted — so this test has to check what Gallery actually wrote to
//    `artists`, not just what the sheet displays. A first draft of this test
//    asserted only the sheet and kept passing with the key removed.
vi.mock('../components/SimilarArtists', () => ({
  default: ({ artists, artist, onSelectArtist }) => {
    const other = artists.find((a) => a.id !== artist.id)
    if (!other) return null
    return <button onClick={() => onSelectArtist(other)}>switch to {other.name}</button>
  },
}))

// One controllable upload, resolved by the test whenever it likes — the same
// shape as uploadRace.test.jsx.
let resolveUpload
vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(() => new Promise((resolve) => { resolveUpload = resolve })),
  compressImages: vi.fn(async () => []),
}))

const { default: Gallery } = await import('../pages/Gallery')

afterEach(cleanup)

const seed = [
  { id: 'a', handle: 'a.ink', name: 'Artist A', rank: 1, images: ['a1.jpg'], tags: ['fine-line'], status: 'researching', notes: '', studio: null },
  { id: 'b', handle: 'b.ink', name: 'Artist B', rank: 2, images: ['b1.jpg'], tags: [], status: 'researching', notes: '', studio: null },
]

// The newest artists array Gallery's own setArtists call produced — a real
// setState, not a fake adapter, so this is what the store would actually hold.
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

describe('switching the open artist inside ArtistDetail, through Gallery (#78)', () => {
  it('a tag tapped after switching artists via Similar ink is written onto the new artist, not the old one', () => {
    render(<Harness />)

    fireEvent.click(screen.getByText('Artist A'))
    expect(within(detailSheet()).getByText('Artist A')).toBeInTheDocument()

    // Switch to B from inside the open sheet — the path that previously left
    // stale local state behind because the same instance was reused.
    fireEvent.click(within(detailSheet()).getByText('switch to Artist B'))
    expect(within(detailSheet()).getByText('Artist B')).toBeInTheDocument()

    // A synchronous save. A's only tag is fine-line and B has none, so which
    // artist's tag list gains surrealism is the proof of identity.
    fireEvent.click(within(detailSheet()).getByText('surrealism'))

    const a = lastArtists.find((x) => x.id === 'a')
    const b = lastArtists.find((x) => x.id === 'b')
    expect(b.tags).toContain('surrealism')
    expect(a.tags).not.toContain('surrealism')

    // And the sheet is still open on B, not bounced back to A by a save that
    // targeted the wrong record.
    expect(within(detailSheet()).getByText('Artist B')).toBeInTheDocument()
    expect(within(detailSheet()).queryByText('Artist A')).not.toBeInTheDocument()
  })

  // codex review, finding 1: the key remounts the component, but an async
  // closure it started before unmounting keeps running to completion and
  // still calls the parent's onSave. Gallery.saveArtist used to accept that
  // call unconditionally and call setSelected(updated) — so an upload for
  // artist A resolving after a genuine switch to B bounced the sheet back to
  // A, discarding whatever the user was doing on B.
  it('an upload started on A that resolves after switching to B does not reopen A', async () => {
    render(<Harness />)

    fireEvent.click(screen.getByText('Artist A'))
    fireEvent.change(detailSheet().querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'new.jpg', { type: 'image/jpeg' })] },
    })
    // The upload is now pending — nothing has resolved it yet.
    expect(resolveUpload).toBeTypeOf('function')

    // Switch to B while A's upload is still in flight.
    fireEvent.click(within(detailSheet()).getByText('switch to Artist B'))
    expect(within(detailSheet()).getByText('Artist B')).toBeInTheDocument()

    // A's upload lands now, after the switch.
    resolveUpload(['a-new.jpg'])
    await new Promise((r) => setTimeout(r, 0))

    // The sheet must not have snapped back to A.
    expect(within(detailSheet()).getByText('Artist B')).toBeInTheDocument()
    expect(within(detailSheet()).queryByText('Artist A')).not.toBeInTheDocument()

    // And A still receives its own upload — the write itself is correct,
    // only the parent's notion of "who is on screen" was at risk. codex
    // review: a positive-only assertion here would pass even for a broken
    // write that also clobbered B, so check B's record is untouched and no
    // artist was dropped or duplicated, not just that A's upload landed.
    const a = lastArtists.find((x) => x.id === 'a')
    const b = lastArtists.find((x) => x.id === 'b')
    expect(a.images).toContain('a-new.jpg')
    expect(b.images).toEqual(seed[1].images)
    expect(b.tags).toEqual(seed[1].tags)
    expect(lastArtists).toHaveLength(seed.length)
  })
})

// #159: the open artist lives in the URL (?artist=<id>), so the browser's Back
// closes the detail instead of leaving the gallery, and a detail can be linked.
describe('artist detail and the Back button (#159)', () => {
  const probe = {}
  function Probe() {
    const location = useLocation()
    const navigate = useNavigate()
    useEffect(() => { Object.assign(probe, { location, navigate }) })
    return null
  }
  const here = () => `${probe.location.pathname}${probe.location.search}`
  const back = () => act(() => { probe.navigate(-1) })

  function RoutedHarness({ entries }) {
    const [artists, setArtists] = useState(seed)
    lastArtists = artists
    return (
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Probe />
        <Routes>
          <Route path="/" element={<div>Home page mock</div>} />
          <Route path="/gallery" element={<Gallery artists={artists} setArtists={setArtists} />} />
        </Routes>
      </MemoryRouter>
    )
  }
  const renderAt = (...entries) => render(<RoutedHarness entries={entries} />)

  it('tapping an artist pushes ?artist=<id>, and Back closes the detail onto the gallery', () => {
    renderAt('/', '/gallery')
    fireEvent.click(screen.getByText('Artist A'))
    expect(here()).toBe('/gallery?artist=a')
    expect(detailSheet()).not.toBeNull()

    back()

    expect(here()).toBe('/gallery')
    expect(detailSheet()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument()
  })

  it('the sheet\'s own ← Back leaves no entry behind', () => {
    renderAt('/', '/gallery')
    fireEvent.click(screen.getByText('Artist A'))
    fireEvent.click(within(detailSheet()).getByRole('button', { name: /back/i }))
    expect(here()).toBe('/gallery')
    expect(detailSheet()).toBeNull()

    back()
    expect(screen.getByText('Home page mock')).toBeInTheDocument()
  })

  it('switching artist inside the sheet replaces the entry', () => {
    renderAt('/', '/gallery')
    fireEvent.click(screen.getByText('Artist A'))
    fireEvent.click(within(detailSheet()).getByText('switch to Artist B'))
    expect(here()).toBe('/gallery?artist=b')

    back()
    expect(here()).toBe('/gallery')
    expect(detailSheet()).toBeNull()
  })

  it('keeps the other query params through open and close', () => {
    renderAt('/gallery?demo=1')
    fireEvent.click(screen.getByText('Artist A'))
    expect(here()).toBe('/gallery?demo=1&artist=a')
    fireEvent.click(within(detailSheet()).getByRole('button', { name: /back/i }))
    expect(here()).toBe('/gallery?demo=1')
  })

  it('a deep link opens that artist; closing it stays on the gallery', () => {
    renderAt('/', '/gallery?artist=b')
    expect(within(detailSheet()).getByText('Artist B')).toBeInTheDocument()
    fireEvent.click(within(detailSheet()).getByRole('button', { name: /back/i }))
    expect(here()).toBe('/gallery')
    expect(detailSheet()).toBeNull()
    back()
    expect(screen.getByText('Home page mock')).toBeInTheDocument()
  })

  it('a deep link to an artist who is not in the gallery shows the gallery', () => {
    renderAt('/gallery?artist=nobody')
    expect(detailSheet()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument()
  })
})
