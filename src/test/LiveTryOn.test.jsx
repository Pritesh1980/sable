import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import LiveTryOn from '../components/LiveTryOn'

const h = vi.hoisted(() => ({ load: vi.fn(), shrink: vi.fn(), toData: vi.fn() }))
vi.mock('../data/reliefImage', () => ({ loadPhotoForRelief: h.load }))
vi.mock('../data/skinPreview', () => ({ shrinkImageDataUrl: h.shrink, imageUrlToDataUrl: h.toData }))

let stop
let getUserMedia
const originalMediaDevices = navigator.mediaDevices

beforeEach(() => {
  stop = vi.fn()
  getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
  h.load.mockReset().mockResolvedValue('data:image/png;base64,ARM')
  h.shrink.mockReset().mockImplementation(async (url) => `small:${url}`)
  h.toData.mockReset().mockImplementation(async (url) => url)
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
})

afterEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { value: originalMediaDevices, configurable: true })
  vi.restoreAllMocks()
})

const props = { designUrl: 'data:image/png;base64,DESIGN', label: 'Moth' }
const overlay = () => screen.getByAltText('Moth design overlay')

describe('LiveTryOn', () => {
  it('opens the back camera and releases it on close', async () => {
    const onClose = vi.fn()
    const { unmount } = render(<LiveTryOn {...props} onSave={vi.fn()} onClose={onClose} />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    expect(getUserMedia.mock.calls[0][0].video.facingMode).toEqual({ ideal: 'environment' })

    fireEvent.click(screen.getByRole('button', { name: 'Close live try-on' }))
    expect(onClose).toHaveBeenCalled()
    unmount()
    expect(stop).toHaveBeenCalled()
  })

  it('closes on Escape and marks it handled, so the drawer underneath stays open', async () => {
    const onClose = vi.fn()
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={onClose} />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())

    const unhandled = fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
    expect(unhandled).toBe(false)
  })

  it('says it is starting the camera while waiting for permission', () => {
    getUserMedia.mockReturnValueOnce(new Promise(() => {}))
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText(/starting camera/i)).toBeInTheDocument()
  })

  it('offers a photo instead when the camera is refused', async () => {
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText(/camera access was blocked/i)).toBeInTheDocument()

    const file = new File(['x'], 'arm.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Use a photo instead'), { target: { files: [file] } })
    expect(await screen.findByAltText('Your placement photo')).toHaveAttribute('src', 'data:image/png;base64,ARM')
  })

  it('blends the design so white paper disappears, and resizes and rotates it', async () => {
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    expect(overlay().className).toMatch(/mix-blend-multiply/)
    const before = parseFloat(overlay().style.width)

    fireEvent.change(screen.getByLabelText('Size'), { target: { value: '2' } })
    expect(parseFloat(overlay().style.width)).toBeCloseTo(before * 2)
    fireEvent.change(screen.getByLabelText('Rotation'), { target: { value: '45' } })
    expect(overlay().style.transform).toMatch(/rotate\(45deg\)/)
  })

  it('moves the design with a one-finger drag', async () => {
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    const stage = screen.getByTestId('try-on-stage')
    const left = parseFloat(overlay().style.left)
    fireEvent.pointerDown(stage, { pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 100 })
    fireEvent.pointerMove(stage, { pointerId: 1, pointerType: 'touch', clientX: 160, clientY: 100 })
    fireEvent.pointerUp(stage, { pointerId: 1, pointerType: 'touch', clientX: 160, clientY: 100 })
    expect(parseFloat(overlay().style.left)).toBeCloseTo(left + 60)
  })

  // codex review: a design linked from another site would taint the snapshot
  // canvas; its bytes are loaded locally first.
  it('loads a linked design locally so a snapshot can always be saved', async () => {
    h.toData.mockResolvedValueOnce('data:image/png;base64,LOCAL')
    render(<LiveTryOn designUrl="https://example.com/moth.png" label="Moth" onSave={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(overlay()).toHaveAttribute('src', 'data:image/png;base64,LOCAL'))
    expect(h.toData).toHaveBeenCalledWith('https://example.com/moth.png')
  })

  it('forgets the calibration when the camera is flipped', async () => {
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Flip camera' }))
    // flipping restarts the camera; calibrate against the new view first
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    fireEvent.click(await screen.findByRole('button', { name: 'Real size' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText(/cm wide/)).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Flip camera' }))
    await waitFor(() => expect(screen.queryByText(/cm wide/)).not.toBeInTheDocument())
  })

  it('follows the screen when the phone is rotated', async () => {
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    const leftBefore = parseFloat(overlay().style.left)
    const widthBefore = window.innerWidth
    act(() => {
      window.innerWidth = widthBefore * 2
      window.dispatchEvent(new Event('resize'))
    })
    expect(parseFloat(overlay().style.left)).toBeCloseTo(leftBefore * 2)
    window.innerWidth = widthBefore
  })

  it('shows the width in centimetres after calibrating against a bank card', async () => {
    render(<LiveTryOn {...props} onSave={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled())
    expect(screen.queryByText(/cm wide/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Real size' }))
    expect(screen.getByText(/hold a bank card/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Card outline width'), { target: { value: '171.2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.getByText(/≈ [\d.]+ cm wide/)).toBeInTheDocument()
  })

  it('saves a snapshot of the view as a variant', async () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(),
      set globalCompositeOperation(v) {}, set globalAlpha(v) {},
    })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,SNAP')
    getUserMedia.mockRejectedValueOnce(new Error('no camera'))
    render(<LiveTryOn {...props} onSave={onSave} onClose={onClose} />)
    const file = new File(['x'], 'arm.jpg', { type: 'image/jpeg' })
    fireEvent.change(await screen.findByLabelText('Use a photo instead'), { target: { files: [file] } })
    const photo = await screen.findByAltText('Your placement photo')
    act(() => { fireEvent.load(photo); fireEvent.load(overlay()) })

    fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Live try-on',
      imageUrl: 'small:data:image/jpeg;base64,SNAP',
    }))
    expect(onClose).toHaveBeenCalled()
  })
})
