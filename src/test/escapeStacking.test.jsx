import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConceptViewer from '../components/ConceptViewer'
import SkinPreviewDrawer from '../components/SkinPreviewDrawer'
import { isTopmostDialog } from '../hooks/useDialogFocus'

// Concepts stacks overlays: the viewer, then the STL or try-on drawer over it,
// then the live camera over the try-on drawer. Each layer listened for keys on
// its own, so a single Escape closed the whole stack, and ←/→ changed the
// viewer hidden under an open drawer. Found by the browser suite.

vi.mock('../components/GlCrossfade', () => ({ default: () => null }))
vi.mock('../components/LiveTryOn', () => ({
  default: () => <div role="dialog" aria-modal="true" aria-label="Live try-on" />,
}))

const items = [
  { id: 'c1', title: 'Raven', imageUrl: '/concepts/1.png', tags: [], concept: { id: 'c1', prompt: 'a raven', tags: [] } },
  { id: 'c2', title: 'Moth', imageUrl: '/concepts/2.png', tags: [], concept: { id: 'c2', prompt: 'a moth', tags: [] } },
]

// Stands in for a drawer opened over the viewer: rendered after it, like the
// real drawers are in Concepts.jsx.
const Drawer = () => <div role="dialog" aria-modal="true" aria-label="Drawer on top" />

describe('isTopmostDialog', () => {
  it('is the last modal dialog in document order', () => {
    render(
      <>
        <div role="dialog" aria-modal="true" aria-label="under" />
        <div role="dialog" aria-modal="true" aria-label="over" />
      </>
    )
    expect(isTopmostDialog(screen.getByRole('dialog', { name: 'under' }))).toBe(false)
    expect(isTopmostDialog(screen.getByRole('dialog', { name: 'over' }))).toBe(true)
  })
})

describe('keys reach only the top layer', () => {
  it('Escape closes a drawer over the concept viewer, not the viewer too', () => {
    const onClose = vi.fn()
    const { rerender } = render(<><ConceptViewer items={items} onClose={onClose} /><Drawer /></>)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    rerender(<ConceptViewer items={items} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // With real key presses the browser runs microtasks between listeners, so
  // React has already removed a drawer that closed on this Escape by the time
  // the viewer's window listener runs — the viewer *is* topmost by then. The
  // drawer marks the event handled (preventDefault) and the viewer honours it.
  it('ignores an Escape that a layer above already handled', () => {
    const onClose = vi.fn()
    render(<ConceptViewer items={items} onClose={onClose} />)
    const drawerThatJustClosed = (e) => e.preventDefault()
    document.addEventListener('keydown', drawerThatJustClosed)
    try {
      fireEvent.keyDown(document.body, { key: 'Escape' })
    } finally {
      document.removeEventListener('keydown', drawerThatJustClosed)
    }
    expect(onClose).not.toHaveBeenCalled()
  })

  it('the try-on drawer marks the Escape it closes on as handled', () => {
    const onClose = vi.fn()
    const source = { conceptId: 'c1', conceptLabel: 'Moth', variantLabel: 'Pass 2', imageUrl: 'blob:design' }
    render(<SkinPreviewDrawer source={source} onClose={onClose} onSave={() => {}} />)

    const unhandled = fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
    expect(unhandled).toBe(false)
  })

  it('arrow keys do not change the concept hidden under a drawer', () => {
    render(<><ConceptViewer items={items} onClose={() => {}} /><Drawer /></>)

    fireEvent.keyDown(window, { key: 'ArrowRight' })

    expect(screen.getByRole('dialog', { name: /^Concept: Raven/ })).toBeInTheDocument()
  })

  it('Escape in the live camera leaves the try-on drawer open', () => {
    const onClose = vi.fn()
    const source = { conceptId: 'c1', conceptLabel: 'Moth', variantLabel: 'Pass 2', imageUrl: 'blob:design' }
    render(<SkinPreviewDrawer source={source} onClose={onClose} onSave={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /live camera/i }))
    expect(screen.getByRole('dialog', { name: 'Live try-on' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
  })
})
