# Ranking front-and-centre on the Wall — Design

**Date:** 2026-07-11
**Status:** Approved (design); revised after two-model review; pending implementation plan

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

### 1. `RankRail` — Top 5 dock (on the Wall)

- A **slim, compact dock** (a single low row) pinned directly under the top `Bar`,
  **above** the `ConsiderShelf`. It is deliberately *not* a hero band: it must not push
  the image masonry below the fold on mobile, so keep it to one short row. (Review
  point: both reviewers flagged that a tall Top-5 hero undercuts the Wall's image-first
  premise.)
- **Render condition:** gate on **`artists.length > 0`**, NOT `items.length > 0`.
  `items` are image-derived (`buildWallItems`), so an artist with a rank but no images
  produces no wall item; gating on `items` would wrongly hide the dock. Cover tiles
  degrade to a monogram / rank glyph when an artist has no image (mirror `Top5Hero`'s
  `CoverTile`). The zero-artist case is handled by the Wall's own "bare wall" prompt;
  `RankBoard` owns the in-board empty state.
- Five cover tiles in rank order (`rank <= 5`), each showing the artist's cover image
  (`images[0]`).
- Each tile carries **▲ / ▼** controls with large touch targets, using **true global
  move semantics** (`moveUp` / `moveDown`). ▲ on rank-2 makes it rank-1. **▼ on rank-5
  moves that artist to rank 6** (swapping with the artist below) when more artists
  exist — it is a no-op only for the genuinely last-ranked artist overall; ▲ on rank-1
  is likewise a no-op. (Review point: a "▼ on rank-5 does nothing" rule is a trap users
  hit immediately.)
- A **"Rank ⤢"** affordance on the right opens `RankBoard`.
- Restrained, editorial styling — reads as chrome, not a table.

### 2. `RankBoard` — consolidated full-screen board (overlay)

Opened from `RankRail`'s "Rank ⤢" button and from the `⋯` drawer's ranking entry.
Full-screen overlay in v2 style. Locks body scroll while open.

- **Scroll-lock coordination:** the `WallViewer` also locks `document.body.style.overflow`.
  Only one overlay is ever open at a time, but both must save/restore the *previous*
  value (not hard-code `''`) so they don't fight each other. `RankBoard` follows the
  same save-and-restore pattern the Wall already uses for `viewerOpen`.
- **Top 5 section** (pinned at top): larger rows for `rank <= 5` — rank number, cover,
  name, and a one-tap **"Drop ↓"** that benches the artist (`moveOutOfTop5`).
- **Everyone else** (scrollable): ranked list of `rank > 5` — each row has **▲ / ▼**
  (move one slot), rank number, cover thumb, name, and a **"↑ To top 5"** action
  (`moveIntoTop5`).
- Close/Done returns to the Wall.

**Deferred (not in this spec — cut for scope, per review):**
- **Drag-to-reorder** — removed entirely. ▲/▼ is the whole interaction; drag added
  ambiguity and no MVP value.
- **Exact-rank typing** (tap a rank number to type a target) — deferred. ▲/▼ plus
  "↑ To top 5" is the "dead-simple" core. If jumping a far-down artist up proves
  painful later, revisit via a `moveToRank` helper (see below) — the engine already
  supports it, so it's a small follow-up.

### 3. `ranking.js` — shared engine (extended)

Introduce two **primitives** beside the existing `moveIntoTop5` / `moveOutOfTop5`
(both of which already delegate to the private `rerankWithMove`):

- `moveToRank(artists, id, rank)` — move an artist to an explicit 1-based rank
  (clamped 1..N), then re-rank 1..N. `moveIntoTop5` / `moveOutOfTop5` can be expressed
  in terms of this.
- `moveByDelta(artists, id, delta)` — move an artist by a relative offset (`+1` down,
  `-1` up), clamped at the ends.

Then the ergonomic wrappers the UI calls:

- `moveUp(artists, id)` → `moveByDelta(artists, id, -1)` — no-op if already rank 1.
- `moveDown(artists, id)` → `moveByDelta(artists, id, +1)` — no-op if already last.
- `moveToTop(artists, id)` → `moveToRank(artists, id, 1)`.

**Rank normalization:** the helpers sort by `rank` to find positions, so they must be
robust to imperfect input. Before moving, normalize: sort by `rank` (undefined/NaN
ranks sort last, stable by current order), then treat position — not the stored
integer — as truth, and re-emit a contiguous 1..N `rank` on every operation. This
means duplicate, missing, or non-integer ranks self-heal on the next move. An unknown
id returns the input unchanged.

All preserve the single global **1..N contiguous `rank`** invariant. No new data shape.

## Data flow

`Wall` already receives `artists` and `setArtists` (App.jsx). `RankRail` and
`RankBoard` re-rank via the `ranking.js` helpers and hand the result to `setArtists`,
identical to how `Gallery` applies drag-reorder. Persistence, storage, and sync are
unchanged (the existing `useArtistStorage` path).

**Functional updates required.** Every rank mutation MUST use the functional form —
`setArtists(prev => moveUp(prev, id))`, never `setArtists(moveUp(artists, id))`. Rapid
▲/▼ taps otherwise close over a stale `artists` and drop moves. (Review point.)

