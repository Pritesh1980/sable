import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuickAddArtist from '../components/QuickAddArtist'
import { analyzeScreenshotWithGemini } from '../data/screenshotIntake'

// The screenshot pipeline is fully mocked: jsdom can't run FileReader+Image
// compression, network calls, or the on-device embedder.
vi.mock('../hooks/useImageUpload', () => ({
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
const embed = vi.fn(async () => [0.8, 0.6])
vi.mock('../data/embedder', () => ({
  getEmbedder: vi.fn(async () => (url) => embed(url)),
}))
vi.mock('../data/screenshotCrop', async (importOriginal) => ({
  ...(await importOriginal()),
  // jsdom has no canvas; the geometry is unit-tested in screenshotCrop.test.js.
  cropImageToDataUrl: vi.fn(async (dataUrl, box) => (box ? 'data:image/jpeg;base64,CROPPED' : dataUrl)),
}))
import { cropImageToDataUrl } from '../data/screenshotCrop'

function chooseScreenshot() {
  const file = new File(['x'], 'shot.png', { type: 'image/png' })
  fireEvent.change(screen.getByTestId('screenshot-input'), { target: { files: [file] } })
}

const existing = [{ id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1 }]

function renderModal({ onAdd = vi.fn(), onClose = vi.fn() } = {}) {
  render(<QuickAddArtist artists={existing} onAdd={onAdd} onClose={onClose} />)
  return { onAdd, onClose }
}

// A screenshot arriving from the OS share sheet must take exactly the same
// intake path as one the user picked by hand — compress, analyse, score.
describe('QuickAddArtist initialFile (shared screenshot)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('runs intake on a file handed in at mount', async () => {
    localStorage.setItem('gemini_api_key', 'k')
    analyzeScreenshotWithGemini.mockResolvedValue({
      handle: 'shared_artist', name: '', tags: [], styleNote: '',
    })

    render(
      <QuickAddArtist
        artists={existing}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        initialFile={new File(['x'], 'shared.png', { type: 'image/png' })}
      />
    )

    await waitFor(() => expect(analyzeScreenshotWithGemini).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      expect(screen.getByDisplayValue('shared_artist')).toBeInTheDocument()
    })
  })

  it('does nothing extra when mounted without one', async () => {
    render(<QuickAddArtist artists={existing} onAdd={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(analyzeScreenshotWithGemini).not.toHaveBeenCalled())
  })

  it('ignores a non-image handed in by a share sheet', async () => {
    localStorage.setItem('gemini_api_key', 'k')
    render(
      <QuickAddArtist
        artists={existing}
        onAdd={vi.fn()}
        onClose={vi.fn()}
        initialFile={new File(['x'], 'note.txt', { type: 'text/plain' })}
      />
    )
    await waitFor(() => expect(analyzeScreenshotWithGemini).not.toHaveBeenCalled())
  })
})

describe('QuickAddArtist screenshot intake', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('analyses a screenshot with the Gemini key and prefills the form', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({
      handle: 'fresh_ink',
      name: 'Fresh Ink',
      tags: ['blackwork'],
      styleNote: 'Bold brush blackwork.',
    })
    const { onAdd } = renderModal()
    chooseScreenshot()

    await waitFor(() => expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('fresh_ink'))
    expect(analyzeScreenshotWithGemini).toHaveBeenCalledWith('test-key', 'data:image/jpeg;base64,SHOT')
    expect(screen.getByPlaceholderText(/full name/i)).toHaveValue('Fresh Ink')
    expect(screen.getByDisplayValue('Bold brush blackwork.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    expect(onAdd).toHaveBeenCalledWith({
      handle: 'fresh_ink',
      name: 'Fresh Ink',
      tags: ['blackwork'],
      status: 'researching',
      images: ['data:image/jpeg;base64,SHOT'],
      styleNote: 'Bold brush blackwork.',
    })
  })

  it('shows the taste-fit score for the screenshot when a style index exists', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue(null)
    renderModal()
    chooseScreenshot()
    const chip = await screen.findByTestId('intake-taste')
    expect(chip).toHaveTextContent(/taste fit \d+%/i)
  })

  it('without a Gemini key: attaches the screenshot, hints at AI setup, never calls the API', async () => {
    const { onAdd } = renderModal()
    chooseScreenshot()
    expect(await screen.findByText(/add a gemini key/i)).toBeInTheDocument()
    expect(analyzeScreenshotWithGemini).not.toHaveBeenCalled()

    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value: 'manual_handle' } })
    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ handle: 'manual_handle', images: ['data:image/jpeg;base64,SHOT'] })
    )
  })

  it('discards a superseded analysis: the fields always match the attached screenshot', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    let resolveA
    analyzeScreenshotWithGemini
      .mockImplementationOnce(() => new Promise((res) => { resolveA = res })) // shot A, slow
      .mockResolvedValueOnce({ handle: 'shot_b', name: '', tags: [], styleNote: '' }) // shot B, fast
    renderModal()
    chooseScreenshot()
    await waitFor(() => expect(analyzeScreenshotWithGemini).toHaveBeenCalledTimes(1))
    chooseScreenshot()
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('shot_b'))
    // A's late result must not clobber B's prefill.
    resolveA({ handle: 'shot_a', name: 'Stale A', tags: [], styleNote: 'stale note' })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('shot_b')
    expect(screen.queryByDisplayValue('stale note')).not.toBeInTheDocument()
  })

  it('keeps user-typed values: analysis never overwrites a non-empty handle', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({ handle: 'ai_guess', name: '', tags: [], styleNote: 'x' })
    renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), { target: { value: 'typed_first' } })
    chooseScreenshot()
    await waitFor(() => expect(analyzeScreenshotWithGemini).toHaveBeenCalled())
    expect(screen.getByPlaceholderText(/handle or instagram url/i)).toHaveValue('typed_first')
  })
})

