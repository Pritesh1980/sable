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
