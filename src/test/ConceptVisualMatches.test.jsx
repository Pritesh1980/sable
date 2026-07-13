import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConceptVisualMatches from '../components/ConceptVisualMatches'
import { loadVectors, vectorFor } from '../data/styleIndex'

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
  vectorFor: vi.fn(async () => null),
}))

const artists = [
  { id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: ['/z1.jpg'], tags: [] },
  { id: 'kerem', name: 'Kerem', handle: 'keremtattz', images: ['/k1.jpg'], tags: [] },
  { id: 'victor', name: 'Victor', handle: 'victorportugal', images: ['/v1.jpg'], tags: [] },
]
const vectors = new Map([
  ['/z1.jpg', [0, 1]],
  ['/k1.jpg', [1, 0.05]],
  ['/v1.jpg', [0.6, 0.6]],
])
const concept = { id: 'c1', prompt: 'night forest', imageUrl: '/concepts/c1.png' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ConceptVisualMatches', () => {
  it('hints at building the style index when no artist images are embedded', async () => {
    loadVectors.mockResolvedValue(new Map())
    render(<ConceptVisualMatches artists={artists} concept={concept} />)
    expect(await screen.findByText(/build the style index/i)).toBeInTheDocument()
    expect(vectorFor).not.toHaveBeenCalled()
  })

  it('embeds the concept image and lists artists by visual similarity', async () => {
    loadVectors.mockResolvedValue(vectors)
    vectorFor.mockResolvedValue([1, 0]) // concept points at kerem's direction
    render(<ConceptVisualMatches artists={artists} concept={concept} />)
    const names = await screen.findAllByTestId('visual-match-name')
    expect(names[0]).toHaveTextContent('Kerem')
    expect(vectorFor).toHaveBeenCalledWith('/concepts/c1.png', 'concept:c1')
    // Taste fit: how strongly this image matches the user's overall taste.
    expect(screen.getByText(/taste fit \d+%/i)).toBeInTheDocument()
  })

  it('renders nothing when the concept has no image', () => {
    const { container } = render(
      <ConceptVisualMatches artists={artists} concept={{ id: 'c2', prompt: 'text only' }} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('says so when the concept image could not be analysed', async () => {
    loadVectors.mockResolvedValue(vectors)
    vectorFor.mockResolvedValue(null)
    render(<ConceptVisualMatches artists={artists} concept={concept} />)
    expect(await screen.findByText(/couldn't analyse/i)).toBeInTheDocument()
  })
})
