import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import MoreLikeThis from '../components/MoreLikeThis'
import { loadVectors, buildStyleIndex } from '../data/styleIndex'
import { refIdentity } from '../data/imageRef'

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
  buildStyleIndex: vi.fn(async () => {}),
}))

const artists = [
  { id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: ['/z1.jpg', '/z2.jpg'], tags: [] },
  { id: 'kerem', name: 'Kerem', handle: 'keremtattz', images: ['/k1.jpg'], tags: [] },
  { id: 'victor', name: 'Victor', handle: 'victorportugal', images: ['/v1.jpg'], tags: [] },
  { id: 'carl', name: 'Carlos', handle: 'carl245', images: ['/c1.jpg'], tags: [] },
  { id: 'oscar', name: 'Oscar', handle: 'oscarakermo', images: ['/o1.jpg'], tags: [] },
]
const SAVED_REF = { key: 'user/u1/saved/s1/a.jpg' }
const saved = [{ id: 's1', image: SAVED_REF, addedAt: '2026-11-01T00:00:00Z' }]

const built = new Map([
  [refIdentity('/z1.jpg'), [1, 0]],
  [refIdentity('/z2.jpg'), [0.99, 0.01]],
  [refIdentity('/k1.jpg'), [0.9, 0.1]],
  [refIdentity('/v1.jpg'), [0, 1]],
  [refIdentity('/c1.jpg'), [0.5, 0.5]],
  [refIdentity('/o1.jpg'), [0.7, 0.3]],
  [refIdentity(SAVED_REF), [0.95, 0.05]],
])

const item = { artistId: 'zoia', artistName: 'Zoia', handle: 'zoia.ink', image: '/z1.jpg', imageIndex: 0 }

beforeEach(() => {
  vi.clearAllMocks()
  loadVectors.mockResolvedValue(built)
})

function renderSheet(props = {}) {
  const handlers = { onClose: vi.fn(), onOpenItem: vi.fn(), onOpenArtist: vi.fn() }
  render(<MoreLikeThis item={item} artists={artists} saved={saved} {...handlers} {...props} />)
  return handlers
}

describe('MoreLikeThis', () => {
  it('lists the 3 closest artists first, never the photo\'s own artist', async () => {
    renderSheet()
    const names = await screen.findAllByTestId('mlt-artist-name')
    expect(names.map((n) => n.textContent)).toEqual(['Kerem', 'Oscar', 'Carlos'])
    const heading = screen.getByRole('heading', { name: 'Closest artists' })
    const photos = screen.getByRole('heading', { name: 'Similar photos' })
    expect(heading.compareDocumentPosition(photos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens an artist on tap', async () => {
    const { onOpenArtist } = renderSheet()
    fireEvent.click((await screen.findAllByTestId('mlt-artist-name'))[0])
    expect(onOpenArtist).toHaveBeenCalledWith(expect.objectContaining({ id: 'kerem' }))
  })

  it('shows similar photos, including saved ones, never the source, and opens one on tap', async () => {
    const { onOpenItem } = renderSheet()
    const buttons = await screen.findAllByRole('button', { name: /open similar photo/i })
    expect(buttons).toHaveLength(6) // 7 indexed photos minus the source
    const first = buttons[0]
    expect(first).toHaveAccessibleName('Open similar photo 1 of 6, by Zoia') // z2 is nearest
    // each photo is captioned with its artist
    expect(within(first).getByText('Zoia')).toBeInTheDocument()
    fireEvent.click(buttons.find((b) => /saved photo with no artist/.test(b.getAttribute('aria-label'))))
    expect(onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ savedId: 's1' }))
  })

  it('works for a photo saved without an artist', async () => {
    renderSheet({ item: { artistId: null, savedId: 's1', artistName: 'No artist yet', image: SAVED_REF, imageIndex: 0 } })
    const names = await screen.findAllByTestId('mlt-artist-name')
    expect(names).toHaveLength(3)
    expect(names[0]).toHaveTextContent('Zoia')
  })

  it('explains and offers to build when the index is empty', async () => {
    loadVectors.mockResolvedValue(new Map())
    renderSheet()
    expect(await screen.findByText(/needs the style index/i)).toBeInTheDocument()
    loadVectors.mockResolvedValue(built)
    fireEvent.click(screen.getByRole('button', { name: /build style index/i }))
    expect(buildStyleIndex).toHaveBeenCalled()
    expect((await screen.findAllByTestId('mlt-artist-name')).length).toBe(3)
  })

  it('offers an update when only this photo is missing from the index', async () => {
    const partial = new Map(built)
    partial.delete(refIdentity('/z1.jpg'))
    loadVectors.mockResolvedValue(partial)
    renderSheet()
    expect(await screen.findByText(/not in the style index yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /update style index/i })).toBeInTheDocument()
  })

  it('shows an error, not a crash, when the build fails', async () => {
    loadVectors.mockResolvedValue(new Map())
    buildStyleIndex.mockRejectedValueOnce(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    renderSheet()
    fireEvent.click(await screen.findByRole('button', { name: /build style index/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/index build failed/i)
  })

  it('says so when there is nothing else to compare with', async () => {
    loadVectors.mockResolvedValue(new Map([[refIdentity('/z1.jpg'), [1, 0]]]))
    renderSheet()
    expect(await screen.findByText(/no other artists are indexed/i)).toBeInTheDocument()
    expect(screen.getByText(/no other indexed photos/i)).toBeInTheDocument()
  })

  it('renders nothing while the index is still being read', () => {
    loadVectors.mockReturnValue(new Promise(() => {}))
    renderSheet()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/needs the style index/i)).toBeNull()
  })

  it('Escape closes the sheet', async () => {
    const { onClose } = renderSheet()
    await screen.findAllByTestId('mlt-artist-name')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

