import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import PhotoSearch from '../components/PhotoSearch'
import { loadVectors, buildStyleIndex } from '../data/styleIndex'
import { refIdentity } from '../data/imageRef'

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
  buildStyleIndex: vi.fn(async () => {}),
}))

// Unit vectors at a chosen cosine to the query [1, 0].
const at = (cos) => [cos, Math.sqrt(1 - cos * cos)]

const artists = [
  { id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: ['/z1.jpg', '/z2.jpg'], tags: [] },
  { id: 'kerem', name: 'Kerem', handle: 'keremtattz', images: ['/k1.jpg'], tags: [] },
  { id: 'victor', name: 'Victor', handle: 'victorportugal', images: ['/v1.jpg', '/v2.jpg'], tags: [] },
]
const SAVED_REF = { key: 'user/u1/saved/s1/a.jpg' }
const saved = [{ id: 's1', image: SAVED_REF, addedAt: '2026-11-01T00:00:00Z' }]

const built = new Map([
  [refIdentity('/z1.jpg'), at(0.27)],
  [refIdentity('/z2.jpg'), at(0.2)], // under the cut-off
  [refIdentity('/k1.jpg'), at(0.31)],
  [refIdentity('/v1.jpg'), at(0.1)],
  [refIdentity(SAVED_REF), at(0.29)],
  // /v2.jpg not indexed yet
])

beforeEach(() => {
  vi.clearAllMocks()
  loadVectors.mockResolvedValue(built)
})

function renderSearch(props = {}) {
  const handlers = { onClose: vi.fn(), onOpenItem: vi.fn(), onQueryChange: vi.fn() }
  const search = props.search || vi.fn(async () => [1, 0])
  render(<PhotoSearch artists={artists} saved={saved} search={search} {...handlers} {...props} />)
  return { ...handlers, search }
}

async function searchFor(text) {
  const box = await screen.findByRole('searchbox', { name: 'Search your photos' })
  fireEvent.change(box, { target: { value: text } })
  fireEvent.submit(box.closest('form'))
}

