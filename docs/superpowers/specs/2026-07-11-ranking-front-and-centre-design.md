# Ranking front-and-centre on the Wall — Design

**Date:** 2026-07-11
**Status:** Approved (design), pending implementation plan

## Problem

Ranking is one of Sable's most-built features, but the capability is **scattered and
hidden**. On the landing page — the **Wall** (`/`) — ranking has zero presence: the
Top 5 lives a click away on `/pipeline` (Dashboard), and the reorder tools are spread
across Gallery view-modes (swipe-rank, drag grid, filmstrip nudge). The user's three
pain points:

1. **Top 5 is not front-and-centre** — it should be the first thing seen on open.
2. **Scattered** — no single obvious place to rank.
3. **Moving up/down is fiddly** — especially on iPhone (drag-reorder is unreliable on
   touch).

This is a **surface + interaction** problem, not a data problem. Every artist already
carries a single global `rank` integer, and `src/data/ranking.js` already exposes
`moveIntoTop5` / `moveOutOfTop5`.

## Goal

Give ranking one obvious home on the Wall, with the **Top 5 pinned at the top** and
**dead-simple ▲/▼ up-down controls**, without turning the image-first Wall into a
spreadsheet.

## Approach (chosen: A)

Two new surfaces backed by one shared engine:

1. **`RankRail`** — a Top 5 strip on the Wall home, with inline up/down.
2. **`RankBoard`** — one consolidated full-screen ranking board (Top 5 + full list).
3. **`ranking.js`** — extended with pure, tested move helpers.

Rejected alternatives:
- **B (inline Top 5 only)** — leaves the full list scattered in Gallery.
- **C (rank overlay from bar only)** — keeps the Wall pure but ranking stays one tap
  away rather than front-and-centre.

## Design tokens

The Wall uses the **v2 token set** (`v2-ink`, `v2-cream`, `v2-accent`, `v2-hairline`,
`font-v2-display`, `font-v2-ui`). The existing `Top5Hero` / `FilmstripView` use the
older `ink-*` / `cream` / `accent` palette. **Both new components must be built in v2
tokens** so they sit natively on the Wall — `Top5Hero` cannot be dropped in as-is.

## Components

### 1. `RankRail` — Top 5 strip (on the Wall)

- Slim horizontal strip pinned directly under the top `Bar`, **above** the
  `ConsiderShelf`, rendered only when `items.length > 0` (consistent with the shelf).
