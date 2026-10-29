import { useState } from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Concepts from '../pages/Concepts'
import { COMPOSER_DRAFT_KEY, loadComposerDraft, saveComposerDraft } from '../data/composerDraft'
import { buildImagePrompt } from '../data/conceptPrompts'

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

  it('labels a saved concept tile when it reuses shipped demo artwork', () => {
    render(<ConceptsHarness initialConcepts={[
      { id: 'demo', prompt: 'An hourglass', imageUrl: '/images/demo/vesper_noctis/hourglass-v4.webp', tags: [] },
    ]} />)
    expect(within(screen.getByAltText('An hourglass').closest('figure')).getByText(/AI-generated imagery/)).toBeInTheDocument()
  })

  it('keeps the demo artwork label visible in the full-screen concept viewer', () => {
    render(<ConceptsHarness initialConcepts={[
      { id: 'demo', prompt: 'An hourglass', imageUrl: '/images/demo/vesper_noctis/hourglass-v4.webp', tags: [] },
    ]} />)
    fireEvent.click(screen.getByAltText('An hourglass'))
    expect(within(screen.getByRole('dialog')).getByText(/AI-generated imagery/)).toBeInTheDocument()
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

  // #156: the copy-prompt round trip expects an image back, so the copied
  // prompt must be the image prompt (as direct generation uses), not the
  // text-consultant prompt that makes a chatbot answer in prose.
  it('copies the image prompt, with steer and placement, for the paste-back round trip', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText }, configurable: true })
    saveComposerDraft({ steerArtistId: 'victorportugal', idea: 'A moth study', placement: 'forearm' })
    render(<ConceptsHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: '+ New concept' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Copy prompt instead' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toBe(buildImagePrompt('A moth study', {
      styleDescriptor: '', tags: ['blackwork'], placement: 'forearm',
    }))
    expect(writeText.mock.calls[0][0]).not.toMatch(/concept consultant/i)
  })

  // #157: with no key, Generate opens AI setup at the bottom of a tall
  // composer — on a phone that is off-screen, so it looked like nothing happened.
  describe('Generate image with no key', () => {
    const originalScroll = Element.prototype.scrollIntoView
    const originalMatchMedia = window.matchMedia
    let scrollIntoView
    beforeEach(() => {
      scrollIntoView = vi.fn()
      Element.prototype.scrollIntoView = scrollIntoView
    })
    afterEach(() => {
      Element.prototype.scrollIntoView = originalScroll
      window.matchMedia = originalMatchMedia
    })

    function openComposerWithIdea() {
      render(<ConceptsHarness />)
      fireEvent.click(screen.getAllByRole('button', { name: '+ New concept' })[0])
      fireEvent.change(screen.getByLabelText('Your idea'), { target: { value: 'A moth study' } })
    }

    it('opens AI setup, scrolls it into view and focuses the first key field', async () => {
      openComposerWithIdea()
      const toggle = screen.getByRole('button', { name: /AI setup/ })
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(screen.getByRole('button', { name: 'Generate image' }))
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      const panel = document.getElementById(toggle.getAttribute('aria-controls'))
      expect(panel).toBeInTheDocument()
      await waitFor(() => expect(document.activeElement).toBe(screen.getByPlaceholderText('AIza…')))
      expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }))
      expect(scrollIntoView.mock.contexts[0]).toBe(panel)
    })

    it('scrolls instantly when the user prefers reduced motion', async () => {
      window.matchMedia = vi.fn((query) => ({ matches: query.includes('reduce'), media: query,
        addEventListener() {}, removeEventListener() {} }))
      openComposerWithIdea()
      fireEvent.click(screen.getByRole('button', { name: 'Generate image' }))
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' })))
    })

    it('does not move focus when AI setup is opened from its own toggle', () => {
      openComposerWithIdea()
      const toggle = screen.getByRole('button', { name: /AI setup/ })
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'true')
      expect(document.activeElement).not.toBe(screen.getByPlaceholderText('AIza…'))
      expect(scrollIntoView).not.toHaveBeenCalled()
      fireEvent.click(toggle)
      expect(toggle).toHaveAttribute('aria-expanded', 'false')
    })
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
