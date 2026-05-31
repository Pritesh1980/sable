# Artist Match Rationales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local, templated "why this artist fits this idea" sentence to artist↔idea matches, shown in the Brief idea editor and the dashboard.

**Architecture:** One pure helper `buildMatchRationale(idea, match)` in `src/data/planning.js` composes the sentence from `match.overlapTags` + `match.artist.styleDescriptor` + `idea.placement`. Both surfaces import and render it. No AI, no storage, no scoring change.

**Tech Stack:** React 19, Vite, Tailwind, Vitest + @testing-library/react.

---

## File Structure

- `src/data/planning.js` — **modify**: add `joinAnd` + `buildMatchRationale`.
- `src/test/planning.test.js` — **modify**: unit tests for `buildMatchRationale`.
- `src/pages/Brief.jsx` — **modify**: render rationale in the ranked match list.
- `src/pages/Dashboard.jsx` — **modify**: render rationale in the Idea-matches panel.

---

## Task 1: `buildMatchRationale` helper (TDD)

**Files:**
- Modify: `src/test/planning.test.js`
- Modify: `src/data/planning.js`

- [ ] **Step 1: Write the failing tests**

Append to `src/test/planning.test.js` (add `buildMatchRationale` to the existing import from `../data/planning`):

```js
describe('buildMatchRationale', () => {
  const artist = { id: 'zoia.ink', styleDescriptor: 'black-and-grey, fine-line geometry, dotwork shading' }

  it('composes shared tags + first two descriptor phrases + placement', () => {
    const idea = { tags: ['dark-illustrative', 'fine-line'], placement: 'sleeve' }
    const match = { artist, overlapTags: ['dark-illustrative', 'fine-line'] }
    expect(buildMatchRationale(idea, match)).toBe(
      'Shares dark-illustrative + fine-line — their black-and-grey and fine-line geometry suit this sleeve.'
    )
  })

  it('falls back to "this idea" when there is no placement', () => {
    const idea = { tags: ['fine-line'] }
    const match = { artist, overlapTags: ['fine-line'] }
    expect(buildMatchRationale(idea, match)).toBe(
      'Shares fine-line — their black-and-grey and fine-line geometry suit this idea.'
    )
  })

  it('drops the descriptor clause when the artist has no styleDescriptor', () => {
    const idea = { placement: 'forearm' }
    const match = { artist: { id: 'x' }, overlapTags: ['blackwork'] }
    expect(buildMatchRationale(idea, match)).toBe('Shares blackwork with this forearm.')
  })

  it('returns empty string for a null match or no signal', () => {
    expect(buildMatchRationale({}, null)).toBe('')
    expect(buildMatchRationale({}, { artist: { id: 'x' }, overlapTags: [] })).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/test/planning.test.js`
Expected: the new `buildMatchRationale` tests FAIL (`buildMatchRationale is not a function`).

- [ ] **Step 3: Implement the helper**

Append to `src/data/planning.js`:

```js
function joinAnd(items) {
  if (items.length <= 1) return items[0] || ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function buildMatchRationale(idea, match) {
  if (!match) return ''
  const shared = (match.overlapTags || []).join(' + ')
  const phrases = String(match.artist?.styleDescriptor || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2)
  const subject = idea?.placement ? `this ${idea.placement}` : 'this idea'
  const clause = joinAnd(phrases)

  if (shared && clause) return `Shares ${shared} — their ${clause} suit ${subject}.`
  if (shared) return `Shares ${shared} with ${subject}.`
  if (clause) return `Their ${clause} suit ${subject}.`
  return ''
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/test/planning.test.js`
Expected: PASS (all cases, including the two-phrase join producing "black-and-grey and fine-line geometry").

- [ ] **Step 5: Commit**

```bash
git add src/data/planning.js src/test/planning.test.js
git commit -m "feat(planning): add buildMatchRationale helper"
```

---

## Task 2: Show rationale in the Brief idea editor

**Files:**
- Modify: `src/pages/Brief.jsx`

- [ ] **Step 1: Import the helper**

In `src/pages/Brief.jsx`, add `buildMatchRationale` to the existing import from `../data/planning`:

```js
import {
  ARTIST_STATUSES,
  buildMatchRationale,
  getImageNote,
  getImageUrl,
  matchArtistsForIdea,
  normalizeArtistStatus,
  normalizeReferenceImages,
} from '../data/planning'
```

