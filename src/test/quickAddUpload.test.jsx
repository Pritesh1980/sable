import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Gallery from '../pages/Gallery'
import { uploadInlineImages } from '../hooks/useImageUpload'

// #110, bug 2. Quick-add (and the share target, which opens it) kept the
// screenshot as a bare data URL that was never uploaded, so it never synced.
const SHOT = 'data:image/jpeg;base64,SHOT'
vi.mock('../hooks/useImageUpload', () => ({
  compressImages: vi.fn(async () => [SHOT]),
  uploadInlineImages: vi.fn(async () => 1),
}))
vi.mock('../data/screenshotIntake', () => ({
  analyzeScreenshotWithGemini: vi.fn(async () => null),
}))
vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
}))

const existing = { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: [], images: [], rank: 1, status: 'researching', notes: '', studio: null }

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('quick-add uploads its screenshot (#110)', () => {
  it('adds the artist at once, uploads the screenshot, then re-saves it so the flush maps it to a key', async () => {
    const setArtists = vi.fn()
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={[existing]} setArtists={setArtists} />
      </MemoryRouter>
    )
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.paste(document.body, { clipboardData: { files: [file], types: ['Files'] } })
    const handle = await screen.findByPlaceholderText('@handle or Instagram URL')
    const submit = screen.getByRole('button', { name: 'Add Artist' })
    await waitFor(() => expect(submit).not.toBeDisabled())

    fireEvent.change(handle, { target: { value: 'new.artist' } })
    fireEvent.click(submit)

    expect(setArtists).toHaveBeenCalledTimes(1)
    const added = setArtists.mock.calls[0][0]([existing]).find((a) => a.id === 'new.artist')
    expect(added.images).toEqual([SHOT])
    expect(uploadInlineImages).toHaveBeenCalledWith([SHOT], expect.objectContaining({ scope: 'artists', id: 'new.artist' }))

    await waitFor(() => expect(setArtists).toHaveBeenCalledTimes(2))
    const [resaved] = setArtists.mock.calls[1][0]([added])
    expect(resaved).not.toBe(added)
    expect(resaved).toEqual(added)
  })

  it('does not re-save when nothing needed uploading', async () => {
    uploadInlineImages.mockResolvedValueOnce(0)
    const setArtists = vi.fn()
    render(
      <MemoryRouter initialEntries={['/gallery']}>
        <Gallery artists={[existing]} setArtists={setArtists} />
      </MemoryRouter>
    )
    const file = new File(['x'], 'shot.png', { type: 'image/png' })
    fireEvent.paste(document.body, { clipboardData: { files: [file], types: ['Files'] } })
    const handle = await screen.findByPlaceholderText('@handle or Instagram URL')
    const submit = screen.getByRole('button', { name: 'Add Artist' })
    await waitFor(() => expect(submit).not.toBeDisabled())
    fireEvent.change(handle, { target: { value: 'new.artist' } })
    fireEvent.click(submit)

    await waitFor(() => expect(uploadInlineImages).toHaveBeenCalled())
    await new Promise((r) => setTimeout(r, 20))
    expect(setArtists).toHaveBeenCalledTimes(1)
  })
})
