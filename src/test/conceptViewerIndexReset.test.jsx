import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ConceptViewer from '../components/ConceptViewer'

// #32. ConceptViewer used to sync `index` from `initialIndex` via an effect,
// but Concepts.jsx only ever mounts it fresh per open (viewerOpen gates
// rendering; viewerIndex only moves null <-> a value, never one open value to
// another on a live instance) — the effect never had anything to do. Replaced
// with `key={viewerIndex}` at the call site, so React remounts instead.
//
// codex review: an earlier version of this test unmounted before the second
// render, so it passed regardless of whether the key was there — it proved a
// fresh mount initializes correctly, not that the key does anything. Using
// `rerender` on the same container makes the key load-bearing: React only
// resets internal state across a `rerender` when the key actually changes.

vi.mock('../components/GlCrossfade', () => ({ default: () => null }))

const items = [
  { id: 'c1', title: 'Raven', imageUrl: '/concepts/1.png', tags: [] },
  { id: 'c2', title: 'Moth', imageUrl: '/concepts/2.png', tags: [] },
]

describe('ConceptViewer only resets its displayed index across a real remount (#32)', () => {
  it('resets to the new initialIndex when key changes, matching how Concepts.jsx opens it', () => {
    const { rerender } = render(
      <ConceptViewer key={0} items={items} initialIndex={0} onClose={vi.fn()} />
    )
    expect(screen.getByAltText('Raven')).toBeInTheDocument()

    rerender(<ConceptViewer key={1} items={items} initialIndex={1} onClose={vi.fn()} />)
    expect(screen.getByAltText('Moth')).toBeInTheDocument()
  })

  it('does not reset when initialIndex changes without a key change', () => {
    const { rerender } = render(
      <ConceptViewer key="stable" items={items} initialIndex={0} onClose={vi.fn()} />
    )
    expect(screen.getByAltText('Raven')).toBeInTheDocument()

    rerender(<ConceptViewer key="stable" items={items} initialIndex={1} onClose={vi.fn()} />)
    // Still Raven — this component alone doesn't react to initialIndex
    // changing on a live instance; the key at the real call site is what
    // does the resetting. If a future caller ever needs to change which
    // item a mounted viewer shows without a key change, this is the test
    // that would need to change first.
    expect(screen.getByAltText('Raven')).toBeInTheDocument()
  })
})