- Five cover tiles in rank order (`rank <= 5`), each showing the artist's cover image
  (`images[0]`) with a monogram / rank-number fallback when no image (mirror
  `Top5Hero`'s `CoverTile` degrade behaviour).
- Each tile carries **▲ / ▼** controls with large touch targets. ▲ on rank-2 makes it
  rank-1 (global re-rank). ▲ on rank-1 and ▼ on the last-shown tile are no-ops
  (disabled / non-interactive).
- A **"Rank ⤢"** affordance on the right opens `RankBoard`.
- **Render condition:** like `ConsiderShelf`, `RankRail` renders only when there is at
  least one artist. It always has tiles to show in that case (ranked artists fall back
  to a monogram glyph when they have no image), so there is no separate "empty rail"
  state — the zero-artist case is already handled by the Wall's own "bare wall"
  prompt. The `RankBoard` owns the zero-artist empty state instead.
- Restrained, editorial styling — reads as chrome, not a table.

### 2. `RankBoard` — consolidated full-screen board (overlay)

Opened from `RankRail`'s "Rank ⤢" button and from the `⋯` drawer's ranking entry.
Full-screen overlay in v2 style. Locks body scroll while open (reuse the Wall's
existing `viewerOpen` overflow pattern).

- **Top 5 section** (pinned at top): larger rows for `rank <= 5` — rank number, cover,
  name, and a one-tap **"Drop ↓"** that benches the artist (`moveOutOfTop5`).
- **Everyone else** (scrollable): ranked list of `rank > 5` — each row has **▲ / ▼**
  (move one slot), the rank number (tap to type an exact rank — reuse the
  `FilmstripRow` inline-edit pattern, clamped 1..N), cover thumb, name, and a
  **"↑ To top 5"** action (`moveIntoTop5`).
- **Drag-to-reorder** is a progressive enhancement layered on top of ▲/▼; ▲/▼ is the
  guaranteed touch path and ships first.
- Close/Done returns to the Wall.

### 3. `ranking.js` — shared engine (extended)

Add pure helpers beside the existing `moveIntoTop5` / `moveOutOfTop5`, all thin
wrappers over the existing private `rerankWithMove`:

- `moveUp(artists, id)` — move one slot toward rank 1; no-op if already rank 1.
- `moveDown(artists, id)` — move one slot toward the end; no-op if already last.
- `moveToTop(artists, id)` — move to rank 1.

All preserve the single global **1..N contiguous `rank`** invariant. No new data shape.

## Data flow

`Wall` already receives `artists` and `setArtists` (App.jsx). `RankRail` and
`RankBoard` compute a re-ranked array via the `ranking.js` helpers and pass it to
`setArtists` — identical to how `Gallery` already applies drag-reorder. Persistence,
storage, and sync are unchanged (the existing `useArtistStorage` path).

## What gets consolidated (not deleted)

- The `⋯` drawer's existing "ranking" pointer now targets `RankBoard`.
- `/pipeline` Dashboard `Top5Hero` and Gallery's swipe / grid / filmstrip stay as-is —
  they remain valid browsing / bulk tools and feed the same global `rank`. We are
  **adding the canonical home**, not removing working code. Low-risk and reversible.

## Error handling / edge cases

- Fewer than 5 ranked artists: `RankRail` shows only the available tiles; ▼ on the
  last tile is a no-op.
- No images: cover tiles degrade to monogram / rank glyph.
- Move helpers on an unknown id return the input unchanged.
- Rank invariant stays contiguous 1..N after every operation.

## Testing (TDD)

Write tests first.

**`ranking.js` (pure):**
- `moveUp` at rank 1 is a no-op; otherwise swaps with the artist above and re-ranks 1..N.
- `moveDown` at last rank is a no-op; otherwise moves down one.
- `moveToTop` makes the artist rank 1 and shifts the rest down.
- Unknown id returns input unchanged.
- Result is always contiguous 1..N.

**`RankRail` (RTL):**
- Renders the 5 lowest-rank artists as tiles in order.
- ▲ on the rank-2 tile calls `setArtists` with that artist at rank 1.
- ▲ disabled/no-op on rank-1; ▼ no-op on the last shown tile (rail reorders *within*
  the visible top 5; dropping in/out of the top 5 is the board's job).
- "Rank ⤢" opens the board.

**`RankBoard` (RTL):**
- Top 5 section lists `rank <= 5`; "everyone else" lists `rank > 5`.
- "Drop ↓" moves a top-5 artist out (`moveOutOfTop5`).
- "↑ To top 5" moves a benched artist in (`moveIntoTop5`).
- ▲ / ▼ on a list row moves it one slot.
- Exact-rank input clamps to 1..N.
- Zero-artist empty state renders a prompt (e.g. "Add artists to start ranking").

## Scope guard (YAGNI)

- No new persisted fields; "top 5" is simply `rank <= 5`.
- No tiers, no separate top-5 list.
- No animations beyond what v2 already uses.
- Drag-reorder in `RankBoard` is enhancement-only; ▲/▼ is the shippable core.

## Docs

Per `.claude/rules/docs-sync.md`, this changes UI under `src/pages/` and
`src/components/`, so the ranking guide (`docs/NN-*.md`) and the matching
`SECTIONS` entry in `src/pages/Help.jsx` must be updated in the same change, with any
affected `public/guide/*.png` screenshots re-captured.
