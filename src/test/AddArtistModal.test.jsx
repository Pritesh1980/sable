import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import AddArtistModal from '../components/AddArtistModal'

vi.mock('../hooks/useImageUpload', () => ({
  uploadImages: vi.fn(async (files) => files.map((_, i) => `data:image/jpeg;base64,STAGED${i}`)),
  compressImages: vi.fn(async () => ['data:image/jpeg;base64,SHOT']),
}))
vi.mock('../data/screenshotIntake', () => ({
  analyzeScreenshotWithGemini: vi.fn(),
}))
vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map([['/z1.jpg', [1, 0]]])),
}))
vi.mock('../data/taste', () => ({
  buildTasteVector: vi.fn(() => [1, 0]),
}))
const embed = vi.fn(async () => [0.6, 0.8])
vi.mock('../data/embedder', () => ({
  getEmbedder: vi.fn(async () => (url) => embed(url)),
}))
vi.mock('../data/screenshotCrop', async (importOriginal) => ({
  ...(await importOriginal()),
  // jsdom has no canvas and never fires Image load events, so the crop itself
  // is stubbed; the geometry it wraps is unit-tested in screenshotCrop.test.js.
  cropImageToDataUrl: vi.fn(async (dataUrl, box) => (box ? 'data:image/jpeg;base64,CROPPED' : dataUrl)),
}))
import { analyzeScreenshotWithGemini } from '../data/screenshotIntake'
import { cropImageToDataUrl } from '../data/screenshotCrop'
import { uploadImages } from '../hooks/useImageUpload'

const existing = [{ id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1, images: [] }]

function renderModal(props = {}) {
  const setArtists = vi.fn()
  const onClose = vi.fn()
  render(
    <MemoryRouter>
      <AddArtistModal artists={existing} setArtists={setArtists} onClose={onClose} {...props} />
    </MemoryRouter>
  )
  return { setArtists, onClose }
}

function stageImage() {
  const file = new File(['x'], 'shot.png', { type: 'image/png' })
  fireEvent.change(screen.getByLabelText(/choose files/i), { target: { files: [file] } })
}

