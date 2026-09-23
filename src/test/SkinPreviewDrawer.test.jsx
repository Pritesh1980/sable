import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SkinPreviewDrawer from '../components/SkinPreviewDrawer'

const h = vi.hoisted(() => ({ load: vi.fn(), generate: vi.fn(), toData: vi.fn(), shrink: vi.fn() }))
vi.mock('../data/reliefImage', () => ({ loadPhotoForRelief: h.load }))
vi.mock('../data/skinPreview', () => ({
  generateSkinPreviewWithGemini: h.generate,
  imageUrlToDataUrl: h.toData,
  shrinkImageDataUrl: h.shrink,
}))

vi.mock('../components/LiveTryOn', () => ({
  default: ({ designUrl, onSave, onClose }) => (
    <div data-testid="live-try-on" data-design={designUrl}>
      <button type="button" onClick={() => onSave({ title: 'Live try-on', imageUrl: 'snap' })}>snap</button>
      <button type="button" onClick={onClose}>close live</button>
    </div>
  ),
}))

const source = { conceptId: 'c1', conceptLabel: 'Moth', variantLabel: 'Pass 2', imageUrl: 'blob:design' }

beforeEach(() => {
  h.load.mockReset().mockResolvedValue('data:image/png;base64,PHOTO')
  h.toData.mockReset().mockResolvedValue('data:image/png;base64,DESIGN')
  h.generate.mockReset().mockResolvedValue('data:image/png;base64,RESULT')
  h.shrink.mockReset().mockImplementation(async (url) => `small:${url}`)
})

function pickPhoto() {
  const file = new File(['x'], 'arm.jpg', { type: 'image/jpeg' })
  fireEvent.change(screen.getByLabelText('Photo of the placement'), { target: { files: [file] } })
  return file
}

describe('SkinPreviewDrawer', () => {
  it('offers a free live-camera try-on of the same design, saving to the same concept', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<SkinPreviewDrawer source={source} apiKey="" onSave={onSave} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /live camera/i }))
    expect(screen.getByTestId('live-try-on')).toHaveAttribute('data-design', 'blob:design')

    fireEvent.click(screen.getByRole('button', { name: 'snap' }))
    expect(onSave).toHaveBeenCalledWith('c1', { title: 'Live try-on', imageUrl: 'snap' })
  })

  it('without a Gemini key, says where to add one and cannot generate', () => {
    render(<SkinPreviewDrawer source={source} apiKey="" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/add a gemini key/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate preview' })).toBeDisabled()
  })

  it('warns that the photo goes to Google and costs money before anything is sent', () => {
    render(<SkinPreviewDrawer source={source} apiKey="k" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/sent to google/i)).toBeInTheDocument()
  })

  it('generates from the photo, the design and the placement, then saves it as a Gemini variant', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<SkinPreviewDrawer source={source} apiKey="k" onSave={onSave} onClose={onClose} />)
    const file = pickPhoto()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate preview' })).toBeEnabled())
    expect(h.load).toHaveBeenCalledWith(file, expect.any(Number))
    fireEvent.change(screen.getByLabelText('Placement'), { target: { value: 'ribs' } })

    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }))
    const result = await screen.findByAltText('Moth on skin preview')
    expect(result).toHaveAttribute('src', 'data:image/png;base64,RESULT')
    expect(h.toData).toHaveBeenCalledWith('blob:design')
    // The design is downsized before sending, like the photo.
    expect(h.generate).toHaveBeenCalledWith('k', {
      skinPhoto: 'data:image/png;base64,PHOTO',
      design: 'small:data:image/png;base64,DESIGN',
      placement: 'ribs',
    })

    // Changing the menu after generating must not relabel the result.
    fireEvent.change(screen.getByLabelText('Placement'), { target: { value: 'back' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save as variant' }))
    // Saved downsized (a full Gemini PNG is ~2MB of text in storage).
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(h.shrink).toHaveBeenCalledWith('data:image/png;base64,RESULT')
    expect(onSave).toHaveBeenCalledWith('c1', expect.objectContaining({
      provider: 'gemini',
      title: 'On skin — ribs',
      imageUrl: 'small:data:image/png;base64,RESULT',
    }))
    expect(onClose).toHaveBeenCalled()
  })

  it('the empty photo box itself opens the photo picker', () => {
    render(<SkinPreviewDrawer source={source} apiKey="k" onSave={vi.fn()} onClose={vi.fn()} />)
    const input = screen.getByLabelText('Photo of the placement')
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: /add a photo of where it would go/i }))
    expect(click).toHaveBeenCalled()
  })

  it('shows a visible working state while generating, and puts Save right under the result', async () => {
    let finish
    h.generate.mockReturnValueOnce(new Promise((r) => { finish = r }))
    render(<SkinPreviewDrawer source={source} apiKey="k" onSave={vi.fn()} onClose={vi.fn()} />)
    pickPhoto()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate preview' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/generating/i)

    finish('data:image/png;base64,RESULT')
    const result = await screen.findByAltText('Moth on skin preview')
    const figure = result.closest('figure')
    expect(figure).toContainElement(screen.getByRole('button', { name: 'Save as variant' }))
    expect(figure).toContainElement(screen.getByRole('button', { name: 'Try again' }))
  })

  it('shows the error if generation fails, and allows another go', async () => {
    h.generate.mockRejectedValueOnce(new Error('API key not valid'))
    render(<SkinPreviewDrawer source={source} apiKey="k" onSave={vi.fn()} onClose={vi.fn()} />)
    pickPhoto()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate preview' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }))
    expect(await screen.findByText('API key not valid')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate preview' })).toBeEnabled()
  })
})