describe('PhotoSearch', () => {
  it('says how much of the library it can search', async () => {
    renderSearch()
    expect(await screen.findByText('Searching 5 of 6 photos')).toBeInTheDocument()
  })

  it('says, before the first search, that it works best on one subject and downloads a model once', async () => {
    renderSearch()
    expect(await screen.findByText(/one subject/i)).toBeInTheDocument()
    expect(screen.getByText(/67 MB/)).toBeInTheDocument()
  })

  it('searches the tidied phrase and shows matches grouped by artist, best artist first', async () => {
    const { search, onQueryChange } = renderSearch()
    await searchFor('  Skull ')
    await screen.findByRole('heading', { name: 'Kerem' })
    expect(search).toHaveBeenCalledWith('skull', expect.objectContaining({ onProgress: expect.any(Function) }))
    expect(onQueryChange).toHaveBeenCalledWith('skull')
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(headings).toEqual(['Kerem', 'Saved photos', 'Zoia'])
    // Zoia's second photo scores under the cut-off and is left out.
    const zoia = screen.getByRole('heading', { name: 'Zoia' }).closest('section')
    expect(within(zoia).getAllByRole('button')).toHaveLength(1)
  })

  it('opens the tapped photo', async () => {
    const { onOpenItem } = renderSearch()
    await searchFor('skull')
    fireEvent.click(await screen.findByRole('button', { name: 'Open photo 1 by Kerem' }))
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ artistId: 'kerem', imageIndex: 0 }))
  })

  it('says so when nothing matches, and suggests one subject', async () => {
    renderSearch({ search: vi.fn(async () => [-1, 0]) })
    await searchFor('a red sports car')
    expect(await screen.findByText('Nothing in your photos looks like “a red sports car”.')).toBeInTheDocument()
    expect(screen.getByText(/one subject/i)).toBeInTheDocument()
  })

  it('shows the model download while it loads', async () => {
    let finish
    const search = vi.fn((_q, { onProgress }) => {
      onProgress(42)
      return new Promise((resolve) => { finish = resolve })
    })
    renderSearch({ search })
    await searchFor('wolf')
    expect(await screen.findByRole('status')).toHaveTextContent('Loading the search model… 42%')
    finish([1, 0])
    await screen.findByRole('heading', { name: 'Kerem' })
  })

  it('says when the model could not load', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderSearch({ search: vi.fn(async () => { throw new Error('offline') }) })
    await searchFor('wolf')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the search model. Check your connection and try again.')
  })

  it('ignores an empty search', async () => {
    const { search } = renderSearch()
    await searchFor('   ')
    expect(search).not.toHaveBeenCalled()
  })

  it('shows only the newest search when an older one answers late', async () => {
    const answers = {}
    const search = vi.fn((q) => new Promise((resolve) => { answers[q] = resolve }))
    renderSearch({ search })
    await searchFor('skull')
    await searchFor('wolf')
    answers.wolf([-1, 0])
    await screen.findByText(/looks like “wolf”/)
    answers.skull([1, 0])
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('heading', { name: 'Kerem' })).not.toBeInTheDocument()
  })

  it('reruns a search restored from the address, from the kept phrase only', async () => {
    const search = vi.fn(async () => [1, 0])
    renderSearch({ query: 'raven', search })
    expect(await screen.findByRole('searchbox', { name: 'Search your photos' })).toHaveValue('raven')
    await screen.findByRole('heading', { name: 'Kerem' })
    expect(search).toHaveBeenCalledWith('raven', expect.objectContaining({ cachedOnly: true }))
  })

  it('waits for a tap when a restored phrase is not kept, rather than download the model', async () => {
    const search = vi.fn(async () => null)
    renderSearch({ query: 'raven', search })
    expect(await screen.findByText(/one subject/i)).toBeInTheDocument()
    expect(search).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('follows the address when Back or Forward changes the phrase', async () => {
    const search = vi.fn(async (q) => (q === 'skull' ? [1, 0] : [-1, 0]))
    const props = { artists, saved, search, onClose: vi.fn(), onOpenItem: vi.fn(), onQueryChange: vi.fn() }
    const { rerender } = render(<PhotoSearch {...props} query="wolf" />)
    await screen.findByText(/looks like “wolf”/)
    rerender(<PhotoSearch {...props} query="skull" />)
    await screen.findByRole('heading', { name: 'Kerem' })
    expect(screen.getByRole('searchbox', { name: 'Search your photos' })).toHaveValue('skull')
  })

  it('does not search again when the address catches up with a tapped search', async () => {
    const props = { artists, saved, onClose: vi.fn(), onOpenItem: vi.fn(), onQueryChange: vi.fn() }
    const search = vi.fn(async () => [1, 0])
    const { rerender } = render(<PhotoSearch {...props} search={search} />)
    await searchFor('skull')
    await screen.findByRole('heading', { name: 'Kerem' })
    rerender(<PhotoSearch {...props} search={search} query="skull" />)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('says when it shows only the best matches', async () => {
    const many = Array.from({ length: 30 }, (_, i) => `/m${i}.jpg`)
    loadVectors.mockResolvedValue(new Map(many.map((src) => [refIdentity(src), at(0.3)])))
    renderSearch({ artists: [{ id: 'many', name: 'Many', handle: 'many', images: many, tags: [] }], saved: [] })
    await searchFor('skull')
    expect(await screen.findByText('Showing the best 24 matches.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Open photo/ })).toHaveLength(24)
  })

  it('puts the cursor in the search box', async () => {
    renderSearch()
    await waitFor(() => expect(screen.getByRole('searchbox', { name: 'Search your photos' })).toHaveFocus())
  })

  it('offers to build the index when nothing is indexed', async () => {
    loadVectors.mockResolvedValue(new Map())
    const { search } = renderSearch()
    fireEvent.click(await screen.findByRole('button', { name: 'Build style index' }))
    await waitFor(() => expect(buildStyleIndex).toHaveBeenCalled())
    expect(search).not.toHaveBeenCalled()
  })

  it('offers to index photos added since the last build', async () => {
    renderSearch()
    fireEvent.click(await screen.findByRole('button', { name: 'Update style index (1 new photo)' }))
    await waitFor(() => expect(buildStyleIndex).toHaveBeenCalled())
  })

  it('keeps the results on screen while the index updates', async () => {
    let finish
    buildStyleIndex.mockImplementationOnce((_source, { onProgress }) => {
      onProgress({ done: 5, total: 6 })
      return new Promise((resolve) => { finish = resolve })
    })
    renderSearch()
    await searchFor('skull')
    await screen.findByRole('heading', { name: 'Kerem' })
    fireEvent.click(screen.getByRole('button', { name: 'Update style index (1 new photo)' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Indexing… 5/6')
    expect(screen.getByRole('heading', { name: 'Kerem' })).toBeInTheDocument()
    finish()
  })

  it('says when an update fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    buildStyleIndex.mockRejectedValueOnce(new Error('offline'))
    renderSearch()
    fireEvent.click(await screen.findByRole('button', { name: 'Update style index (1 new photo)' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Index build failed')
  })

  it('closes on Escape and from the Close button', async () => {
    const { onClose } = renderSearch()
    await screen.findByText('Searching 5 of 6 photos')
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close search' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
