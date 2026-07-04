import { useState } from 'react'
import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Concepts from '../pages/Concepts'
import { COMPOSER_DRAFT_KEY, loadComposerDraft, saveComposerDraft } from '../data/composerDraft'

const artists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['dark-illustrative', 'surrealism'], images: ['/images/artists/zoia.ink/1.jpg'] },
  { id: 'victorportugal', handle: 'victorportugal', name: 'Victor Portugal', tags: ['blackwork'], images: ['/images/artists/victorportugal/1.jpg'] },
]

function ConceptsHarness({ initialConcepts = [], initialEntries = ['/concepts'] }) {
  const [concepts, setConcepts] = useState(initialConcepts)
  return (
    <MemoryRouter initialEntries={initialEntries}>
      <Concepts concepts={concepts} setConcepts={setConcepts} artists={artists} ideas={[]} />
    </MemoryRouter>
  )
}

describe('Concepts page', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the concept wall from saved concepts with images', () => {
    const concepts = [
      { id: '1', prompt: 'A raven', imageUrl: '/img/raven.png', tags: ['dark-illustrative'] },
      { id: '2', prompt: 'A wolf', imageUrl: '/img/wolf.png', tags: ['fine-line'] },
    ]
    render(<ConceptsHarness initialConcepts={concepts} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('opens the full-screen viewer when a concept piece is clicked', () => {
    const concepts = [{ id: '1', prompt: 'A raven', imageUrl: '/img/raven.png', tags: [] }]
    render(<ConceptsHarness initialConcepts={concepts} />)
    fireEvent.click(screen.getByAltText('A raven'))
    expect(screen.getByRole('heading', { name: 'A raven' })).toBeInTheDocument()
    expect(screen.getByText(/variants & stl export/i)).toBeInTheDocument()
  })

  it('surfaces variants and STL export triggers from inside the viewer', () => {
    const concepts = [{
      id: '1',
      prompt: 'A raven',
      imageUrl: '/img/raven.png',
      tags: [],
      variants: [{
        id: 'v1',
        provider: 'chatgpt',
        title: 'Pass one',
        imageUrl: 'data:image/png;base64,abc',
        response: '',
        notes: '',
        rating: 0,
        isBest: false,
        createdAt: '2026-06-01T00:00:00.000Z',
      }],
    }]
    render(<ConceptsHarness initialConcepts={concepts} />)
    fireEvent.click(screen.getByAltText('A raven'))
    fireEvent.click(screen.getByText(/variants & stl export/i))
    expect(screen.getByRole('heading', { name: 'AI Results' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Pass one result for A raven' }))
    expect(screen.getByRole('button', { name: 'Make STL from Pass one result for A raven' })).toBeInTheDocument()
  })

  it('pre-fills and opens the composer from a ?steer=<artistId> query param', () => {
    render(<ConceptsHarness initialEntries={['/concepts?steer=zoia.ink']} />)
    expect(screen.getByText(/steering is pre-set to @zoia\.ink/i)).toBeInTheDocument()
  })

  it('handles a steer id containing dots', () => {
    render(<ConceptsHarness initialEntries={['/concepts?steer=victorportugal']} />)
    expect(screen.getByText(/steering is pre-set to victor portugal/i)).toBeInTheDocument()
  })

  it('persists composer draft fields to localStorage as they change', () => {
    render(<ConceptsHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ New concept' })[0])
    fireEvent.change(screen.getByLabelText('Your idea'), { target: { value: 'A moth study' } })
    expect(loadComposerDraft().idea).toBe('A moth study')
  })

  it('restores a saved draft on mount', () => {
    saveComposerDraft({ steerArtistId: '', idea: 'Restored idea', placement: 'forearm' })
    render(<ConceptsHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ New concept' })[0])
    expect(screen.getByLabelText('Your idea')).toHaveValue('Restored idea')
  })

  it('clears the draft after a successful paste-back save', async () => {
    render(<ConceptsHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ New concept' })[0])
    fireEvent.change(screen.getByLabelText('Your idea'), { target: { value: 'A moth study' } })

    const file = new File(['(binary)'], 'result.png', { type: 'image/png' })
    const input = screen.getByLabelText('Choose file')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(localStorage.getItem(COMPOSER_DRAFT_KEY)).toBeNull())
    expect(screen.queryByLabelText('Your idea')).not.toBeInTheDocument()
  })

  it('saves a pasted-back image identically to a generated concept, landing on the wall', async () => {
    function Harness() {
      const [concepts, setConcepts] = useState([])
      return (
        <MemoryRouter initialEntries={['/concepts']}>
          <Concepts concepts={concepts} setConcepts={setConcepts} artists={artists} ideas={[]} />
        </MemoryRouter>
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ New concept' })[0])
    fireEvent.change(screen.getByLabelText('Your idea'), { target: { value: 'A moth study' } })

    const file = new File(['(binary)'], 'result.png', { type: 'image/png' })
    const input = screen.getByLabelText('Choose file')
    fireEvent.change(input, { target: { files: [file] } })

    await waitFor(() => expect(screen.getByAltText('A moth study')).toBeInTheDocument())
  })
})
