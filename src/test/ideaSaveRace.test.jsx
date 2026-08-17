import { useEffect, useState } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { UndoProvider } from '../context/UndoContext'
import Brief from '../pages/Brief'

vi.mock('../data/screenshotIntake', () => ({
  analyzeIdeaImageWithGemini: vi.fn(),
}))
const { analyzeIdeaImageWithGemini } = await import('../data/screenshotIntake')

// #63. IdeaModal copies the idea into local `draft` state on mount and never
// reconciles it. Saving always sent the whole draft, so anything that changed
// the idea in `ideas` while the modal was open — a restore handed off by an
// earlier composer's Undo (#57), a sync landing — was invisible to `draft` and
// got silently overwritten on save.
//
// Fixed the same way as #79: onSave now carries (id, patch) built from only
// the fields the user actually touched in *this* composer session, resolved
// by Brief.saveIdea against whatever is latest in `ideas` at commit time. A
// field nobody touched in this session is never in the patch, so an external
// change to it survives regardless of when it landed relative to this save.

const seedWithTag = [
  { id: 'i1', title: 'Old title', description: '', tags: ['fine-line'], placement: '', images: [], linkedArtists: [], status: 'idea' },
]

const seedWithPhoto = [
  { id: 'i1', title: 'Idea', description: '', tags: [], placement: '', images: [{ url: 'photo.jpg', note: '' }], linkedArtists: [], status: 'idea' },
]

let lastIdeas = []
let lastSetIdeas = () => {}

function Harness({ seed }) {
  const [ideas, setIdeas] = useState(seed)
  useEffect(() => {
    lastIdeas = ideas
    lastSetIdeas = setIdeas
  }, [ideas])
  return (
    <MemoryRouter initialEntries={['/brief']}>
      <UndoProvider>
        <Brief ideas={ideas} setIdeas={setIdeas} artists={[]} />
      </UndoProvider>
    </MemoryRouter>
  )
}

function modalSheet() {
  return document.querySelector('.fixed.inset-0.z-50')
}

afterEach(() => cleanup())

describe('a field an external change lands on survives an unrelated save (#63)', () => {
  it('keeps a tag added while the composer was open, editing only the title', async () => {
    render(<Harness seed={seedWithTag} />)
    fireEvent.click(screen.getByText('Old title'))

    fireEvent.change(within(modalSheet()).getByPlaceholderText('Idea title…'), {
      target: { value: 'New title' },
    })

    // A change lands in the underlying record while the composer is still
    // open and has never touched tags — e.g. a restore handed off elsewhere,
    // or a sync reconciliation.
    act(() => {
      lastSetIdeas((prev) =>
        prev.map((i) => (i.id === 'i1' ? { ...i, tags: [...i.tags, 'blackwork'] } : i))
      )
    })

    fireEvent.click(within(modalSheet()).getByText('Save'))

    expect(lastIdeas[0].title).toBe('New title')
    expect(lastIdeas[0].tags).toEqual(expect.arrayContaining(['fine-line', 'blackwork']))
  })
})

describe('a photo restored after saving survives a save from a reopened composer (#63)', () => {
  it('keeps the restored photo when the reopened composer never touched images', async () => {
    render(<Harness seed={seedWithPhoto} />)

    // Composer A: remove the photo, then save — the removal becomes durable
    // and its undo offer is handed off to the saved record (#57).
    fireEvent.click(screen.getByRole('heading', { name: 'Idea' }))
    fireEvent.click(within(modalSheet()).getByLabelText('Remove photo'))
    fireEvent.click(within(modalSheet()).getByText('Save'))

    expect(lastIdeas[0].images).toHaveLength(0)

    // Reopen the same idea in a fresh composer instance B — its draft starts
    // from the record as it now stands, with no photo.
    fireEvent.click(screen.getByRole('heading', { name: 'Idea' }))

    // Undo the removal from A. It writes into `ideas` directly (B's draft was
    // already snapshotted before this).
    fireEvent.click(screen.getByText('Undo'))
    expect(lastIdeas[0].images).toHaveLength(1)

    // B never touched images — editing only the description — then saves.
    fireEvent.change(within(modalSheet()).getByPlaceholderText('Describe the concept, mood, imagery…'), {
      target: { value: 'a description' },
    })
    fireEvent.click(within(modalSheet()).getByText('Save'))

    expect(lastIdeas[0].description).toBe('a description')
    expect(lastIdeas[0].images).toHaveLength(1)
  })
})

describe('a concurrent delete does not resurrect a corrupted partial record (#63 review)', () => {
  it('drops the save rather than appending an id-less record', async () => {
    render(<Harness seed={seedWithTag} />)
    fireEvent.click(screen.getByText('Old title'))

    // The record this composer is editing is deleted from underneath it —
    // e.g. a sync landing a tombstone.
    act(() => {
      lastSetIdeas((prev) => prev.filter((i) => i.id !== 'i1'))
    })

    fireEvent.change(within(modalSheet()).getByPlaceholderText('Idea title…'), {
      target: { value: 'New title' },
    })
    fireEvent.click(within(modalSheet()).getByText('Save'))

    // Resurrecting from just the touched-field patch would append a record
    // with a title and nothing else — no id, no tags, no images. The correct
    // outcome is that a patch save against a gone record is dropped.
    expect(lastIdeas).toHaveLength(0)
  })
})

describe('AI image analysis only touches the fields it actually changed (#63 review)', () => {
  it('does not revert a concurrent title change when analysis left the title alone', async () => {
    vi.stubGlobal('localStorage', {
      ...localStorage,
      getItem: (key) => (key === 'gemini_api_key' ? 'test-key' : localStorage.getItem(key)),
    })
    analyzeIdeaImageWithGemini.mockResolvedValue({
      title: '', // existing title is non-empty, so this is a no-op fill
      description: 'AI-drafted description',
      tags: [],
      placement: '',
    })
    const seed = [{
      id: 'i1', title: 'Existing title', description: '', tags: [], placement: '',
      images: [{ url: 'data:image/png;base64,xyz', note: '' }], linkedArtists: [], status: 'idea',
    }]

    render(<Harness seed={seed} />)
    fireEvent.click(screen.getByRole('heading', { name: 'Existing title' }))
    fireEvent.click(within(modalSheet()).getByText('Fill idea from image'))
    await waitFor(() => expect(analyzeIdeaImageWithGemini).toHaveBeenCalled())

    // A sync lands a title change while the (no-op-for-title) analysis is
    // still the only thing this composer has touched on that field.
    act(() => {
      lastSetIdeas((prev) =>
        prev.map((i) => (i.id === 'i1' ? { ...i, title: 'Synced title' } : i))
      )
    })

    await waitFor(() =>
      expect(within(modalSheet()).getByPlaceholderText('Describe the concept, mood, imagery…').value)
        .toBe('AI-drafted description')
    )
    fireEvent.click(within(modalSheet()).getByText('Save'))

    expect(lastIdeas[0].title).toBe('Synced title')
    expect(lastIdeas[0].description).toBe('AI-drafted description')
  })
})
