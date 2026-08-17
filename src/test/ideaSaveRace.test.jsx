import { useEffect, useState } from 'react'
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { UndoProvider } from '../context/UndoContext'
import Brief from '../pages/Brief'

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
  })
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
