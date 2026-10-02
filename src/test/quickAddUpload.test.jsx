import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Gallery from '../pages/Gallery'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { clearBlobUrls, keyForUrl } from '../data/blobUrls'
import { STAGED_IMAGES_DB, readOutbox } from '../data/stagedImageStore'
import { backend } from '../backend'

// #110, bug 2, then #115. Quick-add (and the share target, which opens it)
// kept the screenshot as a bare data URL that was never uploaded, so it never
// synced. #119 uploaded it after adding and re-saved the artist; now it is
// staged *before* the artist is added, so the first save already stores its
// key and the photo survives a reload even while the upload is failing.
const SHOT = 'data:image/jpeg;base64,U0hPVA=='
vi.mock('../hooks/useImageUpload', async (importOriginal) => ({
  ...(await importOriginal()),
  compressImages: vi.fn(async () => [SHOT]),
}))
vi.mock('../data/screenshotIntake', () => ({
  analyzeScreenshotWithGemini: vi.fn(async () => null),
}))
vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
}))

const existing = { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: [], images: [], rank: 1, status: 'researching', notes: '', studio: null }

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}

function deleteDb(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

async function quickAdd(handleValue) {
  const file = new File(['x'], 'shot.png', { type: 'image/png' })
  fireEvent.paste(document.body, { clipboardData: { files: [file], types: ['Files'] } })
  const handle = await screen.findByPlaceholderText('@handle or Instagram URL')
  const submit = screen.getByRole('button', { name: 'Add Artist' })
  await waitFor(() => expect(submit).not.toBeDisabled())
  fireEvent.change(handle, { target: { value: handleValue } })
  fireEvent.click(submit)
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb(STAGED_IMAGES_DB)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('quick-add stages its screenshot (#110, #115)', () => {
  it('stages the screenshot before adding the artist, so the first save already maps it to a key', async () => {
    vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'someone@example.com' } }))
    let keyWhenAdded
    const setArtists = vi.fn(() => { keyWhenAdded = keyForUrl(SHOT) })
    render(
      <AuthProvider>
        <Gate>
          <MemoryRouter initialEntries={['/gallery']}>
            <Gallery artists={[existing]} setArtists={setArtists} />
          </MemoryRouter>
        </Gate>
      </AuthProvider>
    )
    await screen.findByRole('heading', { name: 'Artists' })

    await quickAdd('new.artist')

    await waitFor(() => expect(setArtists).toHaveBeenCalledTimes(1))
    const added = setArtists.mock.calls[0][0]([existing]).find((a) => a.id === 'new.artist')
    expect(added.images).toEqual([SHOT])
    expect(keyWhenAdded).toMatch(/^user\/u1\/artists\/new\.artist\//)
    expect(readOutbox().map((e) => e.key)).toEqual([keyWhenAdded])
    // Nothing to re-save: the add itself carried the key.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(setArtists).toHaveBeenCalledTimes(1)
  })

  it('signed out, adds the artist straight away with the screenshot as it is', async () => {
    const setArtists = vi.fn()
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={[existing]} setArtists={setArtists} />
      </MemoryRouter>
    )

    await quickAdd('new.artist')

    expect(setArtists).toHaveBeenCalledTimes(1)
    expect(setArtists.mock.calls[0][0]([existing]).find((a) => a.id === 'new.artist').images).toEqual([SHOT])
    expect(keyForUrl(SHOT)).toBeNull()
    expect(readOutbox()).toEqual([])
  })
})
