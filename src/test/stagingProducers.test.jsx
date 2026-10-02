import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { UndoProvider } from '../context/UndoContext'
import { useStorage } from '../hooks/useStorage'
import { ideasCodec, conceptsCodec } from '../data/imageCodec'
import { buildPromptPackFromFreeText } from '../data/promptPacks'
import { STAGED_IMAGES_DB, readOutbox } from '../data/stagedImageStore'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'
import Brief from '../pages/Brief'
import Concepts from '../pages/Concepts'

// #115. Every way a photo enters a synced collection stages it first, so the
// record caches and syncs its { key } from the very first save — never the
// base64 — and the bytes wait on this device until the upload lands.

const ATTACHED = 'data:image/jpeg;base64,YXR0YWNoZWQ='
const GENERATED = 'data:image/png;base64,Z2VuZXJhdGVk'
const SNAPSHOT = 'data:image/jpeg;base64,c25hcHNob3Q='

vi.mock('../hooks/useImageUpload', async (importOriginal) => ({
  ...(await importOriginal()),
  compressImages: vi.fn(async () => [ATTACHED]),
}))
vi.mock('../data/geminiImage', () => ({
  generateImageWithGemini: vi.fn(async () => GENERATED),
}))
vi.mock('../components/LiveTryOn', () => ({
  default: ({ onSave, onClose }) => (
    <button
      type="button"
      onClick={() => {
        onSave({ provider: 'other', title: 'Live try-on', imageUrl: SNAPSHOT, notes: '' })
        onClose()
      }}
    >
      Take snapshot
    </button>
  ),
}))

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}

function renderSignedIn(ui) {
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'someone@example.com' } }))
  watchLocalStorageWrites()
  return render(<AuthProvider><Gate><MemoryRouter>{ui}</MemoryRouter></Gate></AuthProvider>)
}

function BriefApp() {
  const [ideas, setIdeas] = useStorage('tattoo_ideas', [], ideasCodec)
  return <UndoProvider><Brief ideas={ideas} setIdeas={setIdeas} artists={[]} /></UndoProvider>
}

function ConceptsApp() {
  const [concepts, setConcepts] = useStorage('tattoo_concepts', [], conceptsCodec)
  return <Concepts concepts={concepts} setConcepts={setConcepts} artists={[]} ideas={[]} />
}

const stored = (key) => JSON.parse(localStorage.getItem(key) || '[]')
const outboxKeys = () => readOutbox().map((entry) => entry.key)
// Lets the first pull land before the test starts editing.
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))

// Every localStorage write from here on, so a test can check that base64 was
// never written at all — not merely that it is gone by the end, once a later
// flush has re-saved the record.
let writes = []
function watchLocalStorageWrites() {
  writes = []
  const setItem = localStorage.setItem.bind(localStorage)
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    writes.push([key, String(value)])
    return setItem(key, value)
  })
}

function expectBase64NeverWritten() {
  expect(writes.length).toBeGreaterThan(0)
  expect(writes.filter(([, value]) => /data:|;base64,/.test(value)).map(([key]) => key)).toEqual([])
}