- [ ] **Step 2: Render the rationale line**

In the ranked matches list, the per-match block currently renders the rank/status line:

```jsx
                        <p className="font-mono text-[0.6875rem] text-cream-muted/70 mt-1">#{artist.rank} · {statusLabel(status)}</p>
```

Immediately after that `<p>`, add (within the same `<div className="flex-1 min-w-0">`):

```jsx
                        {(() => {
                          const rationale = buildMatchRationale(draft, { artist, overlapTags, status })
                          return rationale ? (
                            <p className="font-body text-[0.8125rem] text-cream-muted/80 leading-snug mt-1">{rationale}</p>
                          ) : null
                        })()}
```

(`draft`, `artist`, `overlapTags`, and `status` are all already in scope inside the `matches.slice(0, 8).map(...)` callback.)

- [ ] **Step 3: Verify in the app**

Run the dev server (`npm run dev`), open Brief, open an idea with style tags, and confirm a rationale line appears under each matched artist's rank/status. (Use the seed data from `docs/MAINTAINING.md` if no ideas exist.)

- [ ] **Step 4: Commit**

```bash
git add src/pages/Brief.jsx
git commit -m "feat(brief): show match rationale in the idea editor"
```

---

## Task 3: Show rationale in the dashboard Idea-matches panel

**Files:**
- Modify: `src/pages/Dashboard.jsx`

- [ ] **Step 1: Import the helper**

In `src/pages/Dashboard.jsx`, add `buildMatchRationale` to the existing import from `../data/planning`:

```js
import { ARTIST_STATUSES, buildDashboardSummary, buildMatchRationale, matchArtistsForIdea, normalizeArtistStatus } from '../data/planning'
```

- [ ] **Step 2: Render the rationale under each match name**

In the Idea-matches panel, the per-match row is currently:

```jsx
                    {matches.map(({ artist, overlapTags }) => (
                      <div key={artist.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-cream-muted truncate">{artistLabel(artist)}</span>
                        <span className="font-mono text-[0.6875rem] text-accent shrink-0">{overlapTags.length} tag match</span>
                      </div>
                    ))}
```

Replace it with a stacked layout that keeps the count row and adds a clamped rationale line:

```jsx
                    {matches.map(({ artist, overlapTags, status }) => {
                      const rationale = buildMatchRationale(idea, { artist, overlapTags, status })
                      return (
                        <div key={artist.id} className="text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-cream-muted truncate">{artistLabel(artist)}</span>
                            <span className="font-mono text-[0.6875rem] text-accent shrink-0">{overlapTags.length} tag match</span>
                          </div>
                          {rationale && (
                            <p className="text-cream-muted/70 text-xs leading-snug mt-0.5 line-clamp-2">{rationale}</p>
                          )}
                        </div>
                      )
                    })}
```

(The match objects from `matchArtistsForIdea` already include `status`; destructuring it here is safe.)

- [ ] **Step 3: Verify in the app**

With the dev server running, open the dashboard and confirm each idea-match shows a rationale line under the artist name, clamped to two lines.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Dashboard.jsx
git commit -m "feat(dashboard): show match rationale in idea matches"
```

---

## Task 4: Full verification

- [ ] **Step 1: Run the suite and build**

Run: `npm test -- --run`
Expected: all tests pass (including the new `buildMatchRationale` cases).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2: Commit only if there is anything uncommitted**

If `git status --short` is clean, nothing to do. Otherwise commit any stragglers.

---

## Self-Review

**Spec coverage:**
- Pure `buildMatchRationale(idea, match)` in `planning.js` → Task 1. ✓
- Brief idea editor surface → Task 2. ✓
- Dashboard Idea-matches surface → Task 3. ✓
- Unit tests (full / no-descriptor / no-placement / defensive) → Task 1, Step 1. ✓
- No AI, no caching, no scoring change, artist detail untouched → respected; no task touches them. ✓

**Placeholder scan:** All steps contain literal code and exact commands. No TBD/TODO.

**Type/name consistency:** `buildMatchRationale` and `joinAnd` are spelled identically in the implementation (Task 1), both imports (Tasks 2–3), and tests. The match shape `{ artist, overlapTags, status }` matches `matchArtistsForIdea`'s output (`scoreArtistForIdea` returns `{ artist, overlap, overlapTags, status, score }`). The Brief callback already destructures `artist, overlapTags, status`; the Dashboard map adds `status` to its existing `artist, overlapTags`.
