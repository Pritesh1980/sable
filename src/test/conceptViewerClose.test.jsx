import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConceptViewer from '../components/ConceptViewer'

// #94 — Escape was the only way out of the full-screen concept viewer, which
// strands touch users (same bug as #89 in WallViewer).

vi.mock('../components/GlCrossfade', () => ({ default: () => null }))

const items = [
  { id: 'c1', title: 'Raven', imageUrl: '/concepts/1.png', tags: [], concept: { id: 'c1', prompt: 'a raven', tags: [] } },
  { id: 'c2', title: 'Moth', imageUrl: '/concepts/2.png', tags: [], concept: { id: 'c2', prompt: 'a moth', tags: [] } },
]

describe('ConceptViewer close button (#94)', () => {
  it('has a visible close button that calls onClose', () => {
    const onClose = vi.fn()
    render(<ConceptViewer items={items} onClose={onClose} />)

    const close = screen.getByRole('button', { name: /close viewer/i })
    expect(close).toHaveTextContent(/close/i)
    fireEvent.click(close)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("the info panel's own Close still only closes the panel, not the viewer", () => {
    const onClose = vi.fn()
    render(<ConceptViewer items={items} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'i' })

    const panelClose = screen
      .getAllByRole('button', { name: /^close$/i })
      .find((b) => b.closest('aside'))
    fireEvent.click(panelClose)

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  // #171: Escape closed the whole viewer even with its info panel open.
  it('Escape closes the info panel first, then the viewer', () => {
    const onClose = vi.fn()
    render(<ConceptViewer items={items} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'i' })
    expect(document.querySelector('aside')).toBeInTheDocument()

    const first = fireEvent.keyDown(window, { key: 'Escape' })
    expect(first).toBe(false)
    expect(document.querySelector('aside')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('reports the concept showing, as it changes', () => {
    const onIndexChange = vi.fn()
    render(<ConceptViewer items={items} onClose={vi.fn()} onIndexChange={onIndexChange} />)
    expect(onIndexChange).toHaveBeenLastCalledWith(items[0])
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenLastCalledWith(items[1])
  })
})