describe('AddArtistModal screenshot analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  // #24: Instagram chrome was going into both the CLIP vector behind taste-fit
  // and the saved reference image. The intake call now returns the artwork's
  // box and the screenshot is cropped to it on-device.
  describe('cropping to the artwork', () => {
    it('embeds the crop, not the raw screenshot', async () => {
      localStorage.setItem('gemini_api_key', 'test-key')
      analyzeScreenshotWithGemini.mockResolvedValue({
        handle: 'cropme', name: '', tags: [], styleNote: 'Note.',
        crop: { x: 0, y: 0.25, w: 1, h: 0.5 },
      })
      renderModal()
      stageImage()

      await waitFor(() => expect(embed).toHaveBeenCalled())
      expect(cropImageToDataUrl).toHaveBeenCalledWith('data:image/jpeg;base64,SHOT', { x: 0, y: 0.25, w: 1, h: 0.5 })
      expect(embed).toHaveBeenCalledWith('data:image/jpeg;base64,CROPPED')
    })

    it('saves the cropped image rather than the screenshot', async () => {
      localStorage.setItem('gemini_api_key', 'test-key')
      analyzeScreenshotWithGemini.mockResolvedValue({
        handle: 'cropme', name: '', tags: [], styleNote: '',
        crop: { x: 0, y: 0.25, w: 1, h: 0.5 },
      })
      renderModal()
      stageImage()

      await waitFor(() =>
        expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('cropme'))

      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form'))

      await waitFor(() => expect(uploadImages).toHaveBeenCalled())
      const [files] = uploadImages.mock.calls.at(-1)
      // The staged screenshot was swapped for the crop before upload.
      expect(files[0].name).toMatch(/crop/i)
      expect(files[0].type).toBe('image/jpeg')
    })

    it('will not save while the screenshot is still being read', async () => {
      localStorage.setItem('gemini_api_key', 'test-key')
      let release
      analyzeScreenshotWithGemini.mockImplementation(() => new Promise((r) => { release = r }))
      renderModal()
      stageImage()

      await waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled())

      release({ handle: 'late', name: '', tags: [], styleNote: '', crop: null })
      await waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled())
    })

    it('says it cropped, and puts the whole screenshot back on undo', async () => {
      localStorage.setItem('gemini_api_key', 'test-key')
      analyzeScreenshotWithGemini.mockResolvedValue({
        handle: 'cropme', name: '', tags: [], styleNote: '',
        crop: { x: 0, y: 0.25, w: 1, h: 0.5 },
      })
      renderModal()
      stageImage()

      const undo = await screen.findByRole('button', { name: /use the whole screenshot/i })
      fireEvent.click(undo)

      fireEvent.submit(screen.getByRole('button', { name: /^save$/i }).closest('form'))
      await waitFor(() => expect(uploadImages).toHaveBeenCalled())
      const [files] = uploadImages.mock.calls.at(-1)
      // Back to the file the user actually dropped in.
      expect(files[0].name).toBe('shot.png')
    })

    it('falls back to the raw screenshot when no box comes back', async () => {
      localStorage.setItem('gemini_api_key', 'test-key')
      analyzeScreenshotWithGemini.mockResolvedValue({
        handle: 'nobox', name: '', tags: [], styleNote: 'Note.', crop: null,
      })
      renderModal()
      stageImage()

      await waitFor(() => expect(embed).toHaveBeenCalled())
      expect(embed).toHaveBeenCalledWith('data:image/jpeg;base64,SHOT')
    })

    it('scores the raw screenshot, flagged rough, with no key to find the artwork', async () => {
      renderModal()
      stageImage()

      await waitFor(() => expect(embed).toHaveBeenCalledWith('data:image/jpeg;base64,SHOT'))
      await waitFor(() => expect(screen.getByTestId('intake-taste')).toHaveTextContent(/rough/i))
      expect(cropImageToDataUrl).not.toHaveBeenCalled()
    })
  })

  it('analyses the first staged screenshot and prefills handle, name, tags and style note', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({
      handle: 'wall_find',
      name: 'Wall Find',
      tags: ['surrealism'],
      styleNote: 'Dream-logic surrealism in soft black-and-grey.',
    })
    const { setArtists } = renderModal()
    stageImage()

    await waitFor(() =>
      expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('wall_find'))
    expect(analyzeScreenshotWithGemini).toHaveBeenCalledWith('test-key', 'data:image/jpeg;base64,SHOT')
    expect(screen.getByPlaceholderText(/full name/i)).toHaveValue('Wall Find')
    expect(screen.getByDisplayValue(/dream-logic surrealism/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    await waitFor(() => expect(setArtists).toHaveBeenCalled())
    const added = setArtists.mock.calls[0][0](existing).find((a) => a.handle === 'wall_find')
    expect(added.styleNote).toBe('Dream-logic surrealism in soft black-and-grey.')
    expect(added.tags).toContain('surrealism')
  })

  it('shows a taste-fit score for the staged screenshot when the style index exists', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue(null)
    renderModal()
    stageImage()
    const chip = await screen.findByTestId('intake-taste')
    expect(chip).toHaveTextContent(/taste fit \d+%/i)
  })

  it('without a Gemini key: images stage normally, a hint appears, the API is never called', async () => {
    renderModal()
    stageImage()
    expect(await screen.findByText(/add a gemini key/i)).toBeInTheDocument()
    expect(analyzeScreenshotWithGemini).not.toHaveBeenCalled()
    expect(screen.getByAltText(/staged reference 1/i)).toBeInTheDocument()
  })

  it('never overwrites a handle the user already typed', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({ handle: 'ai_guess', name: '', tags: [], styleNote: '' })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value: 'typed_first' } })
    stageImage()
    await waitFor(() => expect(analyzeScreenshotWithGemini).toHaveBeenCalled())
    expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('typed_first')
  })

  it('removing the only staged image re-arms analysis for the next one', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({ handle: '', name: '', tags: [], styleNote: 'note A' })
    renderModal()
    stageImage()
    await waitFor(() => expect(analyzeScreenshotWithGemini).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByLabelText(/remove staged image 1/i))
    // The removed screenshot's extracted note is forgotten…
    expect(screen.queryByDisplayValue('note A')).not.toBeInTheDocument()
    // …and a newly staged image is analysed fresh.
    stageImage()
    await waitFor(() => expect(analyzeScreenshotWithGemini).toHaveBeenCalledTimes(2))
  })

  it('only analyses once — staging more images does not re-fire the API', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue(null)
    renderModal()
    stageImage()
    await waitFor(() => expect(analyzeScreenshotWithGemini).toHaveBeenCalledTimes(1))
    stageImage()
    await new Promise((r) => setTimeout(r, 50))
    expect(analyzeScreenshotWithGemini).toHaveBeenCalledTimes(1)
  })
})

