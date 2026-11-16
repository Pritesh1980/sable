import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useEffect, useState } from 'react'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'
import Gallery from '../pages/Gallery'
import AddArtistModal from '../components/AddArtistModal'

vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(async () => []),
  compressImages: vi.fn(async (files) => files.map(() => 'data:image/jpeg;base64,SHOT')),
}))
vi.mock('../data/imageStaging', async (importOriginal) => ({
  ...(await importOriginal()),
  stageImageRefs: vi.fn(async (urls, ctx) => urls.map(() => ({ key: `user/u1/saved/${ctx.id}/x.jpg` }))),
}))
import { stageImageRefs } from '../data/imageStaging'

const ARTISTS = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: 'Zoia', rank: 1, tags: [], images: [{ key: 'user/u1/artists/zoia/a.jpg' }] },
  { id: 'carl', handle: 'carl245tattoo', name: 'Carlos', rank: 2, tags: [], images: [] },
]
const SAVED = [{ id: 's1', image: { key: 'user/u1/saved/s1/a.jpg' }, addedAt: '2026-07-03T00:00:00.000Z' }]

const spy = {}
function Harness({ initialSaved = SAVED }) {
  const [artists, setArtists] = useState(ARTISTS)
  const [saved, setSaved] = useState(initialSaved)
  useEffect(() => { spy.state = { artists, saved } })
  return <Gallery artists={artists} setArtists={setArtists} saved={saved} setSaved={setSaved} ideas={[]} />
}

function renderWall(entry = '/gallery') {
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes><Route path="/gallery" element={<Harness />} /></Routes>
    </MemoryRouter>,
  )
  return spy
}

describe('saved photos on the wall', () => {
  it('shows an artist-less photo first, captioned "No artist yet", with no handle link', () => {
    renderWall()
    const piece = screen.getAllByRole('button', { name: 'Open No artist yet' }).find((b) => b.closest('figure'))
    const figure = piece.closest('figure')
    expect(within(figure).getByText('No artist yet')).toBeInTheDocument()
    expect(within(figure).queryByRole('link')).toBeNull()
    expect(document.querySelector('figure')).toBe(figure)
  })

  it('opens the viewer with no artist position, handle or Generate', () => {
    renderWall('/gallery?photo=s:s1')
    expect(screen.getByRole('heading', { name: 'No artist yet' })).toBeInTheDocument()
    expect(screen.queryByText(/artist \d+ of \d+/i)).toBeNull()
    expect(screen.queryByRole('link', { name: /@/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /generate a concept/i })).toBeNull()
    expect(screen.getByRole('button', { name: 'Give this an artist' })).toBeInTheDocument()
  })

  it('gives a saved photo to an artist in one update', () => {
    const spy = renderWall('/gallery?photo=s:s1')
    fireEvent.click(screen.getByRole('button', { name: 'Give this an artist' }))
    fireEvent.change(screen.getByLabelText('Choose an artist'), { target: { value: 'carl' } })
    fireEvent.click(screen.getByRole('button', { name: 'Give' }))
    expect(spy.state.saved).toEqual([])
    const carl = spy.state.artists.find((a) => a.id === 'carl')
    expect(carl.images).toEqual([{ key: 'user/u1/saved/s1/a.jpg', addedAt: '2026-07-03T00:00:00.000Z' }])
    expect(screen.getByText('Photo given to Carlos')).toBeInTheDocument()
  })

  it('removes a saved photo', () => {
    const spy = renderWall('/gallery?photo=s:s1')
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo' }))
    expect(spy.state.saved).toEqual([])
    expect(spy.state.artists).toEqual(ARTISTS)
  })

  it('ignores I on a saved photo, so Escape still closes the viewer, and hides artist-only hints', () => {
    renderWall('/gallery?photo=s:s1')
    expect(screen.queryByText('generate')).toBeNull()
    expect(screen.queryByText('info & notes')).toBeNull()
    expect(screen.queryByText('this artist')).toBeNull()
    fireEvent.keyDown(window, { key: 'i' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('offers a way forward with no artists: say so, and open the add form', () => {
    render(
      <MemoryRouter initialEntries={['/gallery?photo=s:s1']}>
        <Gallery artists={[]} setArtists={vi.fn()} saved={SAVED} setSaved={vi.fn()} ideas={[]} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Give this an artist' }))
    expect(screen.getByText('Add the artist first, then give them this photo.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add a new artist…' }))
    expect(screen.getByRole('dialog', { name: /add an artist/i })).toBeInTheDocument()
  })

  it('stays on the wall with no artists, whatever view is picked', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={[]} setArtists={vi.fn()} saved={SAVED} setSaved={vi.fn()} ideas={[]} />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /grid/i }))
    expect(screen.queryByText(/no artists match/i)).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Open No artist yet' }).length).toBeGreaterThan(0)
  })

  it('shows saved photos on the wall even with no artists', () => {
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={[]} setArtists={vi.fn()} saved={SAVED} setSaved={vi.fn()} ideas={[]} />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('button', { name: 'Open No artist yet' }).length).toBeGreaterThan(0)
  })
})

describe('Save without artist', () => {
  beforeEach(() => vi.clearAllMocks())

  function renderModal() {
    const setSaved = vi.fn()
    const setArtists = vi.fn()
    const onSaved = vi.fn()
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <AddArtistModal artists={ARTISTS} setArtists={setArtists} setSaved={setSaved} userId="u1" onSaved={onSaved} onClose={onClose} />
      </MemoryRouter>,
    )
    return { setSaved, setArtists, onSaved, onClose }
  }

  it('is hidden until a photo is chosen', () => {
    renderModal()
    expect(screen.queryByRole('button', { name: 'Save without artist' })).toBeNull()
  })

  it('stages the photos, saves records without creating an artist, and reports a receipt', async () => {
    const { setSaved, setArtists, onSaved, onClose } = renderModal()
    const files = [new File(['x'], 'a.png', { type: 'image/png' }), new File(['y'], 'b.png', { type: 'image/png' })]
    fireEvent.change(screen.getByLabelText(/choose files/i), { target: { files } })
    fireEvent.click(screen.getByRole('button', { name: 'Save without artist' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(stageImageRefs).toHaveBeenCalledTimes(2)
    expect(stageImageRefs).toHaveBeenCalledWith(['data:image/jpeg;base64,SHOT'], expect.objectContaining({ userId: 'u1', scope: 'saved', id: expect.any(String) }))
    const next = setSaved.mock.calls[0][0]([])
    expect(next).toHaveLength(2)
    expect(next[0].image).toEqual({ key: `user/u1/saved/${next[0].id}/x.jpg` })
    expect(next[0].id).toBeTruthy()
    expect(next[0].addedAt).toMatch(/^\d{4}-/)
    expect(next[0]).not.toHaveProperty('note')
    expect(setArtists).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith({ kind: 'saved-photo', imageCount: 2 })
    expect(onClose).toHaveBeenCalled()
  })

  it('carries a typed style note onto the saved record', async () => {
    const { setSaved, onSaved } = renderModal()
    fireEvent.change(screen.getByLabelText(/choose files/i), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    fireEvent.click(screen.getByText('Details'))
    fireEvent.change(screen.getByLabelText('Style note'), { target: { value: 'Thigh piece' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save without artist' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(setSaved.mock.calls[0][0]([])[0].note).toBe('Thigh piece')
  })
})
