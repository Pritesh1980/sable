import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SimilarArtists from '../components/SimilarArtists'
import { loadVectors, buildStyleIndex } from '../data/styleIndex'

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
  buildStyleIndex: vi.fn(async () => {}),
}))

const artists = [
  { id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: ['/z1.jpg'], tags: [] },
  { id: 'kerem', name: 'Kerem', handle: 'keremtattz', images: ['/k1.jpg'], tags: [] },
  { id: 'victor', name: 'Victor', handle: 'victorportugal', images: ['/v1.jpg'], tags: [] },
]

const builtVectors = new Map([
  ['/z1.jpg', [1, 0]],
  ['/k1.jpg', [0.9, 0.1]],
  ['/v1.jpg', [0, 1]],
])

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SimilarArtists', () => {
  it('offers to build the style index when nothing is embedded yet', async () => {
    render(<SimilarArtists artists={artists} artist={artists[0]} />)
    expect(await screen.findByRole('button', { name: /build style index/i })).toBeInTheDocument()
    // Sets expectations: on-device, one-off download.
    expect(screen.getByText(/on this device/i)).toBeInTheDocument()
  })

  it('builds on demand and then shows visually similar artists', async () => {
    loadVectors.mockResolvedValueOnce(new Map()) // initial mount: empty
    buildStyleIndex.mockImplementation(async () => {})
    loadVectors.mockResolvedValue(builtVectors) // after build
    render(<SimilarArtists artists={artists} artist={artists[0]} />)
    fireEvent.click(await screen.findByRole('button', { name: /build style index/i }))
    expect(buildStyleIndex).toHaveBeenCalled()
    // kerem (cos≈0.99) ranks; victor (cos 0) still listed but after kerem
    const names = await screen.findAllByTestId('similar-artist-name')
    expect(names[0]).toHaveTextContent('Kerem')
  })

  it('renders similar artists straight away when the index already exists', async () => {
    loadVectors.mockResolvedValue(builtVectors)
    render(<SimilarArtists artists={artists} artist={artists[0]} />)
    const names = await screen.findAllByTestId('similar-artist-name')
    expect(names.map((n) => n.textContent)).toContain('Kerem')
    expect(screen.queryByRole('button', { name: /build style index/i })).not.toBeInTheDocument()
  })

  it('clicking a similar artist invokes onSelectArtist with that artist', async () => {
    loadVectors.mockResolvedValue(builtVectors)
    const onSelectArtist = vi.fn()
    render(<SimilarArtists artists={artists} artist={artists[0]} onSelectArtist={onSelectArtist} />)
    const names = await screen.findAllByTestId('similar-artist-name')
    fireEvent.click(names[0])
    expect(onSelectArtist).toHaveBeenCalledWith(expect.objectContaining({ id: 'kerem' }))
  })
})
