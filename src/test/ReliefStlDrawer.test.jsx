import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ReliefStlDrawer from '../components/ReliefStlDrawer'
import { buildReliefStl } from '../data/reliefStl'

vi.mock('../data/reliefStl', async () => {
  const actual = await vi.importActual('../data/reliefStl')
  return {
    ...actual,
    buildReliefStl: vi.fn(() => 'solid mocked\nendsolid mocked'),
  }
})

const photo = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../data/reliefImage', async () => {
  const actual = await vi.importActual('../data/reliefImage')
  return { ...actual, loadPhotoForRelief: photo.load }
})

vi.mock('../components/ReliefMask', () => ({
  default: ({ settings }) => <div data-testid="relief-mask" data-threshold={settings?.threshold} />,
}))

vi.mock('../components/ReliefPreview', () => ({
  default: ({ heightmap, settings }) => (
    <div data-testid="relief-preview" data-width={heightmap?.width} data-mode={settings?.mode} />
  ),
}))

const source = {
  imageUrl: 'data:image/png;base64,relief-source',
  label: 'Raven Chest',
  filenameSeed: 'Raven Chest Export',
}

describe('ReliefStlDrawer', () => {
  let getContextSpy
  let createObjectURLSpy
  let revokeObjectURLSpy
  let clickSpy

  beforeEach(() => {
    buildReliefStl.mockClear()
    getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray([
          255, 0, 0, 255,
          0, 255, 0, 255,
          0, 0, 255, 255,
          255, 255, 255, 255,
        ]),
      })),
    })
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:relief-stl')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  })

  afterEach(() => {
    getContextSpy.mockRestore()
    createObjectURLSpy.mockRestore()
    revokeObjectURLSpy.mockRestore()
    clickSpy.mockRestore()
  })

  it('renders the dialog, image, and default setting values', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'Make Relief STL' })).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Make Relief STL' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('img', { name: 'Raven Chest STL source' })).toHaveAttribute('src', source.imageUrl)
    expect(screen.getByLabelText('Width in millimetres')).toHaveValue(80)
    expect(screen.getByLabelText('Maximum relief height in millimetres')).toHaveValue(3)
    expect(screen.getByLabelText('Base thickness in millimetres')).toHaveValue(1.2)
    expect(screen.getByLabelText('Detail preset')).toHaveValue('medium')
    expect(screen.getByLabelText('Smoothing preset')).toHaveValue('light')
    expect(screen.getByLabelText('Invert relief height')).not.toBeChecked()
  })

  it('switches between the source image and a 3D preview of the same settings', async () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    fireEvent.load(screen.getByRole('img', { name: 'Raven Chest STL source' }))
    expect(screen.queryByTestId('relief-preview')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'lineart' } })
    fireEvent.click(screen.getByRole('button', { name: '3D preview' }))

    const preview = await screen.findByTestId('relief-preview')
    expect(preview).toHaveAttribute('data-width', '2')
    expect(preview).toHaveAttribute('data-mode', 'lineart')
    // The source image stays mounted (hidden) so it can still be read for the download.
    expect(screen.getByAltText('Raven Chest STL source')).not.toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    expect(screen.queryByTestId('relief-preview')).not.toBeInTheDocument()
    expect(screen.getByAltText('Raven Chest STL source')).toBeVisible()
  })

  it('can swap in your own photo from the device, downsized on the way in', async () => {
    let resolvePhoto
    photo.load.mockReturnValueOnce(new Promise((r) => { resolvePhoto = r }))
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    fireEvent.load(screen.getByRole('img', { name: 'Raven Chest STL source' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download STL' })).toBeEnabled())

    const file = new File(['png-bytes'], 'My Sketch.PNG', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Use another image'), { target: { files: [file] } })
    // The old image must not stay downloadable while the new one is read (codex review).
    expect(screen.getByRole('button', { name: 'Download STL' })).toBeDisabled()
    expect(photo.load).toHaveBeenCalledWith(file)

    resolvePhoto('data:image/png;base64,small')
    const img = await screen.findByAltText('My Sketch STL source')
    expect(img.getAttribute('src')).toBe('data:image/png;base64,small')

    fireEvent.load(img)
    const downloadButton = screen.getByRole('button', { name: 'Download STL' })
    await waitFor(() => expect(downloadButton).toBeEnabled())
    fireEvent.click(downloadButton)
    expect(buildReliefStl).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ solidName: 'my-sketch' }))
  })

  it('does not override detail or height the user already chose when switching to line art', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Detail preset'), { target: { value: 'high' } })
    fireEvent.change(screen.getByLabelText('Maximum relief height in millimetres'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'lineart' } })
    expect(screen.getByLabelText('Detail preset')).toHaveValue('high')
    expect(screen.getByLabelText('Maximum relief height in millimetres')).toHaveValue(2)
  })

  it('shows a line mask of what will be raised, only in line-art mode', async () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    fireEvent.load(screen.getByRole('img', { name: 'Raven Chest STL source' }))
    expect(screen.queryByRole('button', { name: 'Line mask' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'lineart' } })
    fireEvent.change(screen.getByLabelText('Line threshold'), { target: { value: '0.35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Line mask' }))
    expect(await screen.findByTestId('relief-mask')).toHaveAttribute('data-threshold', '0.35')

    // Back to relief: the mask no longer applies, so the drawer shows the image.
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'relief' } })
    expect(screen.queryByTestId('relief-mask')).not.toBeInTheDocument()
    expect(screen.getByAltText('Raven Chest STL source')).toBeVisible()
  })

  it('lithophane style: print-ready defaults, no invert or threshold, and a print tip', async () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'lithophane' } })

    expect(screen.getByLabelText('Base thickness in millimetres')).toHaveValue(0.8)
    expect(screen.getByLabelText('Maximum relief height in millimetres')).toHaveValue(2.2)
    expect(screen.getByLabelText('Detail preset')).toHaveValue('fine')
    expect(screen.queryByLabelText('Invert relief height')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Line threshold')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Line mask' })).not.toBeInTheDocument()
    expect(screen.getByText(/print it standing upright/i)).toBeInTheDocument()

    fireEvent.click(screen.getByLabelText('Add a border'))
    fireEvent.load(screen.getByRole('img', { name: 'Raven Chest STL source' }))
    const downloadButton = screen.getByRole('button', { name: 'Download STL' })
    await waitFor(() => expect(downloadButton).toBeEnabled())
    fireEvent.click(downloadButton)
    expect(buildReliefStl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ mode: 'lithophane', baseMm: 0.8, maxReliefMm: 2.2, frame: true }),
    )
  })

  it('offers a fine detail level', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    const values = [...screen.getByLabelText('Detail preset').querySelectorAll('option')].map((o) => o.value)
    expect(values).toEqual(['low', 'medium', 'high', 'fine'])
  })

  it('line-art style shows a threshold, raises dark lines by default, and is passed to the STL', async () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    expect(screen.getByLabelText('Style')).toHaveValue('relief')
    expect(screen.queryByLabelText('Line threshold')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'lineart' } })
    // Worded for what it does to a print, not as an image operation (agy review).
    expect(screen.getByLabelText('Raise dark lines')).toBeChecked()
    // Print-safe line-art defaults: nozzle-scale detail, low sturdy lines.
    expect(screen.getByLabelText('Detail preset')).toHaveValue('fine')
    expect(screen.getByLabelText('Maximum relief height in millimetres')).toHaveValue(1.5)
    fireEvent.change(screen.getByLabelText('Line threshold'), { target: { value: '0.6' } })

    fireEvent.load(screen.getByRole('img', { name: 'Raven Chest STL source' }))
    const downloadButton = screen.getByRole('button', { name: 'Download STL' })
    await waitFor(() => expect(downloadButton).toBeEnabled())
    fireEvent.click(downloadButton)

    expect(buildReliefStl).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ mode: 'lineart', threshold: 0.6, invert: true }),
    )
  })

  it('disables STL download and shows width validation when width is out of range', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Width in millimetres'), { target: { value: '5' } })

    expect(screen.getByText('Width must be between 20mm and 200mm.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download STL' })).toBeDisabled()
  })

  it('loads the image and starts an STL download', async () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    fireEvent.load(screen.getByRole('img', { name: 'Raven Chest STL source' }))

    const downloadButton = screen.getByRole('button', { name: 'Download STL' })
    await waitFor(() => expect(downloadButton).toBeEnabled())
    vi.useFakeTimers()
    fireEvent.click(downloadButton)

    expect(buildReliefStl).toHaveBeenCalledWith(
      {
        width: 2,
        height: 2,
        values: [
          0.299,
          0.587,
          0.114,
          1,
        ],
      },
      expect.objectContaining({
        widthMm: 80,
        maxReliefMm: 3,
        baseMm: 1.2,
        detail: 'medium',
        smoothing: 'light',
        invert: false,
        solidName: 'raven-chest-export',
      }),
    )
    expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob))
    expect(clickSpy).toHaveBeenCalled()

    expect(revokeObjectURLSpy).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    vi.useRealTimers()
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:relief-stl')
  })

  it('keeps edited settings when an equivalent source object is rerendered', () => {
    const { rerender } = render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    fireEvent.change(screen.getByLabelText('Width in millimetres'), { target: { value: '120' } })
    rerender(<ReliefStlDrawer source={{ ...source }} onClose={() => {}} />)

    expect(screen.getByLabelText('Width in millimetres')).toHaveValue(120)
  })

  it('does not steal focus from edited fields when an equivalent source object is rerendered', () => {
    const { rerender } = render(<ReliefStlDrawer source={source} onClose={() => {}} />)
    const widthInput = screen.getByLabelText('Width in millimetres')

    widthInput.focus()
    rerender(<ReliefStlDrawer source={{ ...source }} onClose={() => {}} />)

    expect(widthInput).toHaveFocus()
  })

  it('revokes a pending object URL on unmount before the delayed cleanup runs', async () => {
    const { unmount } = render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    fireEvent.load(screen.getByRole('img', { name: 'Raven Chest STL source' }))
    const downloadButton = screen.getByRole('button', { name: 'Download STL' })
    await waitFor(() => expect(downloadButton).toBeEnabled())

    vi.useFakeTimers()
    fireEvent.click(downloadButton)
    unmount()
    vi.useRealTimers()

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:relief-stl')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<ReliefStlDrawer source={source} onClose={onClose} />)

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('shows an image load error', () => {
    render(<ReliefStlDrawer source={source} onClose={() => {}} />)

    fireEvent.error(screen.getByRole('img', { name: 'Raven Chest STL source' }))

    expect(screen.getByText('Could not load this image for STL export.')).toBeTruthy()
  })
})
