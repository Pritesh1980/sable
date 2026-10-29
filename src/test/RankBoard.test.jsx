import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import RankBoard from '../components/RankBoard'

const artists = [
  { id: 'a', handle: 'a', name: 'Aaa', rank: 1, images: ['a.jpg'] },
  { id: 'b', handle: 'b', name: 'Bbb', rank: 2, images: [] },
  { id: 'c', handle: 'c', name: 'Ccc', rank: 3, images: [] },
  { id: 'd', handle: 'd', name: 'Ddd', rank: 4, images: [] },
  { id: 'e', handle: 'e', name: 'Eee', rank: 5, images: [] },
  { id: 'f', handle: 'f', name: 'Fff', rank: 6, images: [] },
  { id: 'g', handle: 'g', name: 'Ggg', rank: 7, images: [] },
]

it('splits into a top-5 section and everyone else', () => {
  render(<RankBoard artists={artists} setArtists={vi.fn()} onClose={vi.fn()} />)
  const top = screen.getByTestId('board-top5')
  const rest = screen.getByTestId('board-rest')
  expect(within(top).getByText('Aaa')).toBeInTheDocument()
  expect(within(rest).getByText('Fff')).toBeInTheDocument()
  expect(within(top).queryByText('Fff')).toBeNull()
})

it('drops a top-5 artist out', () => {
  const setArtists = vi.fn()
  render(<RankBoard artists={artists} setArtists={setArtists} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /drop Eee out of top 5/i }))
  const next = setArtists.mock.calls[0][0](artists)
  expect(next.find((x) => x.id === 'e').rank).toBe(6)
})

it('pulls a benched artist into the top 5', () => {
  const setArtists = vi.fn()
  render(<RankBoard artists={artists} setArtists={setArtists} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Fff into top 5/i }))
  const next = setArtists.mock.calls[0][0](artists)
  expect(next.find((x) => x.id === 'f').rank).toBe(5)
})

it('moves a rest-list row down one slot', () => {
  const setArtists = vi.fn()
  render(<RankBoard artists={artists} setArtists={setArtists} onClose={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Fff down/i }))
  const next = setArtists.mock.calls[0][0](artists)
  expect(next.find((x) => x.id === 'f').rank).toBe(7)
})

it('shows an empty prompt with no artists', () => {
  render(<RankBoard artists={[]} setArtists={vi.fn()} onClose={vi.fn()} />)
  expect(screen.getByText(/add artists to start ranking/i)).toBeInTheDocument()
})

it('closes', () => {
  const onClose = vi.fn()
  render(<RankBoard artists={artists} setArtists={vi.fn()} onClose={onClose} />)
  fireEvent.click(screen.getByRole('button', { name: /^done$/i }))
  expect(onClose).toHaveBeenCalled()
})

// #161: the board was a plain fixed div — no dialog role, focus left behind on
// the Wall, Escape heard by every layer, and ▲/▼ about 32px square.
it('is a modal dialog named by its heading, and takes focus', () => {
  render(<RankBoard artists={artists} setArtists={vi.fn()} onClose={vi.fn()} />)
  const dialog = screen.getByRole('dialog', { name: 'Rank artists' })
  expect(dialog).toHaveAttribute('aria-modal', 'true')
  expect(dialog).toHaveFocus()
})

it('closes on Escape and marks it handled', () => {
  const onClose = vi.fn()
  render(<RankBoard artists={artists} setArtists={vi.fn()} onClose={onClose} />)
  const unhandled = fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(unhandled).toBe(false)
})

it('leaves Escape to a dialog stacked above it', () => {
  const onClose = vi.fn()
  render(
    <>
      <RankBoard artists={artists} setArtists={vi.fn()} onClose={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Above" />
    </>
  )
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(onClose).not.toHaveBeenCalled()
})

it('ignores an Escape another layer already handled', () => {
  const onClose = vi.fn()
  render(<RankBoard artists={artists} setArtists={vi.fn()} onClose={onClose} />)
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  event.preventDefault()
  document.dispatchEvent(event)
  expect(onClose).not.toHaveBeenCalled()
})

it('gives every row control a 44px touch target', () => {
  render(<RankBoard artists={artists} setArtists={vi.fn()} onClose={vi.fn()} />)
  const controls = [
    ...screen.getAllByRole('button', { name: /^Move .* (up|down)$/ }),
    ...screen.getAllByRole('button', { name: /^Drop .* out of top 5$/ }),
    ...screen.getAllByRole('button', { name: /^Move .* into top 5$/ }),
    screen.getByRole('button', { name: 'Done' }),
  ]
  for (const control of controls) expect(control.className).toMatch(/\bmin-h-11\b/)
  for (const nudge of screen.getAllByRole('button', { name: /^Move .* (up|down)$/ })) {
    expect(nudge.className).toMatch(/\bmin-w-11\b/)
  }
})
