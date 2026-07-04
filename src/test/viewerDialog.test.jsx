// Review-fix coverage: full-screen viewers are proper dialogs — role,
// aria-modal, initial focus in, focus restore on close.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import WallViewer from '../components/WallViewer'

const items = [
  { artistId: 'a1', artistName: 'Zoia', handle: 'zoia.ink', styles: ['blackwork'], image: '/1.jpg', imageIndex: 0, isRecent: false },
  { artistId: 'a1', artistName: 'Zoia', handle: 'zoia.ink', styles: ['blackwork'], image: '/2.jpg', imageIndex: 1, isRecent: false },
]
const artist = { id: 'a1', name: 'Zoia', handle: 'zoia.ink', tags: ['blackwork'] }

describe('WallViewer dialog semantics', () => {
  it('renders as an aria-modal dialog and takes focus on open', () => {
    render(
      <WallViewer items={items} initialIndex={0} artist={artist} open onClose={() => {}} onGenerate={() => {}} />
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(dialog)
  })

  it('restores focus to the previously focused element on close', () => {
    const outside = document.createElement('button')
    outside.textContent = 'trigger'
    document.body.appendChild(outside)
    outside.focus()

    const { rerender } = render(
      <WallViewer items={items} initialIndex={0} artist={artist} open onClose={() => {}} onGenerate={() => {}} />
    )
    expect(document.activeElement).not.toBe(outside)

    rerender(
      <WallViewer items={items} initialIndex={0} artist={artist} open={false} onClose={() => {}} onGenerate={() => {}} />
    )
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })
})
