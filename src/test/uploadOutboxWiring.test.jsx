import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { stageImage } from '../data/imageStaging'
import { STAGED_IMAGES_DB, readOutbox } from '../data/stagedImageStore'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

// #115. The app itself retries photos still waiting to upload — at launch, for
// photos staged in an earlier session, and whenever the browser reports it is
// back online — not only when the next edit happens to flush.

const PHOTO = 'data:image/jpeg;base64,cXVldWVkIHBob3Rv'

function deleteDb(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

function renderApp() {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    </AuthProvider>
  )
}

// A photo staged in an earlier session whose upload never landed.
async function stageWhileUploadsFail() {
  const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
  const { key } = await stageImage(PHOTO, { userId: 'u1', scope: 'artists', id: 'a1' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  return { key, upload }
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb(STAGED_IMAGES_DB)
  await deleteDb('tattoo-blobs-v1')
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'someone@example.com' } }))
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('the app retries queued photo uploads (#115)', () => {
  it('at launch', async () => {
    const { key, upload } = await stageWhileUploadsFail()
    upload.mockRestore()

    renderApp()

    await waitFor(async () => expect(await backend.blobs.getUrl(key)).toBe(PHOTO))
    expect(readOutbox()).toEqual([])
  })

  it('when the browser comes back online', async () => {
    const { key, upload } = await stageWhileUploadsFail()
    renderApp()
    await screen.findByText('Sable')
    // Once when staged, once more at launch — still failing.
    await waitFor(() => expect(upload.mock.calls.length).toBeGreaterThanOrEqual(2))
    await new Promise((resolve) => setTimeout(resolve, 20))
    upload.mockRestore()

    window.dispatchEvent(new Event('online'))

    await waitFor(async () => expect(await backend.blobs.getUrl(key)).toBe(PHOTO))
    expect(readOutbox()).toEqual([])
  })
})
