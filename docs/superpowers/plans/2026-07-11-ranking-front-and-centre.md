# Ranking Front-and-Centre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put ranking front-and-centre on the Wall home — a slim always-visible Top-5 dock with one-tap up/down, plus one consolidated full-screen Rank board.

**Architecture:** Two new v2-token components (`RankRail`, `RankBoard`) owned by `Wall`, both driving re-rank through pure helpers in `src/data/ranking.js`. No new data shape — every artist keeps its single global `rank` integer; "top 5" is `rank <= 5`. Existing ranking surfaces (Gallery views, `/pipeline` Top 5) are left untouched.

**Tech Stack:** React 18, React Router v7, Tailwind (v2 token set), Vitest + @testing-library/react.

Design spec: `docs/superpowers/specs/2026-07-11-ranking-front-and-centre-design.md`.

## Global Constraints

- **v2 tokens only** in new UI: `v2-ink`, `v2-surface`, `v2-cream`, `v2-muted`, `v2-accent`, `v2-hairline`, `font-v2-display`, `font-v2-ui`. Do NOT use `ink-*` / `cream` / `accent`.
- **Single global rank invariant:** after every helper call, `rank` is contiguous `1..N`.
- **Preserve artists array order:** ranking helpers must change only `rank` values and return artists in their **original array order** (the Wall masonry, `buildWallItems`, iterates array order — re-sorting would reshuffle it).
- **Functional state updates:** every rank mutation uses `setArtists(prev => helper(prev, ...))`, never `setArtists(helper(artists, ...))` (stale-closure taps).
- **No drag-to-reorder, no exact-rank typing** (cut/deferred per review). ▲/▼ + "To top 5" / "Drop" only.
- **Tests live in `src/test/`**; run with `npm test`. `npm test` is pinned to the local backend.
- **Commit style:** terse conventional, NO attribution trailers (`feat(rank): …`, `docs: …`).
- **Deviation from spec (deliberate):** `RankBoard` opens ONLY from the `RankRail` "Rank ⤢" button, not from the `⋯` drawer. The drawer lives at App scope (sibling to `Wall`) and navigates via router links, while `RankBoard` needs `Wall`'s `artists`/`setArtists`; wiring the drawer would force lifting board state to App for no benefit, since the rail is always visible on the home. No drawer change in this plan.

---

## File Structure

- `src/data/ranking.js` (modify) — refactor `rerankWithMove` to preserve array order; add `moveToRank`, `moveByDelta`, `moveUp`, `moveDown`, `moveToTop`.
- `src/test/ranking.test.js` (modify) — add tests for the new helpers + order-preservation + normalization.
- `src/components/RankRail.jsx` (create) — the Top-5 dock on the Wall.
- `src/test/RankRail.test.jsx` (create).
- `src/components/RankBoard.jsx` (create) — full-screen consolidated board.
- `src/test/RankBoard.test.jsx` (create).
- `src/pages/Wall.jsx` (modify) — render `RankRail` above `ConsiderShelf`; own `RankBoard` open state; coordinate body-scroll lock.
- `src/pages/Help.jsx` (modify) + `docs/` (modify) — docs-sync for the new home ranking UI.

---

## Task 1: `ranking.js` engine — order-preserving helpers

**Files:**
- Modify: `src/data/ranking.js`
- Test: `src/test/ranking.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `moveToRank(artists, id, rank) => artists` — move to 1-based `rank` (clamped 1..N).
  - `moveByDelta(artists, id, delta) => artists` — move by relative offset (clamped).
  - `moveUp(artists, id) => artists`, `moveDown(artists, id) => artists`, `moveToTop(artists, id) => artists`.
  - All return artists in **original array order** with contiguous `1..N` `rank`; unknown `id` returns input unchanged.
  - Existing `moveIntoTop5` / `moveOutOfTop5` keep their signatures and behaviour.

- [ ] **Step 1: Write the failing tests**

Add to `src/test/ranking.test.js` (keep the existing imports; extend the import line):

```js
import {
  computeSwipeRanking,
  moveIntoTop5,
  moveOutOfTop5,
  moveUp,
  moveDown,
  moveToTop,
  moveByDelta,
  moveToRank,
} from '../data/ranking'

