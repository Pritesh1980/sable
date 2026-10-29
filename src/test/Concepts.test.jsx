import { useState } from 'react'
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { createOwnerScope } from '../backend/ownerScope'
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

  // #157: a build without the paid relay (the public demo, offline builds)
  // can't run a paid refinement, so its recovery bar and paid-backup box only
  // confused a first-time user. They stay whenever there is something to
  // recover or a saved paid result to back up.
  describe('paid-refinement panels', () => {
    const ownerScope = createOwnerScope({ privateMode: true, getOwnerId: () => 'A' })
    const journalWith = (markers = []) => ({ expire: vi.fn(async () => {}), list: vi.fn(async () => markers),
      put: vi.fn(), remove: vi.fn(), markAccepted: vi.fn() })
    const disabledCaps = { enabled: false, operations: [], provider: null, profile: null, quota: null, serverTime: 0 }
    const configuredRelay = () => ({ configured: true, capabilities: vi.fn(async () => disabledCaps),
      serverNow: () => 0, list: vi.fn(async () => []) })
    const paidVariant = { id: 'relay:1', imageUrl: 'data:image/png;base64,abc', title: 'Refined',
      generation: { version: 1, provenance: 'relay' } }

    function SignedIn({ initialConcepts = [], relay, journal }) {
      const [concepts, setConcepts] = useState(initialConcepts)
      return (
        <MemoryRouter initialEntries={['/concepts']}>
          <Concepts concepts={concepts} setConcepts={setConcepts} artists={artists} ideas={[]}
            backupOwnerId="A" onExportBackup={vi.fn()} ownerScope={ownerScope}
            {...(relay ? { relay } : {})} journal={journal} />
        </MemoryRouter>
      )
    }
    async function settle(journal) {
      await waitFor(() => expect(journal.list).toHaveBeenCalled())
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)) })
    }
    const recoveryBar = () => screen.queryByRole('region', { name: 'Refinement recovery' })
    const backupBox = () => screen.queryByRole('region', { name: 'Paid image backup' })

    it('hides the recovery bar and paid backup box when no relay is configured and nothing is pending', async () => {
      const journal = journalWith()
      render(<SignedIn journal={journal} />)
      await settle(journal)
      expect(recoveryBar()).not.toBeInTheDocument()
      expect(backupBox()).not.toBeInTheDocument()
      expect(screen.getByText(/no concepts yet/i)).toBeInTheDocument()
    })

    it('keeps recovery reachable without a relay while the journal holds an accepted job', async () => {
      const journal = journalWith([{ requestId: 'r1', ownerId: 'A', accepted: true, jobId: 'j1', source: null,
        destination: { ownerId: 'A', conceptId: 'gone', parentVariantId: null, draftRevision: 1 } }])
      render(<SignedIn journal={journal} />)
      await waitFor(() => expect(recoveryBar()).toBeInTheDocument())
      expect(within(recoveryBar()).getByRole('status')).toHaveTextContent('Refinement needs attention')
      expect(within(recoveryBar()).getByRole('button', { name: 'Check recovery' })).toBeInTheDocument()
      expect(backupBox()).toBeInTheDocument()
    })

    it('shows both when the library holds a saved paid result, even without a relay', async () => {
      const journal = journalWith()
      render(<SignedIn journal={journal} initialConcepts={[
        { id: 'c1', prompt: 'A raven', imageUrl: '/img/raven.png', tags: [], variants: [paidVariant] },
      ]} />)
      await settle(journal)
      expect(recoveryBar()).toBeInTheDocument()
      expect(backupBox()).toBeInTheDocument()
    })

    it('shows both from first paint when a relay is configured', () => {
      render(<SignedIn journal={journalWith()} relay={configuredRelay()} />)
      expect(recoveryBar()).toBeInTheDocument()
      expect(backupBox()).toBeInTheDocument()
    })

    it('keeps recovery reachable while a configured relay is unreachable, and retries without sending', async () => {
      const relay = configuredRelay()
      relay.submit = vi.fn()
      relay.capabilities.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'relay_unavailable' }))
      const journal = journalWith()
      render(<SignedIn journal={journal} relay={relay} />)
      await settle(journal)
      expect(relay.capabilities).toHaveBeenCalledTimes(1)
      fireEvent.click(within(recoveryBar()).getByRole('button', { name: 'Check recovery' }))
      expect(await screen.findByRole('dialog', { name: 'Refine image' })).toBeInTheDocument()
      await waitFor(() => expect(relay.capabilities).toHaveBeenCalledTimes(2))
      expect(relay.submit).not.toHaveBeenCalled()
    })

    it('leaves the paid backup box out of the manual refinement drawer when no relay is configured', async () => {
      const journal = journalWith()
      render(<SignedIn journal={journal} initialConcepts={[
        { id: 'c1', prompt: 'A raven', imageUrl: '/img/raven.png', tags: [] },
      ]} />)
      await settle(journal)
      fireEvent.click(screen.getByAltText('A raven'))
      fireEvent.click(screen.getByRole('button', { name: 'Refine this' }))
      const drawer = await screen.findByRole('dialog', { name: 'Refine image' })
      expect(within(drawer).getByRole('button', { name: 'Copy refinement prompt' })).toBeInTheDocument()
      expect(within(drawer).queryByRole('region', { name: 'Paid image backup' })).not.toBeInTheDocument()
    })

    it('keeps the paid backup box in the refinement drawer when a relay is configured', async () => {
      render(<SignedIn journal={journalWith()} relay={configuredRelay()} initialConcepts={[
        { id: 'c1', prompt: 'A raven', imageUrl: '/img/raven.png', tags: [] },
      ]} />)
      fireEvent.click(screen.getByAltText('A raven'))
      fireEvent.click(screen.getByRole('button', { name: 'Refine this' }))
      const drawer = await screen.findByRole('dialog', { name: 'Refine image' })
      expect(within(drawer).getByRole('region', { name: 'Paid image backup' })).toBeInTheDocument()
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
