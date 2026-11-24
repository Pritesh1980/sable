import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { UndoProvider } from '../context/UndoContext'
import ArtistTable from '../components/ArtistTable'

// #187: Manage shows key-free curation hints once the style index exists.
const index = vi.hoisted(() => ({ vectors: new Map() }))
vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => index.vectors),
  buildStyleIndex: vi.fn(),
}))

afterEach(() => {
  cleanup()
  index.vectors = new Map()
})

const NEAR = [[1, 0.1, 0], [1, 0, 0.1], [1, 0.05, 0.05], [0.95, 0.1, 0.1]]
const STRAY = [0, 1, 0]

function artist(id, tags, vecs, rank) {
  const images = vecs.map((v, i) => {
    const path = `images/artists/${id}/${i}.jpg`
    index.vectors.set(`path:/${path}`, v)
    return path
  })
  return { id, handle: id, name: '', tags, images, rank, notes: '', studio: null }
}

function library() {
  const target = artist('target', ['dark-illustrative'], NEAR, 1)
  const near = [0, 1, 2, 3, 4].map((i) =>
    artist(`near${i}`, i < 3 ? ['realism'] : ['blackwork'], NEAR.map((v) => v.map((x, k) => x + 0.01 * i * (k + 1))), i + 2))
  const odd = artist('odd', ['blackwork'], [[0, 0, 1], [0, 0.05, 1], [0.05, 0, 1], [0, 0.1, 1], STRAY], 10)
  return { target, odd, artists: [target, ...near, odd] }
}

function renderTable(artists, { onUpdate = vi.fn(), onSaveImages = vi.fn() } = {}) {
  render(
    <UndoProvider undoWindowMs={5000}>
      <ArtistTable artists={artists} onSaveImages={onSaveImages} onUpdate={onUpdate} onRemove={vi.fn()} />
    </UndoProvider>
  )
  return { onUpdate, onSaveImages }
}

describe('curation hints in Manage (#187)', () => {
  it('shows nothing until the style index is built', async () => {
    const { artists } = library()
    index.vectors = new Map()
    renderTable(artists)
    fireEvent.click(screen.getByText('@target'))
    fireEvent.click(screen.getByText('@odd'))
    // Let the index read settle, then check nothing appeared.
    await screen.findAllByText(/Style Tags/i)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/suggested/i)).toBeNull()
    expect(screen.queryByText(/doesn.t look like the rest/i)).toBeNull()
    expect(screen.queryByText(/to check/i)).toBeNull()
  })

  it('suggests a tag the nearest tagged artists share, and adds it on tap', async () => {
    const { artists, target } = library()
    const { onUpdate } = renderTable(artists)
    fireEvent.click(screen.getByText('@target'))
    const add = await screen.findByRole('button', { name: /add the realism tag/i })
    expect(screen.getByText(/looks like @near0, @near1 and @near2, tagged realism/i)).toBeTruthy()
    fireEvent.click(add)
    expect(onUpdate).toHaveBeenCalledWith(target.id, { tags: ['dark-illustrative', 'realism'] })
  })

  it('marks an artist with an off-style photo, and Keep remembers it on the artist', async () => {
    const { artists, odd } = library()
    const { onUpdate } = renderTable(artists)
    expect(await screen.findByText(/1 photo to check/i)).toBeTruthy()
    fireEvent.click(screen.getByText('@odd'))
    const section = (await screen.findByText(/doesn.t look like the rest/i)).closest('section')
    fireEvent.click(within(section).getByRole('button', { name: /keep/i }))
    expect(onUpdate).toHaveBeenCalledWith(odd.id, { keptImages: ['path:/images/artists/odd/4.jpg'] })
  })

  it('a mis-tapped Keep can be undone', async () => {
    const { artists, odd } = library()
    const { onUpdate } = renderTable(artists)
    fireEvent.click(await screen.findByText('@odd'))
    const section = (await screen.findByText(/doesn.t look like the rest/i)).closest('section')
    fireEvent.click(within(section).getByRole('button', { name: /keep/i }))
    expect(screen.getByText(/photo kept for @odd/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^undo$/i }))
    expect(onUpdate).toHaveBeenLastCalledWith(odd.id, { keptImages: [] })
  })

  it('Remove takes the flagged photo out, with undo', async () => {
    const { artists, odd } = library()
    const { onSaveImages } = renderTable(artists)
    fireEvent.click(await screen.findByText('@odd'))
    const section = (await screen.findByText(/doesn.t look like the rest/i)).closest('section')
    fireEvent.click(within(section).getByRole('button', { name: /remove/i }))
    expect(onSaveImages).toHaveBeenCalled()
    const [id, update] = onSaveImages.mock.calls[0]
    expect(id).toBe(odd.id)
    expect(update(odd.images)).toEqual(odd.images.slice(0, 4))
    expect(screen.getByRole('button', { name: /^undo$/i })).toBeTruthy()
  })

  it('a kept photo is not flagged again', async () => {
    const { artists, odd } = library()
    const kept = artists.map((a) => (a.id === odd.id ? { ...a, keptImages: ['path:/images/artists/odd/4.jpg'] } : a))
    renderTable(kept)
    fireEvent.click(screen.getByText('@odd'))
    fireEvent.click(screen.getByText('@target'))
    // The index has loaded once target's tag suggestion shows.
    await screen.findByRole('button', { name: /add the realism tag/i })
    expect(screen.queryByText(/doesn.t look like the rest/i)).toBeNull()
    expect(screen.queryByText(/to check/i)).toBeNull()
  })
})
