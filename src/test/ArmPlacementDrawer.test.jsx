import { useImperativeHandle } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import ArmPlacementDrawer from '../components/ArmPlacementDrawer'

// The panel (and with it WebGL) is a stub: this file tests the drawer's own
// job, which is resolving the stored image to bytes a canvas may read, being a
// well-behaved dialog over the concept viewer, and saving the picture as a
// variant through the page's one add path.
const h = vi.hoisted(() => ({ bytes: vi.fn(), shrink: vi.fn(), panel: null, snapshot: null }))
vi.mock('../hooks/useImageBytes', () => ({ default: h.bytes }))
vi.mock('../data/skinPreview', () => ({ shrinkImageDataUrl: h.shrink }))
vi.mock('../components/ArmPlacementPanel', () => ({
  default: function Stub(props) {
    h.panel = props
    useImperativeHandle(props.ref, () => ({ snapshot: h.snapshot }), [])
    return <div data-testid="arm-panel" />
  },
}))

const source = {
  conceptId: 'c1', conceptLabel: 'Moth over a crescent moon', variantLabel: 'Moth line study',
  imageUrl: 'user/u1/concepts/c1/abc',
}
const PLACED = { widthCm: 12, heightCm: 15.2, centreCm: 17, arcCm: 0 }
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const open = (props = {}) => {
  const handlers = { onSave: vi.fn(), onClose: vi.fn() }
  const utils = render(<ArmPlacementDrawer source={source} {...handlers} {...props} />)
  return { ...handlers, ...utils }
}
const dialog = () => screen.getByRole('dialog', { name: 'On the arm in 3D' })
const save = () => screen.getByRole('button', { name: 'Save as variant' })

beforeEach(() => {
  h.panel = null
  h.snapshot = vi.fn(() => ({ bytes: PNG, placement: PLACED }))
  h.bytes.mockReset().mockReturnValue({ src: 'blob:same-origin-copy', status: 'ready' })
  h.shrink.mockReset().mockImplementation(async (url) => `small:${url}`)
})

