import { useEffect, useState } from 'react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { UndoProvider } from '../context/UndoContext'
import { clearBlobUrls } from '../data/blobUrls'
import Brief from '../pages/Brief'

// Key-first identity (#114). An idea photo whose url has not resolved yet is
// stored as { url: '', key }. Identity, note edits and list keys used to read
// `.url` first, so every unresolved photo was the same photo to them: a note
// typed on one landed on all, and the list rendered duplicate React keys.

vi.mock('../data/screenshotIntake', () => ({ analyzeIdeaImageWithGemini: vi.fn() }))

const seed = [
  {
    id: 'i1',
    title: 'Idea',
    description: '',
    tags: [],
    placement: '',
    images: [
      { url: '', note: '', key: 'user/u1/a.jpg' },
      { url: '', note: '', key: 'user/u1/b.jpg' },
    ],
    linkedArtists: [],
    status: 'idea',
  },
]

let lastIdeas = []

function Harness() {
  const [ideas, setIdeas] = useState(seed)
  useEffect(() => {
    lastIdeas = ideas
  }, [ideas])
  return (
    <MemoryRouter initialEntries={['/brief']}>
      <UndoProvider>
        <Brief ideas={ideas} setIdeas={setIdeas} artists={[]} />
      </UndoProvider>
    </MemoryRouter>
  )
}

const modalSheet = () => document.querySelector('.fixed.inset-0.z-50')
const openComposer = () => fireEvent.click(screen.getByRole('heading', { name: 'Idea' }))

beforeEach(() => clearBlobUrls())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('two unresolved idea photos stay distinct (#114)', () => {
  it('puts a note typed on one photo on that photo only', () => {
    render(<Harness />)
    openComposer()
    const notes = within(modalSheet()).getAllByPlaceholderText('What to borrow from this image…')
    fireEvent.change(notes[1], { target: { value: 'the linework' } })
    fireEvent.click(within(modalSheet()).getByText('Save'))

    expect(lastIdeas[0].images.map((i) => i.note)).toEqual(['', 'the linework'])
  })

  it('renders the photo list without duplicate React keys', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<Harness />)
    openComposer()
    const duplicate = error.mock.calls.filter((args) => /same key/i.test(String(args[0])))
    expect(duplicate).toEqual([])
  })

  it('removes only the photo that was tapped', () => {
    render(<Harness />)
    openComposer()
    fireEvent.click(within(modalSheet()).getAllByLabelText('Remove photo')[0])
    fireEvent.click(within(modalSheet()).getByText('Save'))

    expect(lastIdeas[0].images.map((i) => i.key)).toEqual(['user/u1/b.jpg'])
  })
})