describe('rank move helpers', () => {
  // Original array order is intentionally NOT rank order, to prove helpers
  // preserve array order (Wall masonry stability) while fixing ranks.
  const A = [
    { id: 'c', rank: 3 },
    { id: 'a', rank: 1 },
    { id: 'e', rank: 5 },
    { id: 'b', rank: 2 },
    { id: 'd', rank: 4 },
  ]
  const rankOf = (list, id) => list.find((x) => x.id === id).rank

  it('moveUp swaps an artist with the one above and re-ranks 1..N', () => {
    const r = moveUp(A, 'b') // rank 2 -> 1
    expect(rankOf(r, 'b')).toBe(1)
    expect(rankOf(r, 'a')).toBe(2)
    expect(r.map((x) => x.rank).sort((m, n) => m - n)).toEqual([1, 2, 3, 4, 5])
  })

  it('moveUp on rank 1 is a no-op', () => {
    const r = moveUp(A, 'a')
    expect(rankOf(r, 'a')).toBe(1)
  })

  it('moveDown on the last rank is a no-op', () => {
    const r = moveDown(A, 'e') // already rank 5
    expect(rankOf(r, 'e')).toBe(5)
  })

  it('moveDown moves an artist down one slot', () => {
    const r = moveDown(A, 'a') // rank 1 -> 2
    expect(rankOf(r, 'a')).toBe(2)
    expect(rankOf(r, 'b')).toBe(1)
  })

  it('moveToTop makes the artist rank 1', () => {
    const r = moveToTop(A, 'd') // rank 4 -> 1
    expect(rankOf(r, 'd')).toBe(1)
    expect(rankOf(r, 'a')).toBe(2)
  })

  it('preserves the original array order (only rank changes)', () => {
    const r = moveToTop(A, 'e')
    expect(r.map((x) => x.id)).toEqual(['c', 'a', 'e', 'b', 'd'])
  })

  it('unknown id returns input unchanged', () => {
    expect(moveUp(A, 'zzz')).toBe(A)
  })

  it('normalizes duplicate/missing ranks to contiguous 1..N on any move', () => {
    const messy = [
      { id: 'x', rank: 2 },
      { id: 'y', rank: 2 }, // duplicate
      { id: 'z' },          // missing rank -> sorts last
    ]
    const r = moveUp(messy, 'z')
    expect(r.map((a) => a.rank).sort((m, n) => m - n)).toEqual([1, 2, 3])
  })

  it('moveToRank clamps out-of-range ranks', () => {
    expect(rankOf(moveToRank(A, 'a', 99), 'a')).toBe(5)
    expect(rankOf(moveToRank(A, 'e', -3), 'e')).toBe(1)
  })

  it('moveByDelta is a no-op at the ends', () => {
    expect(rankOf(moveByDelta(A, 'a', -1), 'a')).toBe(1)
    expect(rankOf(moveByDelta(A, 'e', +1), 'e')).toBe(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/ranking.test.js`
Expected: FAIL — `moveUp`/`moveDown`/`moveToTop`/`moveByDelta`/`moveToRank` are not exported.

- [ ] **Step 3: Refactor `ranking.js`**

Replace the top of `src/data/ranking.js` (the `BUCKET_ORDER` line through the `moveOutOfTop5` export) with:

```js
const BUCKET_ORDER = { top: 0, maybe: 1, pass: 2 }

// Sort comparator that tolerates missing / non-numeric ranks (they sort last).
// JS Array.sort is stable, so equal/absent ranks keep their current order.
function byRank(a, b) {
  const ra = Number.isFinite(a.rank) ? a.rank : Infinity
  const rb = Number.isFinite(b.rank) ? b.rank : Infinity
  return ra - rb
}

// Move one artist to a target 0-based position in rank order, recompute ranks
// 1..N, and return artists in their ORIGINAL array order (only `rank` changes)
// so array-order consumers like the Wall masonry (buildWallItems) stay stable.
// Also self-heals duplicate/missing ranks into a contiguous 1..N.
function rerankWithMove(artists, id, targetIndex) {
  const order = artists.slice().sort(byRank)
  const from = order.findIndex((a) => a.id === id)
  if (from === -1) return artists
  const [moved] = order.splice(from, 1)
  order.splice(Math.max(0, Math.min(order.length, targetIndex)), 0, moved)
  const rankById = new Map(order.map((a, i) => [a.id, i + 1]))
  return artists.map((a) => ({ ...a, rank: rankById.get(a.id) }))
}

// Move to an explicit 1-based rank (clamped 1..N).
export const moveToRank = (artists, id, rank) => rerankWithMove(artists, id, rank - 1)

// Move by a relative offset in rank order (+1 down, -1 up); clamped at the ends.
export function moveByDelta(artists, id, delta) {
  const order = artists.slice().sort(byRank)
  const from = order.findIndex((a) => a.id === id)
  if (from === -1) return artists
  return rerankWithMove(artists, id, from + delta)
}

export const moveUp = (artists, id) => moveByDelta(artists, id, -1)
export const moveDown = (artists, id) => moveByDelta(artists, id, 1)
export const moveToTop = (artists, id) => moveToRank(artists, id, 1)

// Pulling in lands at the bottom of the top 5; dropping out lands just below it.
export const moveIntoTop5 = (artists, id) => moveToRank(artists, id, 5)
export const moveOutOfTop5 = (artists, id) => moveToRank(artists, id, 6)
```

Leave `computeSwipeRanking` below unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/ranking.test.js`
Expected: PASS (existing `computeSwipeRanking` / `moveIntoTop5` / `moveOutOfTop5` tests still green — they assert ranks via `.find`, not array position).

- [ ] **Step 5: Commit**

```bash
git add src/data/ranking.js src/test/ranking.test.js
git commit -m "feat(rank): order-preserving move helpers (up/down/top, byDelta, toRank)"
```

---

## Task 2: `RankRail` — the Top-5 dock

**Files:**
- Create: `src/components/RankRail.jsx`
- Test: `src/test/RankRail.test.jsx`

**Interfaces:**
- Consumes: `moveUp`, `moveDown` from `../data/ranking`; `ArtistImage` from `./ArtistImage`.
- Produces: `<RankRail artists setArtists onOpenBoard />` — default export.
  - `artists`: full artist array. `setArtists`: functional setter. `onOpenBoard`: `() => void`.

- [ ] **Step 1: Write the failing test**

Create `src/test/RankRail.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RankRail from '../components/RankRail'

const artists = [
  { id: 'a', handle: 'a', name: 'Aaa', rank: 1, images: ['a.jpg'] },
  { id: 'b', handle: 'b', name: 'Bbb', rank: 2, images: ['b.jpg'] },
  { id: 'c', handle: 'c', name: 'Ccc', rank: 3, images: [] },
  { id: 'd', handle: 'd', name: 'Ddd', rank: 4, images: [] },
  { id: 'e', handle: 'e', name: 'Eee', rank: 5, images: [] },
  { id: 'f', handle: 'f', name: 'Fff', rank: 6, images: [] },
]

it('renders the five lowest-rank artists in order', () => {
  render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={vi.fn()} />)
  const tiles = screen.getAllByTestId('rank-tile')
  expect(tiles).toHaveLength(5)
  expect(tiles[0]).toHaveTextContent('Aaa')
  expect(tiles[4]).toHaveTextContent('Eee')
})

it('moves an artist up via the functional setter', () => {
  const setArtists = vi.fn()
  render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Bbb up/i }))
  const updater = setArtists.mock.calls[0][0]
  const next = updater(artists)
  expect(next.find((x) => x.id === 'b').rank).toBe(1)
})

it('▲ on rank 1 is a no-op result', () => {
  const setArtists = vi.fn()
  render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Aaa up/i }))
  const next = setArtists.mock.calls[0][0](artists)
  expect(next.find((x) => x.id === 'a').rank).toBe(1)
})

it('▼ on the visible rank-5 tile pushes it to rank 6', () => {
  const setArtists = vi.fn()
  render(<RankRail artists={artists} setArtists={setArtists} onOpenBoard={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /move Eee down/i }))
  const next = setArtists.mock.calls[0][0](artists)
  expect(next.find((x) => x.id === 'e').rank).toBe(6)
  expect(next.find((x) => x.id === 'f').rank).toBe(5)
})

it('renders even when no artist has images', () => {
  const noImgs = artists.map((a) => ({ ...a, images: [] }))
  render(<RankRail artists={noImgs} setArtists={vi.fn()} onOpenBoard={vi.fn()} />)
  expect(screen.getAllByTestId('rank-tile')).toHaveLength(5)
})

it('opens the board', () => {
  const onOpenBoard = vi.fn()
  render(<RankRail artists={artists} setArtists={vi.fn()} onOpenBoard={onOpenBoard} />)
  fireEvent.click(screen.getByRole('button', { name: /^rank$/i }))
  expect(onOpenBoard).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/RankRail.test.jsx`
Expected: FAIL — cannot find `../components/RankRail`.

- [ ] **Step 3: Implement `RankRail.jsx`**

Create `src/components/RankRail.jsx`:

```jsx
import { moveUp, moveDown } from '../data/ranking'
import ArtistImage from './ArtistImage'

const label = (a) => a.name || `@${a.handle}`

// Slim always-visible Top-5 dock on the Wall. One low row so it never pushes
// the image masonry below the fold. ▲/▼ use true global move semantics.
export default function RankRail({ artists = [], setArtists = () => {}, onOpenBoard = () => {} }) {
  if (artists.length === 0) return null

  const top5 = artists.slice().sort((a, b) => a.rank - b.rank).slice(0, 5)

  return (
    <section
      aria-label="Your top five"
      className="sticky top-[3.25rem] z-[9] flex items-center gap-3 px-4 py-2 bg-v2-ink/[.92] backdrop-blur-md border-b border-v2-hairline"
    >
      <span className="font-v2-ui text-[0.6875rem] tracking-[0.28em] uppercase text-v2-accent shrink-0">
        Top 5
      </span>

      <ol className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-thin">
        {top5.map((a, i) => (
          <li
            key={a.id}
            data-testid="rank-tile"
            className="flex items-center gap-1.5 shrink-0 bg-v2-surface border border-v2-hairline rounded-sm pl-1.5 pr-1 py-1"
          >
            <span className="font-v2-display text-v2-accent text-sm w-4 text-center">{i + 1}</span>
            <span className="w-7 h-7 rounded-sm overflow-hidden shrink-0">
              <ArtistImage src={a.images?.[0]} label={label(a)} className="w-full h-full object-cover" monogramClassName="text-[0.625rem]" />
            </span>
            <span className="font-v2-ui text-xs text-v2-cream max-w-[6.5rem] truncate">{label(a)}</span>
            <span className="flex flex-col">
              <button
                aria-label={`Move ${label(a)} up`}
                onClick={() => setArtists((prev) => moveUp(prev, a.id))}
                className="text-v2-muted hover:text-v2-cream text-[0.6875rem] leading-none px-1"
              >
                ▲
              </button>
              <button
                aria-label={`Move ${label(a)} down`}
                onClick={() => setArtists((prev) => moveDown(prev, a.id))}
                className="text-v2-muted hover:text-v2-cream text-[0.6875rem] leading-none px-1"
              >
                ▼
              </button>
            </span>
          </li>
        ))}
      </ol>

      <button
        onClick={onOpenBoard}
        className="shrink-0 font-v2-ui text-xs text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-3 py-1.5 transition-colors"
      >
        Rank ⤢
      </button>
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/RankRail.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/RankRail.jsx src/test/RankRail.test.jsx
git commit -m "feat(rank): RankRail top-5 dock with one-tap up/down"
```

---

## Task 3: `RankBoard` — consolidated full-screen board

**Files:**
- Create: `src/components/RankBoard.jsx`
- Test: `src/test/RankBoard.test.jsx`

**Interfaces:**
- Consumes: `moveUp`, `moveDown`, `moveIntoTop5`, `moveOutOfTop5` from `../data/ranking`; `ArtistImage`.
- Produces: `<RankBoard artists setArtists onClose />` — default export. `onClose`: `() => void`.

- [ ] **Step 1: Write the failing test**

Create `src/test/RankBoard.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import RankBoard from '../components/RankBoard'

const artists = [
  { id: 'a', handle: 'a', name: 'Aaa', rank: 1, images: ['a.jpg'] },
  { id: 'b', handle: 'b', name: 'Bbb', rank: 2, images: [] },
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/RankBoard.test.jsx`
Expected: FAIL — cannot find `../components/RankBoard`.

- [ ] **Step 3: Implement `RankBoard.jsx`**

Create `src/components/RankBoard.jsx`:

```jsx
import { useEffect } from 'react'
import { moveUp, moveDown, moveIntoTop5, moveOutOfTop5 } from '../data/ranking'
import ArtistImage from './ArtistImage'

const label = (a) => a.name || `@${a.handle}`

function Cover({ artist, size }) {
  return (
    <span className={`${size} rounded-sm overflow-hidden shrink-0 block`}>
      <ArtistImage src={artist.images?.[0]} label={label(artist)} className="w-full h-full object-cover" monogramClassName="text-sm" />
    </span>
  )
}

function NudgeButtons({ artist, setArtists }) {
  return (
    <span className="flex flex-col shrink-0">
      <button
        aria-label={`Move ${label(artist)} up`}
        onClick={() => setArtists((prev) => moveUp(prev, artist.id))}
        className="text-v2-muted hover:text-v2-cream text-xs leading-none px-2 py-0.5"
      >
        ▲
      </button>
      <button
        aria-label={`Move ${label(artist)} down`}
        onClick={() => setArtists((prev) => moveDown(prev, artist.id))}
        className="text-v2-muted hover:text-v2-cream text-xs leading-none px-2 py-0.5"
      >
        ▼
      </button>
    </span>
  )
}

// One consolidated full-screen ranking home. Top 5 pinned; everyone else below.
export default function RankBoard({ artists = [], setArtists = () => {}, onClose = () => {} }) {
  // Own the body-scroll lock, saving/restoring the previous value so this and
  // the WallViewer never clobber each other's overflow.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sorted = artists.slice().sort((a, b) => a.rank - b.rank)
  const top5 = sorted.slice(0, 5)
  const rest = sorted.slice(5)

  return (
    <div className="fixed inset-0 z-[60] bg-v2-ink flex flex-col animate-fade-in">
      <header className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-v2-hairline">
        <h2 className="font-v2-display text-v2-cream text-lg tracking-wide">Rank artists</h2>
        <button
          onClick={onClose}
          className="font-v2-ui text-sm text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-4 py-1.5 transition-colors"
        >
          Done
        </button>
      </header>

      {artists.length === 0 ? (
        <div className="flex-1 flex items-center justify-center px-6 text-center">
          <p className="font-v2-ui text-v2-muted text-sm">Add artists to start ranking.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="font-v2-ui text-[0.6875rem] tracking-[0.28em] uppercase text-v2-accent mb-2">Top 5</p>
          <ul data-testid="board-top5" className="mb-8">
            {top5.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2 border-b border-v2-hairline/60">
                <span className="font-v2-display text-v2-accent text-xl w-6 text-center shrink-0">{a.rank}</span>
                <Cover artist={a} size="w-11 h-11" />
                <span className="font-v2-ui text-sm text-v2-cream flex-1 truncate">{label(a)}</span>
                <NudgeButtons artist={a} setArtists={setArtists} />
                <button
                  aria-label={`Drop ${label(a)} out of top 5`}
                  onClick={() => setArtists((prev) => moveOutOfTop5(prev, a.id))}
                  className="shrink-0 font-v2-ui text-xs text-v2-muted hover:text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-2.5 py-1.5 transition-colors"
                >
                  Drop ↓
                </button>
              </li>
            ))}
          </ul>

          {rest.length > 0 && (
            <>
              <p className="font-v2-ui text-[0.6875rem] tracking-[0.28em] uppercase text-v2-muted mb-2">Everyone else</p>
              <ul data-testid="board-rest">
                {rest.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-1.5 border-b border-v2-hairline/40">
                    <span className="font-v2-ui text-v2-muted text-sm w-6 text-center shrink-0">{a.rank}</span>
                    <Cover artist={a} size="w-8 h-8" />
                    <span className="font-v2-ui text-sm text-v2-cream flex-1 truncate">{label(a)}</span>
                    <NudgeButtons artist={a} setArtists={setArtists} />
                    <button
                      aria-label={`Move ${label(a)} into top 5`}
                      onClick={() => setArtists((prev) => moveIntoTop5(prev, a.id))}
                      className="shrink-0 font-v2-ui text-xs text-v2-muted hover:text-v2-accent border border-v2-hairline hover:border-v2-accent rounded-sm px-2.5 py-1.5 transition-colors"
                    >
                      ↑ To top 5
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/RankBoard.test.jsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/RankBoard.jsx src/test/RankBoard.test.jsx
git commit -m "feat(rank): RankBoard consolidated full-screen ranking home"
```

---

## Task 4: Wire `RankRail` + `RankBoard` into the Wall

**Files:**
- Modify: `src/pages/Wall.jsx`
- Test: `src/test/RankRail.test.jsx` / `src/test/RankBoard.test.jsx` already cover component behaviour; this task is verified by build + the existing Wall integration (no new unit test — the wiring is a straight render, and `Wall` has no test harness for its data hooks). Verify manually via the dev server in Step 4.

**Interfaces:**
- Consumes: `RankRail`, `RankBoard` (Tasks 2–3); `Wall`'s existing `artists` / `setArtists` props.
- Produces: nothing downstream.

- [ ] **Step 1: Add imports + board state to `Wall.jsx`**

In `src/pages/Wall.jsx`, add to the import block (near the other component imports):

```jsx
import RankRail from '../components/RankRail'
import RankBoard from '../components/RankBoard'
```

Inside the `Wall` component body, alongside the other `useState` hooks (e.g. next to `const [addArtistOpen, setAddArtistOpen] = useState(false)`), add:

```jsx
const [rankBoardOpen, setRankBoardOpen] = useState(false)
```

- [ ] **Step 2: Render `RankRail` above the Consider shelf**

In the returned JSX, immediately **after** the `{!viewerOpen && (<Bar .../> )}` block and **before** the `{items.length > 0 && (<ConsiderShelf …`, insert:

```jsx
{!viewerOpen && (
  <RankRail
    artists={artists}
    setArtists={setArtists}
    onOpenBoard={() => setRankBoardOpen(true)}
  />
)}
```

- [ ] **Step 3: Render `RankBoard` overlay**

Just before the closing `</div>` of the outer `min-h-screen` wrapper (e.g. after the `{addArtistOpen && (…)}` block), add:

```jsx
{rankBoardOpen && (
  <RankBoard
    artists={artists}
    setArtists={setArtists}
    onClose={() => setRankBoardOpen(false)}
  />
)}
```

- [ ] **Step 4: Verify build + run the app**

Run: `npm run build`
Expected: build succeeds.

Then verify behaviour against a local-backend dev server with a seeded session (per CLAUDE.md "Verifying in the browser"):

```bash
VITE_BACKEND=local npm run dev -- --port 5199
```

Confirm on `/`: the Top-5 dock shows above the Consider shelf; ▲/▼ reorder the dock and the change persists; "Rank ⤢" opens the full board; "Drop ↓" / "↑ To top 5" and the board's ▲/▼ work; "Done"/Escape closes it and the wall scroll is restored.

- [ ] **Step 5: Run the full suite + commit**

Run: `npm test`
Expected: all green (rerun the flaky `useArtistStorage` image-migration spec in isolation if it alone fails — see CLAUDE.md).

```bash
git add src/pages/Wall.jsx
git commit -m "feat(rank): surface RankRail + RankBoard on the Wall home"
```

---

## Task 5: Docs sync (Help + guide)

**Files:**
- Modify: `src/pages/Help.jsx` (the ranking-related `SECTIONS` entry)
- Modify: the matching `docs/NN-*.md` ranking guide page
- Re-capture: any affected `public/guide/*.png` per `docs/MAINTAINING.md`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Find the ranking docs**

Run: `grep -rln "rank\|Rank\|top 5\|Top 5\|filmstrip" docs src/pages/Help.jsx`
Read the matched `docs/NN-*.md` and the ranking `SECTIONS` block in `src/pages/Help.jsx`.

- [ ] **Step 2: Update the copy**

Edit both the `docs/NN-*.md` ranking page and the matching `Help.jsx` `SECTIONS` entry to describe the new home flow: "Your Top 5 sits at the top of the home screen — nudge artists up or down with ▲/▼, or tap **Rank ⤢** to open the full board where you can drop artists out of or into your Top 5 and reorder everyone." Keep wording consistent between the two files.

- [ ] **Step 3: Re-capture affected screenshots (if the ranking page shows one)**

Follow the exact Playwright + sample-data steps in `docs/MAINTAINING.md`. Then run the image cross-check command from `docs/MAINTAINING.md` to confirm every `public/guide/*.png` is referenced and every reference resolves.

- [ ] **Step 4: Verify docs drift check passes**

Run: `bash scripts/docs-drift-check.sh`
Expected: no outstanding "UI changed but docs didn't" warning for this change.

- [ ] **Step 5: Commit**

```bash
git add docs src/pages/Help.jsx public/guide
git commit -m "docs: home Top-5 dock + Rank board in guide and Help"
```

---

## Self-Review

**Spec coverage:**
- Slim Top-5 dock, `artists.length > 0` gate, true ▲/▼ semantics, glyph fallback → Task 2. ✓
- Consolidated board (Top 5 + rest, Drop / To-top-5, ▲/▼, empty state, scroll-lock coordination) → Task 3. ✓
- Engine primitives `moveByDelta` / `moveToRank` + wrappers + normalization + order preservation → Task 1. ✓
- Functional `setArtists` updates → enforced in Tasks 2–4 code and asserted in tests. ✓
- Legacy surfaces untouched → no task modifies Gallery/Dashboard/ranking entry points (Global Constraints). ✓
- Drawer deviation documented → Global Constraints. ✓
- Docs sync → Task 5. ✓
- Drag + exact-rank cut/deferred → absent from all tasks by design. ✓

**Placeholder scan:** none — every code/test/command step is concrete. Task 5's screenshot step defers to `docs/MAINTAINING.md` (an existing runbook), not a placeholder.

**Type consistency:** helper names (`moveUp`, `moveDown`, `moveToTop`, `moveByDelta`, `moveToRank`, `moveIntoTop5`, `moveOutOfTop5`) are consistent across Tasks 1–3. Component props (`artists`, `setArtists`, `onOpenBoard`, `onClose`) match between definitions (Tasks 2–3) and wiring (Task 4).
