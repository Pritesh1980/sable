import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import TasteMap from '../components/TasteMap'

const h = vi.hoisted(() => ({ load: vi.fn(), build: vi.fn() }))
vi.mock('../data/styleIndex', () => ({ loadVectors: h.load, buildStyleIndex: h.build }))

const artists = [
  { id: 'a', handle: 'ink.a', name: 'Ada Vane', tags: ['blackwork'], images: ['/a1.jpg'], rank: 1, status: 'shortlisted' },
  { id: 'b', handle: 'ink.b', name: '', tags: ['fine-line'], images: ['/b1.jpg'], rank: 2 },
  { id: 'c', handle: 'ink.c', name: 'Cy Moor', tags: ['realism'], images: ['/c1.jpg'], rank: 3 },
]
const vectors = new Map([['/a1.jpg', [1, 0, 0]], ['/b1.jpg', [0, 1, 0]], ['/c1.jpg', [0, 0, 1]]])

beforeEach(() => {
  h.load.mockReset().mockResolvedValue(vectors)
  h.build.mockReset().mockResolvedValue(vectors)
})

describe('TasteMap', () => {
  it('places each artist on the map, and tapping one opens them', async () => {
    const onOpenArtist = vi.fn()
    render(<TasteMap artists={artists} onOpenArtist={onOpenArtist} onClose={vi.fn()} />)
    const ada = await screen.findByRole('button', { name: /Ada Vane/ })
    expect(screen.getByRole('button', { name: /@ink\.b/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cy Moor/ })).toBeInTheDocument()

    fireEvent.click(ada)
    expect(onOpenArtist).toHaveBeenCalledWith(artists[0])
  })

  // On a phone there is no hover: names must be readable on the map itself.
  it('shows each artist\'s name under their thumbnail', async () => {
    render(<TasteMap artists={artists} onOpenArtist={vi.fn()} onClose={vi.fn()} />)
    const ada = await screen.findByRole('button', { name: /Ada Vane/ })
    expect(ada).toHaveTextContent('Ada Vane')
    expect(screen.getByRole('button', { name: /@ink\.b/ })).toHaveTextContent('@ink.b')
  })

  it('marks your taste and explains the map, with a key for the styles shown', async () => {
    render(<TasteMap artists={artists} onOpenArtist={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByLabelText(/your taste/i)).toBeInTheDocument()
    expect(screen.getByText(/closer together/i)).toBeInTheDocument()
    const key = screen.getByRole('list', { name: /styles/i })
    expect(key).toHaveTextContent('blackwork')
    expect(key).toHaveTextContent('fine-line')
    expect(key).toHaveTextContent('realism')
    expect(key).not.toHaveTextContent('surrealism')
  })

  it('offers to build the style index when nothing is indexed, then draws the map', async () => {
    h.load.mockResolvedValueOnce(new Map())
    render(<TasteMap artists={artists} onOpenArtist={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Build style index' }))
    await waitFor(() => expect(h.build).toHaveBeenCalled())
    expect(await screen.findByRole('button', { name: /Ada Vane/ })).toBeInTheDocument()
  })

  it('closes', async () => {
    const onClose = vi.fn()
    render(<TasteMap artists={artists} onOpenArtist={vi.fn()} onClose={onClose} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Close taste map' }))
    expect(onClose).toHaveBeenCalled()
  })
})
