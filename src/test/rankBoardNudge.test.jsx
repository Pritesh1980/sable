import { describe, it, expect, vi, afterEach } from 'vitest'
import { useState } from 'react'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import RankBoard from '../components/RankBoard'

// 8 artists: 5 in Top 5 (ranks 1-5), 3 in "everyone else" (ranks 6-8) — enough
// to exercise a nudge that crosses the top5/rest boundary while pinned.
function makeArtists() {
  return ['Ana', 'Ben', 'Cleo', 'Dev', 'Eve', 'Fin', 'Gus', 'Hal'].map((name, i) => ({
    id: name.toLowerCase(),
    handle: name.toLowerCase(),
    name,
    images: [],
    rank: i + 1,
  }))
}

function Harness() {
  const [artists, setArtists] = useState(makeArtists())
  return <RankBoard artists={artists} setArtists={setArtists} onClose={() => {}} />
}

function allRows() {
  return screen.getAllByTestId('rank-board-row')
}

function rowNames() {
  return allRows().map((row) => within(row).getByText(/^[A-Z][a-z]+$/).textContent)
}

function clickUp(rowIndex) {
  const row = allRows()[rowIndex]
  fireEvent.click(within(row).getByRole('button', { name: /^move .* up$/i }))
}

function clickDown(rowIndex) {
  const row = allRows()[rowIndex]
  fireEvent.click(within(row).getByRole('button', { name: /^move .* down$/i }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RankBoard — rank-nudge pin', () => {
  it('rapid clicks on the same visual row keep targeting the same artist', () => {
    vi.useFakeTimers()
    render(<Harness />)

    expect(rowNames()).toEqual(['Ana', 'Ben', 'Cleo', 'Dev', 'Eve', 'Fin', 'Gus', 'Hal'])

    // Eve starts at rank 5 (row index 4). Two clicks take her to rank 3 — a
    // fresh positional query each time, exactly like a cursor not moving.
    for (let i = 0; i < 2; i++) {
      expect(within(allRows()[4]).getByText('Eve')).toBeInTheDocument()
      clickUp(4)
    }
    expect(rowNames()[4]).toBe('Eve')

    act(() => { vi.advanceTimersByTime(1000) })
    expect(rowNames()).toEqual(['Ana', 'Ben', 'Eve', 'Cleo', 'Dev', 'Fin', 'Gus', 'Hal'])
  })

  it('clicking a different row switches the pin to it immediately', () => {
    vi.useFakeTimers()
    render(<Harness />)

    clickUp(4) // pin Eve at index 4
    expect(rowNames()[4]).toBe('Eve')

    expect(rowNames()[1]).toBe('Ben')
    clickUp(1) // switch the pin to Ben
    clickUp(1)
    expect(rowNames()[1]).toBe('Ben')
  })

  it('a nudge that crosses the Top 5 / rest boundary stays pinned in its starting list until it settles', () => {
    vi.useFakeTimers()
    render(<Harness />)

    // Eve is rank 5 — last in Top 5 (row index 4). Pushing her down moves her
    // true rank to 6, which belongs in "everyone else" — but while pinned she
    // must stay rendered at index 4 (still inside Top 5), not jump lists.
    clickDown(4)
    expect(within(screen.getByTestId('board-top5')).getByText('Eve')).toBeInTheDocument()
    expect(rowNames()[4]).toBe('Eve')

    act(() => { vi.advanceTimersByTime(1000) })

    // Settled: Eve is now rank 6, in the "rest" section.
    expect(within(screen.getByTestId('board-rest')).getByText('Eve')).toBeInTheDocument()
    expect(within(screen.getByTestId('board-top5')).queryByText('Eve')).toBeNull()
  })

  it('a pinned artist removed from the list mid-pin releases cleanly without crashing', () => {
    vi.useFakeTimers()
    function RemovableHarness() {
      const [artists, setArtists] = useState(makeArtists())
      return (
        <div>
          <button onClick={() => setArtists((prev) => prev.filter((a) => a.id !== 'eve'))}>remove eve</button>
          <RankBoard artists={artists} setArtists={setArtists} onClose={() => {}} />
        </div>
      )
    }
    render(<RemovableHarness />)

    clickUp(4)
    expect(rowNames()[4]).toBe('Eve')

    fireEvent.click(screen.getByText('remove eve'))

    expect(() => rowNames()).not.toThrow()
    expect(rowNames()).toEqual(['Ana', 'Ben', 'Cleo', 'Dev', 'Fin', 'Gus', 'Hal'])
  })
})