**Write volume is a non-issue at this scale.** This is a personal app (~30 artists) on
localStorage; per-tap persistence is fine. No debounce/throttle — that would be
complexity for a problem that doesn't exist here.

## What gets consolidated (not deleted)

- The `⋯` drawer's existing "ranking" pointer now targets `RankBoard`.
- `/pipeline` Dashboard `Top5Hero` and Gallery's swipe / grid / filmstrip stay as-is —
  they remain valid browsing / bulk tools and feed the same global `rank`. We are
  **adding the canonical home**, not removing working code. Low-risk and reversible.

## Error handling / edge cases

- Fewer than 5 artists: `RankRail` shows only the available tiles.
- ▼ on the visible rank-5 tile: moves to rank 6 when more artists exist; no-op only for
  the genuinely last-ranked artist. ▲ on rank-1 is a no-op.
- No images: cover tiles degrade to monogram / rank glyph.
- Move helpers on an unknown id return the input unchanged.
- Imperfect stored ranks (missing / duplicate / non-integer): self-heal to contiguous
  1..N on the next move (see normalization above).
- Rank invariant stays contiguous 1..N after every operation.
- Artist add/delete: rank assignment on add and gap-closing on delete are owned by the
  existing add/remove paths, not by these helpers. If a delete leaves a gap, the next
  move normalizes it; this spec does not change CRUD behaviour.

## Testing (TDD)

Write tests first.

**`ranking.js` (pure):**
- `moveByDelta` / `moveToRank` clamp at the ends and re-rank 1..N.
- `moveUp` at rank 1 is a no-op; otherwise swaps with the artist above.
- `moveDown` at last rank is a no-op; otherwise moves down one.
- `moveToTop` makes the artist rank 1 and shifts the rest down.
- Unknown id returns input unchanged.
- **Normalization:** input with duplicate / missing / non-integer ranks yields a
  contiguous 1..N result after any move.
- Result is always contiguous 1..N.

**`RankRail` (RTL):**
- Renders the 5 lowest-rank artists as tiles in order.
- ▲ on the rank-2 tile calls `setArtists` (functional form) with that artist at rank 1.
- ▲ is a no-op on rank-1.
- ▼ on the visible rank-5 tile moves it to rank 6 when a rank-6 artist exists; no-op
  only when it is the last-ranked artist overall.
- Renders when `artists.length > 0` even if no artist has images (tiles show glyphs).
- "Rank ⤢" opens the board.

**`RankBoard` (RTL):**
- Top 5 section lists `rank <= 5`; "everyone else" lists `rank > 5`.
- "Drop ↓" moves a top-5 artist out (`moveOutOfTop5`).
- "↑ To top 5" moves a benched artist in (`moveIntoTop5`).
- ▲ / ▼ on a list row moves it one slot (functional `setArtists`).
- Zero-artist empty state renders a prompt (e.g. "Add artists to start ranking").

## Scope guard (YAGNI)

- No new persisted fields; "top 5" is simply `rank <= 5`.
- No tiers, no separate top-5 list.
- No animations beyond what v2 already uses.
- **No drag-to-reorder** (cut). ▲/▼ is the entire interaction.
- **No exact-rank typing** (deferred). `moveToRank` exists in the engine for a cheap
  follow-up if needed.
- Existing ranking surfaces (swipe / grid / filmstrip, `/pipeline` Top 5) are kept, not
  rebuilt — the known fragmentation tradeoff, accepted for low risk.

## Review incorporated (2026-07-11)

This spec was reviewed by two other models (`agy`, `codex`). Accepted changes, folded
in above:

- Rail reframed as a **slim dock**, not a hero — must not push the wall below the fold
  (both reviewers).
- ▼ on rank-5 uses **true move semantics** (drop to rank 6), removing a hidden no-op
  rule (both reviewers).
- Render gate fixed to **`artists.length > 0`** (image-derived `items` would wrongly
  hide the dock) (codex).
- **Functional `setArtists` updates** to avoid stale-closure dropped taps (codex).
- **Scroll-lock coordination** between `WallViewer` and `RankBoard` (codex).
- Engine primitives **`moveByDelta` / `moveToRank`** with wrappers, plus **rank
  normalization** for imperfect input (codex).
- **Drag cut**, **exact-rank deferred** (both reviewers / YAGNI).

Rejected, with reasons:

- *Replace the `rank` integer with array-index ordering* (agy) — invasive; the whole
  app (Gallery, Dashboard, Filmstrip, sync) is built on `rank`. No user-visible gain.
- *Debounce localStorage writes* (agy) — non-issue at ~30 artists.
- *Full deprecation of legacy ranking surfaces* (both) — deferred by user decision;
  kept for low risk and reversibility.

## Docs

Per `.claude/rules/docs-sync.md`, this changes UI under `src/pages/` and
`src/components/`, so the ranking guide (`docs/NN-*.md`) and the matching
`SECTIONS` entry in `src/pages/Help.jsx` must be updated in the same change, with any
affected `public/guide/*.png` screenshots re-captured.
