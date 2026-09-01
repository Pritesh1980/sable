import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import FilmstripView from '../components/FilmstripView'

// Mirrors Gallery.jsx's own setRank exactly (src/pages/Gallery.jsx) — the real
// prop FilmstripView is driven by in production. A pure prop-controlled render
// can't exercise this bug: the underlying rank helpers preserve array order
// and only change the `rank` field, so a test that skips this re-sort would
// never see the list visually reorder between clicks, passing with no pin
// implementation at all.
function rerank(prev, artistId, newRank) {
  const all = prev.slice().sort((a, b) => a.rank - b.rank)
  const oldIndex = all.findIndex((a) => a.id === artistId)
  if (oldIndex === -1) return prev
  const clamped = Math.max(1, Math.min(all.length, newRank))
  const newIndex = clamped - 1
  if (oldIndex === newIndex) return prev
  const [moved] = all.splice(oldIndex, 1)
  all.splice(newIndex, 0, moved)
  const reranked = all.map((a, i) => ({ ...a, rank: i + 1 }))
  return prev.map((a) => reranked.find((r) => r.id === a.id) || a)
}

function Harness({ initial }) {
  const [artists, setArtists] = useState(initial)
  const sorted = artists.slice().sort((a, b) => a.rank - b.rank)
  return (
    <FilmstripView
      artists={sorted}
      onOpenArtist={() => {}}
      onSetRank={(id, rank) => setArtists((prev) => rerank(prev, id, rank))}
      onSetStatus={() => {}}
    />
  )
}

function makeArtists() {
  return ['Ana', 'Ben', 'Cleo', 'Dev', 'Eve'].map((name, i) => ({
    id: name.toLowerCase(),
    handle: name.toLowerCase(),
    name,
    tags: [],
    images: [],
    rank: i + 1,
    status: 'researching',
    notes: '',
    studio: null,
  }))
}

function rowNames() {
  return screen.getAllByTestId('filmstrip-row').map((row) => within(row).getByRole('heading').textContent)
}

function clickUp(rowIndex) {
  const row = screen.getAllByTestId('filmstrip-row')[rowIndex]
  fireEvent.click(within(row).getByRole('button', { name: /up$/i }))
}

function clickDown(rowIndex) {
  const row = screen.getAllByTestId('filmstrip-row')[rowIndex]
  fireEvent.click(within(row).getByRole('button', { name: /down$/i }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('FilmstripView — rank-nudge pin', () => {
  it('rapid clicks on the same visual row keep targeting the same artist all the way up', () => {
    vi.useFakeTimers()
    render(<Harness initial={makeArtists()} />)

    expect(rowNames()).toEqual(['Ana', 'Ben', 'Cleo', 'Dev', 'Eve'])

    // Eve starts at rank 5 (visual index 4). Four clicks should take her to
    // rank 1 — but each click is a FRESH positional query at index 4, exactly
    // like a real cursor clicking the same screen spot without moving.
    for (let i = 0; i < 4; i++) {
      expect(within(screen.getAllByTestId('filmstrip-row')[4]).getByRole('heading').textContent).toBe('Eve')
      clickUp(4)
    }

    // Still pinned — hasn't settled yet.
    expect(rowNames()[4]).toBe('Eve')

    act(() => { vi.advanceTimersByTime(1000) })

    // Settled: Eve is now rank 1, at the top.
    expect(rowNames()).toEqual(['Eve', 'Ana', 'Ben', 'Cleo', 'Dev'])
  })

  it('the pinned row does not move on screen before the idle release', () => {
    vi.useFakeTimers()
    render(<Harness initial={makeArtists()} />)

    clickUp(4) // Eve: rank 5 -> 4
    expect(rowNames()[4]).toBe('Eve')

    clickUp(4) // Eve: rank 4 -> 3
    expect(rowNames()[4]).toBe('Eve')
  })

  it('clicking a different row switches the pin to it immediately', () => {
    vi.useFakeTimers()
    render(<Harness initial={makeArtists()} />)

    clickUp(4) // pin Eve at index 4
    expect(rowNames()[4]).toBe('Eve')

    // Index 2 is still Cleo (Eve's pin hasn't disturbed anything else).
    expect(rowNames()[2]).toBe('Cleo')
    clickUp(2) // switch the pin to Cleo

    // Cleo's row now holds at index 2 across a further click there.
    clickUp(2)
    expect(rowNames()[2]).toBe('Cleo')
  })

  it('▲/▼ enabled state follows the live rank, not the pinned visual index', () => {
    vi.useFakeTimers()
    render(<Harness initial={makeArtists()} />)

    // Ben starts at rank 2 (visual index 1). Push down three times to reach
    // the true bottom (rank 5) while pinned at index 1 — if isLast were
    // computed from render index instead of live rank, the down arrow would
    // stay enabled forever since the pinned index (1) never equals the last
    // index (4).
    clickDown(1)
    clickDown(1)
    clickDown(1)

    const row = screen.getAllByTestId('filmstrip-row')[1]
    expect(within(row).getByRole('heading').textContent).toBe('Ben')
    const downButton = within(row).getByRole('button', { name: /down$/i })
    expect(downButton.className).toContain('text-transparent')

    // A further click is a no-op — Ben stays at the real bottom rank.
    fireEvent.click(downButton)
    act(() => { vi.advanceTimersByTime(1000) })
    expect(rowNames()[4]).toBe('Ben')
  })

  it('a pinned artist removed from the list mid-pin releases cleanly without crashing', () => {
    vi.useFakeTimers()
    function RemovableHarness() {
      const [artists, setArtists] = useState(makeArtists())
      const sorted = artists.slice().sort((a, b) => a.rank - b.rank)
      return (
        <div>
          <button onClick={() => setArtists((prev) => prev.filter((a) => a.id !== 'eve'))}>remove eve</button>
          <FilmstripView
            artists={sorted}
            onOpenArtist={() => {}}
            onSetRank={(id, rank) => setArtists((prev) => rerank(prev, id, rank))}
            onSetStatus={() => {}}
          />
        </div>
      )
    }
    render(<RemovableHarness />)

    clickUp(4) // pin Eve
    expect(rowNames()[4]).toBe('Eve')

    fireEvent.click(screen.getByText('remove eve'))

    expect(() => rowNames()).not.toThrow()
    expect(rowNames()).toEqual(['Ana', 'Ben', 'Cleo', 'Dev'])
  })

  it('▲/▼ aria-labels include the artist display name', () => {
    render(<Harness initial={makeArtists()} />)
    expect(screen.getByRole('button', { name: 'Move Ana up' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move Ana down' })).toBeInTheDocument()
  })
})
