import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { UndoProvider } from '../context/UndoContext'
import Brief from '../pages/Brief'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

// Idea state holds stored refs (#117), so every surface that shows an idea
// photo meets a `{ key }`: one whose bytes load, and one whose bytes can't be
// fetched right now.

vi.mock('../components/ReliefPreview', () => ({ default: () => null }))
const analyze = vi.fn()
vi.mock('../data/screenshotIntake', async (importOriginal) => ({
  ...(await importOriginal()),
  analyzeIdeaImageWithGemini: (...args) => analyze(...args),
}))

const HERE = 'user/u1/ideas/i1/here.jpg'
const GONE = 'user/u1/ideas/i1/gone.jpg'
const PHOTO = 'data:image/jpeg;base64,QUJD'

const idea = (images) => ({ id: 'i1', title: 'Moth sternum', description: '', tags: [], placement: '', images, linkedArtists: [], status: 'idea' })

function Harness({ ideas: initial, boards = [], path = '/brief' }) {
  const [ideas, setIdeas] = useState(initial)
  return (
    <MemoryRouter initialEntries={[path]}>
      <UndoProvider>
        <Brief ideas={ideas} setIdeas={setIdeas} artists={[]} boards={boards} setBoards={() => {}} />
      </UndoProvider>
    </MemoryRouter>
  )
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  analyze.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await backend.blobs.upload('u1', HERE, PHOTO, 'image/jpeg')
  const realGetUrl = backend.blobs.getUrl.bind(backend.blobs)
  vi.spyOn(backend.blobs, 'getUrl').mockImplementation((key) => (
    key === GONE ? Promise.reject(new Error('offline')) : realGetUrl(key)
  ))
})
afterEach(() => vi.restoreAllMocks())

describe('idea photos resolve where they render', () => {
  it('the composer shows a keyed photo once it resolves and an offline tile for one it cannot fetch', async () => {
    const { container } = render(<Harness ideas={[idea([{ key: HERE, note: '' }, { key: GONE, note: '' }])]} />)
    fireEvent.click(screen.getByText('Moth sternum'))

    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).toBeInTheDocument())
    expect(await screen.findByRole('img', { name: 'Photo available when online' })).toBeInTheDocument()
    expect(container.querySelector('img[src*="user/u1"]')).not.toBeInTheDocument()
    // Both photos keep their own remove and 3D-print controls.
    expect(screen.getAllByRole('button', { name: 'Remove photo' })).toHaveLength(2)
  })

  it('hands the relief drawer a keyed photo it can resolve', async () => {
    render(<Harness ideas={[idea([{ key: HERE, note: '' }])]} />)
    fireEvent.click(screen.getByText('Moth sternum'))
    fireEvent.click(screen.getByRole('button', { name: '3D print reference 1' }))

    const drawer = screen.getByRole('dialog', { name: 'Make Relief STL' })
    await waitFor(() => (
      expect(within(drawer).getByAltText('Moth sternum reference 1 STL source')).toHaveAttribute('src', PHOTO)
    ))
  })

  it('fills an idea from a saved photo, reading its bytes by key', async () => {
    localStorage.setItem('gemini_api_key', 'k')
    analyze.mockResolvedValue({ title: 'Moth', description: 'A moth', tags: [], placement: '' })
    render(<Harness ideas={[idea([{ key: HERE, note: '' }])]} />)
    fireEvent.click(screen.getByText('Moth sternum'))
    fireEvent.click(screen.getByRole('button', { name: 'Fill idea from image' }))

    await waitFor(() => expect(analyze).toHaveBeenCalled())
    expect(analyze.mock.calls[0][1]).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('says so when the saved photo cannot be read, and sends nothing', async () => {
    localStorage.setItem('gemini_api_key', 'k')
    render(<Harness ideas={[idea([{ key: GONE, note: '' }])]} />)
    fireEvent.click(screen.getByText('Moth sternum'))
    fireEvent.click(screen.getByRole('button', { name: 'Fill idea from image' }))

    expect(await screen.findByText('That photo is not available right now.')).toBeInTheDocument()
    expect(analyze).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Fill idea from image' })).toBeEnabled()
  })

  it('a board cover taken from a keyed idea photo resolves, never showing the key', async () => {
    const boards = [{ id: 'b1', name: 'Sleeve', description: '', cover: '', ideaIds: ['i1'] }]
    const { container } = render(<Harness ideas={[idea([{ key: HERE, note: '' }])]} boards={boards} path="/brief?tab=boards" />)
    expect(await screen.findByText('Sleeve')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).toBeInTheDocument())
    expect(container.querySelector('img[src*="user/u1"]')).not.toBeInTheDocument()
  })
})