describe('AddArtistModal', () => {
  beforeEach(() => vi.clearAllMocks())

  it('normalises a pasted Instagram URL, applies tags, and saves a new artist in two clicks', async () => {
    const { setArtists, onClose } = renderModal()

    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), {
      target: { value: 'https://www.instagram.com/new_artist/' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'blackwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'dark-fantasy' }))
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(setArtists).toHaveBeenCalled())
    const next = setArtists.mock.calls[0][0](existing)
    const added = next.find((a) => a.handle === 'new_artist')
    expect(added).toMatchObject({ handle: 'new_artist', tags: ['blackwork', 'dark-fantasy'] })
    expect(onClose).toHaveBeenCalled()
  })

  it('requires a handle before saving', () => {
    const { setArtists } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))
    expect(setArtists).not.toHaveBeenCalled()
    expect(screen.getByText(/handle is required/i)).toBeInTheDocument()
  })

  it('stamps addedAt on any staged images and attaches them to the saved artist', async () => {
    const { setArtists } = renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value: 'brand_new' } })

    const file = new File(['x'], 'ref.jpg', { type: 'image/jpeg' })
    const fileInput = screen.getByLabelText(/choose files/i)
    fireEvent.change(fileInput, { target: { files: [file] } })

    // Saving is held until the screenshot has been read and (if it can be)
    // cropped, so the stored image is the one the crop produced.
    await waitFor(() => expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(setArtists).toHaveBeenCalled())
    const next = setArtists.mock.calls[0][0](existing)
    const added = next.find((a) => a.handle === 'brand_new')
    expect(added.images).toHaveLength(1)
    expect(added.images[0]).toMatchObject({ url: 'data:image/jpeg;base64,STAGED0' })
    expect(added.images[0].addedAt).toBeTruthy()
  })

  it('offers to add images to the existing artist instead of creating a duplicate', async () => {
    const { setArtists, onClose } = renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value: '@Zoia.Ink' } })

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
    const offer = screen.getByRole('button', { name: /add images to.*instead/i })
    fireEvent.click(offer)

    // No new artist is ever created for a duplicate handle — the guard routes
    // to the existing artist instead.
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    if (setArtists.mock.calls.length) {
      const next = setArtists.mock.calls[0][0](existing)
      expect(next).toHaveLength(existing.length)
    }
  })

  it('renders a Full manage view link that also closes the modal', () => {
    const onManage = vi.fn()
    renderModal({ onManage })
    fireEvent.click(screen.getByText(/full manage view/i))
    expect(onManage).toHaveBeenCalled()
  })

  it('closes without saving via Cancel', () => {
    const { setArtists, onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(setArtists).not.toHaveBeenCalled()
  })
})