function deleteDb(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb(STAGED_IMAGES_DB)
  // Uploads fail throughout, so a staged photo stays visibly queued.
  vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('Brief attachments', () => {
  it('a photo attached to an idea is staged, so the saved idea stores its key', async () => {
    localStorage.setItem('tattoo_ideas', JSON.stringify([
      { id: 'i1', title: 'Moth', description: '', tags: [], placement: '', images: [], linkedArtists: [], status: 'idea', updatedAt: '2026-09-01T10:00:00.000Z' },
    ]))
    renderSignedIn(<BriefApp />)
    fireEvent.click(await screen.findByText('Moth'))
    await settle()

    fireEvent.change(document.querySelector('input[type="file"]'), {
      target: { files: [new File(['x'], 'ref.jpg', { type: 'image/jpeg' })] },
    })
    await waitFor(() => expect(document.querySelector(`img[src="${ATTACHED}"]`)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(stored('tattoo_ideas')[0].images).toEqual([
      { key: expect.stringMatching(/^user\/u1\/ideas\/i1\//), note: '' },
    ]))
    expect(outboxKeys()).toEqual([stored('tattoo_ideas')[0].images[0].key])
    expectBase64NeverWritten()
  })

  it('a data URL pasted as an image link is staged too', async () => {
    localStorage.setItem('tattoo_ideas', JSON.stringify([
      { id: 'i1', title: 'Moth', description: '', tags: [], placement: '', images: [], linkedArtists: [], status: 'idea', updatedAt: '2026-09-01T10:00:00.000Z' },
    ]))
    renderSignedIn(<BriefApp />)
    fireEvent.click(await screen.findByText('Moth'))
    await settle()

    fireEvent.change(screen.getByPlaceholderText('Paste image URL…'), { target: { value: ATTACHED } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(document.querySelector(`img[src="${ATTACHED}"]`)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(stored('tattoo_ideas')[0].images).toEqual([
      { key: expect.stringMatching(/^user\/u1\/ideas\/i1\//), note: '' },
    ]))
    expectBase64NeverWritten()
  })
})

describe('Brief Save while a photo is still staging', () => {
  it('waits for the staging to finish instead of saving the idea without the photo', async () => {
    localStorage.setItem('tattoo_ideas', JSON.stringify([
      { id: 'i1', title: 'Moth', description: '', tags: [], placement: '', images: [], linkedArtists: [], status: 'idea', updatedAt: '2026-09-01T10:00:00.000Z' },
    ]))
    renderSignedIn(<BriefApp />)
    fireEvent.click(await screen.findByText('Moth'))
    await settle()

    fireEvent.change(screen.getByPlaceholderText('Paste image URL…'), { target: { value: ATTACHED } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    // Staging is asynchronous: until it lands the draft has no photo, so a
    // Save now would silently drop it.
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stored('tattoo_ideas')[0].images).toHaveLength(1))
  })
})

describe('Concepts', () => {
  it('a generated image is staged before the concept is saved', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    renderSignedIn(<ConceptsApp />)
    fireEvent.click((await screen.findAllByRole('button', { name: '+ New concept' }))[0])
    await settle()
    fireEvent.change(screen.getByLabelText('Your idea'), { target: { value: 'A moth study' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate image' }))

    await waitFor(() => expect(stored('tattoo_concepts')[0]?.imageUrl).toMatch(/^user\/u1\/concepts\//))
    const concept = stored('tattoo_concepts')[0]
    expect(concept.imageUrl.startsWith(`user/u1/concepts/${concept.id}/`)).toBe(true)
    expect(outboxKeys()).toEqual([concept.imageUrl])
    expectBase64NeverWritten()
  })

  it('a pasted-back image is staged before the concept is saved', async () => {
    renderSignedIn(<ConceptsApp />)
    fireEvent.click((await screen.findAllByRole('button', { name: '+ New concept' }))[0])
    await settle()
    fireEvent.change(screen.getByLabelText('Your idea'), { target: { value: 'A moth study' } })
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [new File(['moth'], 'result.png', { type: 'image/png' })] },
    })

    await waitFor(() => expect(stored('tattoo_concepts')[0]?.imageUrl).toMatch(/^user\/u1\/concepts\//))
    expect(outboxKeys()).toEqual([stored('tattoo_concepts')[0].imageUrl])
    expectBase64NeverWritten()
  })

  it('a result image added as a variant is staged under its concept', async () => {
    const pack = buildPromptPackFromFreeText('Moth shoulder piece', { createdAt: '2026-09-01T10:00:00.000Z' })
    localStorage.setItem('tattoo_concepts', JSON.stringify([{
      id: 'c1', prompt: pack.sourceSummary, promptPack: pack, imageUrl: '', response: '', tags: [],
      createdAt: pack.createdAt, updatedAt: '2026-09-01T10:00:00.000Z',
    }]))
    renderSignedIn(<ConceptsApp />)
    fireEvent.click(await screen.findByRole('button', { name: `Add result to ${pack.sourceSummary}` }))
    await settle()
    fireEvent.change(screen.getByLabelText('Image URL'), { target: { value: ATTACHED } })
    fireEvent.click(screen.getByRole('button', { name: `Save result for ${pack.sourceSummary}` }))

    await waitFor(() => expect(stored('tattoo_concepts')[0].variants?.[0]?.imageUrl).toMatch(/^user\/u1\/concepts\/c1\//))
    expect(outboxKeys()).toEqual([stored('tattoo_concepts')[0].variants[0].imageUrl])
    expectBase64NeverWritten()
  })

  it('a try-on snapshot saved as a variant is staged under its concept', async () => {
    localStorage.setItem('tattoo_concepts', JSON.stringify([{
      id: 'c1', prompt: 'Raven chest tattoo', imageUrl: '', response: '', tags: [],
      createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
      variants: [{
        id: 'v1', provider: 'chatgpt', title: 'Relief candidate', imageUrl: 'https://example.com/relief.png',
        response: '', notes: '', rating: 4, isBest: false, createdAt: '2026-09-01T10:00:00.000Z',
      }],
    }]))
    renderSignedIn(<ConceptsApp />)
    fireEvent.click(await screen.findByRole('button', { name: 'Expand Relief candidate result for Raven chest tattoo' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: 'Try Relief candidate result for Raven chest tattoo on skin' }))
    const drawer = screen.getByRole('dialog', { name: 'Try on skin' })
    fireEvent.click(within(drawer).getByRole('button', { name: /live camera/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Take snapshot' }))

    await waitFor(() => expect(stored('tattoo_concepts')[0].variants).toHaveLength(2))
    const snapshot = stored('tattoo_concepts')[0].variants.find((v) => v.title === 'Live try-on')
    expect(snapshot.imageUrl).toMatch(/^user\/u1\/concepts\/c1\//)
    expect(outboxKeys()).toEqual([snapshot.imageUrl])
    expectBase64NeverWritten()
  })
})