describe('QuickAddArtist', () => {
  it('adds an artist from a pasted Instagram URL with tags and status in one step', () => {
    const { onAdd, onClose } = renderModal()

    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), {
      target: { value: 'https://www.instagram.com/new_artist/' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'blackwork' }))
    fireEvent.click(screen.getByRole('button', { name: 'dark-fantasy' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'shortlisted' } })
    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))

    expect(onAdd).toHaveBeenCalledWith({
      handle: 'new_artist',
      name: '',
      tags: ['blackwork', 'dark-fantasy'],
      status: 'shortlisted',
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('rejects an empty handle with an error', () => {
    const { onAdd } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/handle is required/i)).toBeInTheDocument()
  })

  it('rejects a duplicate handle with an error', () => {
    const { onAdd } = renderModal()
    fireEvent.change(screen.getByPlaceholderText(/handle or instagram url/i), {
      target: { value: '@Zoia.Ink' },
    })
    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    expect(onAdd).not.toHaveBeenCalled()
    expect(screen.getByText(/already in your collection/i)).toBeInTheDocument()
  })

  it('closes without adding via Cancel', () => {
    const { onAdd, onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onClose).toHaveBeenCalled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})

// #24: the screenshot becomes the artist's first reference image *and* the
// input to taste-fit, so Instagram's chrome has to come off both.
describe('QuickAddArtist artwork crop (#24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('embeds and saves the crop rather than the raw screenshot', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({
      handle: 'cropme', name: '', tags: [], styleNote: '',
      crop: { x: 0, y: 0.25, w: 1, h: 0.5 },
    })
    const { onAdd } = renderModal()
    chooseScreenshot()

    await waitFor(() => expect(embed).toHaveBeenCalledWith('data:image/jpeg;base64,CROPPED'))
    expect(cropImageToDataUrl).toHaveBeenCalledWith('data:image/jpeg;base64,SHOT', { x: 0, y: 0.25, w: 1, h: 0.5 })

    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    expect(onAdd.mock.calls.at(-1)[0].images).toEqual(['data:image/jpeg;base64,CROPPED'])
  })

  it('keeps the whole screenshot when the model gives no box', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({
      handle: 'nobox', name: '', tags: [], styleNote: '', crop: null,
    })
    renderModal()
    chooseScreenshot()

    await waitFor(() => expect(embed).toHaveBeenCalledWith('data:image/jpeg;base64,SHOT'))
  })
})

// Both reviewers landed on the same point: silently swapping the user's image
// for a machine-chosen crop needs to be visible and reversible — a bounding box
// can clip the artwork, and an injected one could be deliberately wrong.
describe('QuickAddArtist crop is visible and reversible (#24)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('will not add the artist while the screenshot is still being read', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    let release
    analyzeScreenshotWithGemini.mockImplementation(() => new Promise((r) => { release = r }))
    renderModal()
    chooseScreenshot()

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^add artist$/i })).toBeDisabled())

    release({ handle: 'late', name: '', tags: [], styleNote: '', crop: null })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^add artist$/i })).toBeEnabled())
  })

  it('says it cropped, and puts the whole screenshot back on undo', async () => {
    localStorage.setItem('gemini_api_key', 'test-key')
    analyzeScreenshotWithGemini.mockResolvedValue({
      handle: 'cropme', name: '', tags: [], styleNote: '',
      crop: { x: 0, y: 0.25, w: 1, h: 0.5 },
    })
    const { onAdd } = renderModal()
    chooseScreenshot()

    const undo = await screen.findByRole('button', { name: /use the whole screenshot/i })
    fireEvent.click(undo)

    fireEvent.click(screen.getByRole('button', { name: /^add artist$/i }))
    await waitFor(() => expect(onAdd).toHaveBeenCalled())
    expect(onAdd.mock.calls.at(-1)[0].images).toEqual(['data:image/jpeg;base64,SHOT'])
  })
})
