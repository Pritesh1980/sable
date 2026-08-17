import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import ConceptViewer from '../components/ConceptViewer'

// #32. ConceptViewer used to sync `index` from `initialIndex` via an effect,
// but Concepts.jsx only ever mounts it fresh per open (viewerOpen gates
// rendering; viewerIndex only moves null <-> a value, never one open value to
// another on a live instance) — the effect never had anything to do. Replaced
// with `key={viewerIndex}` at the call site, so React remounts instead.

vi.mock('../components/GlCrossfade', () => ({ default: () => null }))

const items = [
  { id: 'c1', title: 'Raven', imageUrl: '/concepts/1.png', tags: [] },
  { id: 'c2', title: 'Moth', imageUrl: '/concepts/2.png', tags: [] },
]

describe('ConceptViewer shows the item for a fresh initialIndex (#32)', () => {
  it('displays the correct item across a remount with a new key, the way the real call site opens it', () => {
    const { unmount } = render(
      <ConceptViewer key={0} items={items} initialIndex={0} onClose={vi.fn()} />
    )
    expect(screen.getByAltText('Raven')).toBeInTheDocument()
    unmount()
    cleanup()

    render(<ConceptViewer key={1} items={items} initialIndex={1} onClose={vi.fn()} />)
    expect(screen.getByAltText('Moth')).toBeInTheDocument()
  })
})
