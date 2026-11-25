import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import PhotoMarkupModal from '../components/PhotoMarkupModal'
import Brief from '../pages/Brief'
import { UndoProvider } from '../context/UndoContext'

function mockRect(el, rect = { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 }) {
  el.getBoundingClientRect = () => rect
}

function loadRenderedImage(alt = /reference/i) {
  const img = screen.getByAltText(alt)
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: 800 })
  Object.defineProperty(img, 'naturalHeight', { configurable: true, value: 600 })
  fireEvent.load(img)
  return img
}

describe('PhotoMarkupModal (#208)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('opens a native dialog without redundant ARIA dialog attributes and supports drawing, labeling, undo/redo, and apply', () => {
    const onApply = vi.fn()
    const onClose = vi.fn()
    const source = { url: '/images/demo/vesper_noctis/1.svg', note: 'Original note' }

    render(<PhotoMarkupModal image={source} index={0} onApply={onApply} onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Mark up reference 1' })
    expect(dialog.tagName).toBe('DIALOG')
    expect(dialog).not.toHaveAttribute('role')
    expect(dialog).not.toHaveAttribute('aria-modal')

    loadRenderedImage()

    const stage = screen.getByTestId('markup-stage')
    mockRect(stage, { left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300 })

    // Draw a circle via primary-button pointer drag
    fireEvent.pointerDown(stage, { button: 0, pointerId: 1, clientX: 200, clientY: 150 })
    fireEvent.pointerMove(stage, { button: 0, pointerId: 1, clientX: 260, clientY: 150 })
    fireEvent.pointerUp(stage, { button: 0, pointerId: 1, clientX: 260, clientY: 150 })

    // Non-primary button drags are ignored
    fireEvent.pointerDown(stage, { button: 2, pointerId: 2, clientX: 80, clientY: 80 })
    fireEvent.pointerUp(stage, { button: 2, pointerId: 2, clientX: 120, clientY: 80 })

    const labelInput = screen.getByLabelText('Mark label')
    // Simulated keystroke-by-keystroke typing keeps spaces and coalesces Undo
    fireEvent.change(labelInput, { target: { value: 'Keep' } })
    fireEvent.change(labelInput, { target: { value: 'Keep ' } })
    expect(labelInput).toHaveValue('Keep ')
    fireEvent.change(labelInput, { target: { value: 'Keep wing vein' } })
    expect(labelInput).toHaveValue('Keep wing vein')

    // Keyboard position/size sliders adjust coordinates cleanly
    fireEvent.click(screen.getByText('Adjust position & size'))
    const markX = screen.getByRole('slider', { name: 'Mark X' })
    fireEvent.change(markX, { target: { value: '0.52' } })
    expect(markX).toHaveValue('0.52')

    // Switch to Arrow and place via button (keyboard accessible)
    fireEvent.click(screen.getByRole('button', { name: 'Arrow', pressed: false }))
    fireEvent.click(screen.getByRole('button', { name: '+ Place mark' }))
    const arrowLabel = screen.getByLabelText('Mark label')
    fireEvent.change(arrowLabel, { target: { value: 'Soft' } })
    fireEvent.change(arrowLabel, { target: { value: 'Soft ' } })
    fireEvent.change(arrowLabel, { target: { value: 'Soft shading' } })

    expect(screen.getByText('Keep wing vein')).toBeInTheDocument()
    expect(screen.getByText('Soft shading')).toBeInTheDocument()

    // Single Undo reverts the entire coalesced label edit rather than one character at a time
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.queryByText('Soft shading')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(screen.getByText('Soft shading')).toBeInTheDocument()

    // Remove the selected arrow, then Clear all and Undo restore
    fireEvent.click(screen.getByRole('button', { name: 'Remove mark' }))
    expect(screen.queryByText('Soft shading')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(screen.queryByText('Keep wing vein')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(screen.getByText('Keep wing vein')).toBeInTheDocument()

    // Toggle "Show markup on brief card" switch off
    const cardToggle = screen.getByRole('switch', { name: /show markup on brief card/i })
    expect(cardToggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(cardToggle)
    expect(cardToggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Apply markup' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    const [savedMarks, includeInBrief] = onApply.mock.calls[0]
    expect(savedMarks).toHaveLength(1)
    expect(savedMarks[0]).toMatchObject({ kind: 'circle', x: 0.52, y: 0.5, r: 0.2, label: 'Keep wing vein' })
    expect(includeInBrief).toBe(false)
    // Original ref was never mutated
    expect(source).toEqual({ url: '/images/demo/vesper_noctis/1.svg', note: 'Original note' })
  })

  it('guards unsaved markup edits before discarding on Cancel or Escape', () => {
    const onClose = vi.fn()
    render(<PhotoMarkupModal image={{ url: '/images/demo/1.png', note: '' }} index={0} onApply={vi.fn()} onClose={onClose} />)
    loadRenderedImage()

    fireEvent.click(screen.getByRole('button', { name: '+ Place mark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText(/Discard unsaved markup changes/i)).toBeVisible()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.queryByText(/Discard unsaved markup changes/i)).not.toBeInTheDocument()

    fireEvent(screen.getByRole('dialog', { name: 'Mark up reference 1' }), new Event('cancel', { cancelable: true }))
    expect(screen.getByText(/Discard unsaved markup changes/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('refuses annotation on unreadable/offline photos and external web links without changing the ref', async () => {
    const onApply = vi.fn()
    const { rerender } = render(
      <PhotoMarkupModal
        image={{ url: 'https://example.com/portfolio.jpg', note: 'External' }}
        index={1}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Web image links stay referenced/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Apply markup' })).toBeDisabled()

    // Unavailable stored key (never resolved cleanly in local test store)
    rerender(
      <PhotoMarkupModal
        image={{ key: 'user/u1/ideas/offline.png', note: 'Offline' }}
        index={2}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    )
    expect(await screen.findByText(/not available offline|bytes can be read/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Apply markup' })).toBeDisabled()

    // Same-origin broken image decode fallback
    rerender(
      <PhotoMarkupModal
        image={{ url: '/missing-photo.png', note: 'Broken' }}
        index={3}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    )
    const img = screen.getByAltText(/reference/i)
    fireEvent.error(img)
    expect(screen.getByText(/could not load|bytes can be read/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Apply markup' })).toBeDisabled()
  })

  it('integrates with Brief editor and BriefCardPreview without affecting sibling duplicate refs', async () => {
    const ctx = {
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      measureText: (t) => ({ width: t.length * 10 }),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })))
    vi.stubGlobal('Image', class {
      naturalWidth = 800
      naturalHeight = 600
      set src(value) { if (value) queueMicrotask(() => this.onload?.()) }
    })

    const idea = {
      id: 'idea-1',
      title: 'Duplicate markup test',
      description: 'Compare two crops of one photo.',
      tags: ['fine-line'],
      placement: 'forearm',
      images: [
        { url: '/a.png', note: 'First copy' },
        { url: '/a.png', note: 'Second copy' },
      ],
      linkedArtists: [],
    }
    const setIdeas = vi.fn()
    render(
      <MemoryRouter>
        <UndoProvider>
          <Brief ideas={[idea]} setIdeas={setIdeas} artists={[]} />
        </UndoProvider>
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Duplicate markup test'))
    fireEvent.click(screen.getByRole('button', { name: 'Mark up reference 2' }))
    loadRenderedImage(/Reference 2/)
    fireEvent.click(screen.getByRole('button', { name: '+ Place mark' }))
    fireEvent.change(screen.getByLabelText('Mark label'), { target: { value: 'Borrow stipple' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply markup' }))

    expect(screen.getByRole('button', { name: 'Mark up reference 2' })).toHaveTextContent('Mark up (1)')
    expect(screen.getByRole('button', { name: 'Mark up reference 1' })).toHaveTextContent('Mark up')

    fireEvent.click(screen.getByRole('button', { name: 'Preview card' }))
    const cardToggle = await screen.findByRole('switch', { name: 'Show markup on card reference 2' })
    expect(cardToggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(cardToggle)
    expect(cardToggle).toHaveAttribute('aria-checked', 'false')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Share this card' })).toBeEnabled())

    fireEvent.click(screen.getByRole('button', { name: 'Close card preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }))

    const saved = setIdeas.mock.calls.at(-1)[0]([idea])[0]
    expect(saved.images[0]).toEqual({ url: '/a.png', note: 'First copy' })
    expect(saved.images[1]).toMatchObject({
      url: '/a.png',
      note: 'Second copy',
      includeMarkupInBrief: false,
      markup: [{ kind: 'circle', label: 'Borrow stipple' }],
    })
  }, 15_000)
})