describe('ArmPlacementDrawer', () => {
  it('is not there without a result to show', () => {
    render(<ArmPlacementDrawer source={null} onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens as a modal dialog named for what it shows, with focus inside', () => {
    open()
    expect(dialog()).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Moth line study' })).toBeInTheDocument()
    expect(dialog().contains(document.activeElement)).toBe(true)
  })

  it('reads the stored image as bytes a canvas may use, and puts those on the arm', () => {
    open()
    // The stored ref goes to the resolver; the panel only ever sees its
    // same-origin copy, never the key or a signed URL.
    expect(h.bytes).toHaveBeenCalledWith('user/u1/concepts/c1/abc')
    expect(h.panel.imageSrc).toBe('blob:same-origin-copy')
  })

  it('says the design is loading while its bytes resolve', () => {
    h.bytes.mockReturnValue({ src: '', status: 'loading' })
    open()
    expect(screen.getByText('Loading the design…')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByTestId('arm-panel')).toBeNull()
    expect(save()).toBeDisabled()
  })

  it('says plainly when the image is not on this device and cannot be fetched', () => {
    h.bytes.mockReturnValue({ src: '', status: 'unavailable' })
    open()
    expect(screen.getByRole('alert')).toHaveTextContent(/isn’t on this device.*back online/i)
    expect(screen.queryByTestId('arm-panel')).toBeNull()
    expect(save()).toBeDisabled()
  })

  it('cannot save until the arm and the design are drawn', () => {
    open()
    expect(save()).toBeDisabled()
    act(() => h.panel.onReadyChange(true))
    expect(save()).toBeEnabled()
    act(() => h.panel.onReadyChange(false))
    expect(save()).toBeDisabled()
  })

  it('saves the picture as a variant of the concept, sized and labelled, then closes', async () => {
    const { onSave, onClose } = open()
    act(() => h.panel.onReadyChange(true))
    fireEvent.click(save())
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    // The canvas's PNG, downsized the way try-on results are before saving.
    expect(h.shrink).toHaveBeenCalledWith('data:image/png;base64,iVBORw0KGgo=')
    expect(onSave).toHaveBeenCalledWith('c1', {
      provider: 'other',
      title: 'On the arm, 12 cm',
      imageUrl: 'small:data:image/png;base64,iVBORw0KGgo=',
      notes: '3D arm preview of Moth line study. 12.0 cm wide × 15.2 cm tall, centred 17.0 cm above the elbow, outer arm.',
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('names the concept when the picture is of the concept itself', async () => {
    const { onSave } = open({ source: { ...source, variantLabel: '' } })
    expect(screen.getByRole('heading', { name: 'Moth over a crescent moon' })).toBeInTheDocument()
    act(() => h.panel.onReadyChange(true))
    fireEvent.click(save())
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][1].notes).toMatch(/^3D arm preview of Moth over a crescent moon\./)
  })

  // #206: Brief ideas open it too, on the limb the idea is planned for.
  it('opens on the limb it is asked for, the upper arm by default', () => {
    const { unmount } = open()
    expect(h.panel.limb).toBe('upper-arm')
    unmount()
    open({ source: { ...source, limb: 'forearm' } })
    expect(h.panel.limb).toBe('forearm')
  })

  it('describes the picture by the limb it was taken on, whichever it opened on', async () => {
    h.snapshot.mockReturnValue({ bytes: PNG, placement: { widthCm: 8, heightCm: 10, centreCm: 12, arcCm: 2 }, limb: 'forearm' })
    const { onSave } = open()
    act(() => h.panel.onReadyChange(true))
    fireEvent.click(save())
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][1]).toMatchObject({
      title: 'On the forearm, 8 cm',
      notes: '3D forearm preview of Moth line study. 8.0 cm wide × 10.0 cm tall, centred 12.0 cm above the wrist, 2.0 cm towards the thumb.',
    })
  })

  it('names any source by its label, and says what saving does where it was opened', async () => {
    const { onSave } = open({
      source: { imageUrl: 'user/u1/ideas/i1/abc', label: 'Fern reference 2', limb: 'forearm' },
      saveLabel: 'Add to references',
    })
    expect(screen.getByRole('heading', { name: 'Fern reference 2' })).toBeInTheDocument()
    act(() => h.panel.onReadyChange(true))
    fireEvent.click(screen.getByRole('button', { name: 'Add to references' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toBeUndefined()
    expect(onSave.mock.calls[0][1].notes).toMatch(/^3D arm preview of Fern reference 2\./)
  })

  it('stays open and says so when no picture could be taken', async () => {
    const { onSave, onClose } = open()
    act(() => h.panel.onReadyChange(true))
    h.snapshot.mockReturnValue(null)
    fireEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save a picture of this view.')
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(save()).toBeEnabled() // and it can be tried again
  })

  it('closes from its button', () => {
    const { onClose } = open()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('gives focus back to where it came from when it closes', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const { unmount } = open()
    expect(document.activeElement).not.toBe(opener)
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  describe('Escape', () => {
    it('closes the drawer and marks the press handled, so the viewer under it stays', () => {
      const { onClose } = open()
      const unhandled = fireEvent.keyDown(document, { key: 'Escape' })
      expect(onClose).toHaveBeenCalledTimes(1)
      expect(unhandled).toBe(false) // preventDefault was called
    })

    it('is left alone when a layer above already handled it', () => {
      const { onClose } = open()
      const above = (e) => e.preventDefault()
      // Capture phase: it hears the press before the drawer's own listener.
      document.addEventListener('keydown', above, true)
      try { fireEvent.keyDown(document.body, { key: 'Escape' }) } finally {
        document.removeEventListener('keydown', above, true)
      }
      expect(onClose).not.toHaveBeenCalled()
    })

    it('is left alone while another dialog is open on top', () => {
      const { onClose } = open()
      const top = document.createElement('div')
      top.setAttribute('aria-modal', 'true')
      document.body.appendChild(top)
      try { fireEvent.keyDown(document, { key: 'Escape' }) } finally { top.remove() }
      expect(onClose).not.toHaveBeenCalled()
    })

    it('other keys do nothing', () => {
      const { onClose } = open()
      fireEvent.keyDown(document, { key: 'Enter' })
      expect(onClose).not.toHaveBeenCalled()
    })
  })
})
