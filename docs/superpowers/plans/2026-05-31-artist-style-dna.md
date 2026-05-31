# Artist Style DNA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on interactivity:** Tasks 2 and 3 are human-in-the-loop (Claude Code reads images, proposes, the user approves before anything is written). They must run **inline with the user**, not in a detached subagent. Tasks 1 and 4 are standard and could run either way.

**Goal:** Enrich each of the 30 artists with an AI-derived `styleNote` (shown) and `styleDescriptor` (hidden), plus human-approved style-tag corrections, and surface `styleNote` on the artist detail view.

**Architecture:** Build-time enrichment — Claude Code reads the captured `tags-batch*.jpeg` portfolio montages, proposes per-artist tag diffs + notes, the user approves, and approved values are written directly into `DEFAULT_ARTISTS` in `src/data/artists.js`. One small read-only UI addition displays `styleNote`. No runtime API, no new dependencies.

**Tech Stack:** React 19, Vite, Tailwind, Vitest + @testing-library/react.

---

## File Structure

- `src/components/ArtistDetail.jsx` — **modify**: render `styleNote` in the identity block (view mode only).
- `src/test/ArtistDetail.test.jsx` — **create**: render tests for the `styleNote` display.
- `src/data/artists.js` — **modify**: add `styleNote` + `styleDescriptor` to each artist object in `DEFAULT_ARTISTS`; adjust `tags` where approved.
- `src/test/artists.test.js` — **modify** (Task 4): add data-integrity invariants for the new fields and tag validity.

Analysis inputs (read-only, gitignored, already on disk): `tags-batch1.jpeg` … `tags-batch12.jpeg` at the repo root; fall back to `public/images/artists/<id>/*.jpg`.

---

## Task 1: Display `styleNote` on the artist detail view

**Files:**
- Create: `src/test/ArtistDetail.test.jsx`
- Modify: `src/components/ArtistDetail.jsx` (identity block, ~lines 134–139)

- [ ] **Step 1: Write the failing test**

Create `src/test/ArtistDetail.test.jsx`:

```jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ArtistDetail from '../components/ArtistDetail'

const baseArtist = {
  id: 'zoia.ink',
  handle: 'zoia.ink',
  name: '',
  tags: ['dark-illustrative'],
  images: [],
  rank: 1,
  studio: null,
  status: 'researching',
  notes: '',
}
const noop = () => {}
const NOTE = 'Surreal dark-illustrative linework dissolving into negative space.'

describe('ArtistDetail styleNote', () => {
  it('shows the styleNote when present', () => {
    render(<ArtistDetail artist={{ ...baseArtist, styleNote: NOTE }} onClose={noop} onSave={noop} />)
    expect(screen.getByText(NOTE)).toBeTruthy()
  })

  it('renders no style line when styleNote is absent', () => {
    render(<ArtistDetail artist={baseArtist} onClose={noop} onSave={noop} />)
    expect(screen.queryByText(NOTE)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/ArtistDetail.test.jsx`
Expected: the first test FAILS (`Unable to find an element with the text`), because nothing renders the note yet.

- [ ] **Step 3: Write minimal implementation**

In `src/components/ArtistDetail.jsx`, inside the identity `<div className="mb-6">`, add the note immediately after the status paragraph block. Change:

```jsx
            {!editing && (
              <p className={`font-mono text-xs tracking-widest uppercase mt-3 ${currentStatus.tone}`}>
                {currentStatus.label}
              </p>
            )}
          </div>
```

to:

```jsx
            {!editing && (
              <p className={`font-mono text-xs tracking-widest uppercase mt-3 ${currentStatus.tone}`}>
                {currentStatus.label}
              </p>
            )}
            {!editing && artist.styleNote && (
              <p className="font-body text-sm text-cream-muted/80 italic leading-relaxed mt-3">
                {artist.styleNote}
              </p>
            )}
          </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/ArtistDetail.test.jsx`
Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ArtistDetail.jsx src/test/ArtistDetail.test.jsx
git commit -m "feat(artists): show styleNote on artist detail"
```

---

## Task 2: Pilot — analyse and apply 3–4 artists (interactive)

Calibrates voice, length, and tag-strictness before the bulk run. Run inline with the user.

**Files:**
- Read: `tags-batch1.jpeg` (and others as needed) — contains `adamblakeytattoos`, `andro`, `berkbosveren`, plus the artist index.
- Modify: `src/data/artists.js`

- [ ] **Step 1: Read the montage(s)**

Read `tags-batch1.jpeg`. Identify the pilot artists (`zoia.ink`, `carlosvalera`, `yuki_zerkjad`, + one more); read whichever additional `tags-batch*.jpeg` montages contain them. If a row is too small to judge, read 3–4 files from `public/images/artists/<id>/`.

- [ ] **Step 2: Produce a proposal per pilot artist**

For each, following the spec's voice guide, produce: `current tags → proposed (+/− with one-line reason each)`, a one-sentence `styleNote` (~12–25 words, editorial, no name), and a comma-separated `styleDescriptor`.

- [ ] **Step 3: Present to the user and get approval**

Show all pilot proposals in chat. Apply the user's edits to wording/tags. **Do not edit `artists.js` until the user approves.**

- [ ] **Step 4: Apply approved values to `src/data/artists.js`**

For each approved artist, edit its object literal in `DEFAULT_ARTISTS`: set `tags` to the approved set and append the two fields. Example (illustrative shape — use approved content):

```js
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ["dark-illustrative","surrealism","fine-line"],
    styleNote: 'Surreal dark-illustrative work — fine botanical linework dissolving into heavy negative space.',
    styleDescriptor: 'heavy blackwork, fine-line botanical detail, surreal composition, high contrast, ornamental framing',
    images: [/* unchanged */], rank: 1, studio: 'no-regrets-worcester' },
```

Leave `images`, `rank`, `studio`, `name`, `handle`, `id` untouched.

- [ ] **Step 5: Run the suite to confirm nothing broke**

Run: `npm test -- --run`
Expected: all existing tests PASS (additive fields + in-vocabulary tag edits don't break `artists.test.js`).

- [ ] **Step 6: Commit**

```bash
git add src/data/artists.js
git commit -m "feat(artists): style DNA + tag review for pilot artists"
```

---

## Task 3: Batch — analyse and apply the remaining 26 (interactive)

**Files:**
- Read: remaining `tags-batch*.jpeg` montages.
- Modify: `src/data/artists.js`

- [ ] **Step 1: Read all remaining montages**

Read the `tags-batch*.jpeg` files covering the other 26 artists (use the artist index strip in the montages to confirm coverage of all 30).

- [ ] **Step 2: Produce proposals for all 26**

Same per-artist output as Task 2, in the format/voice locked by the pilot.

- [ ] **Step 3: Present a compact review and get approval**

Present a scannable review: a table of `id · current tags → proposed (reasons) · styleNote`, with `styleDescriptor`s listed below. Apply the user's edits. **Do not edit `artists.js` until approved.**

- [ ] **Step 4: Apply approved values to `src/data/artists.js`**

Edit each remaining artist object as in Task 2, Step 4 (set approved `tags`, append `styleNote` + `styleDescriptor`; leave other fields untouched). After this step every artist in `DEFAULT_ARTISTS` has both fields.

- [ ] **Step 5: Run the suite**

Run: `npm test -- --run`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/artists.js
git commit -m "feat(artists): style DNA + tag review for remaining artists"
```

---

## Task 4: Lock in invariants and verify end-to-end

Now that every artist has the fields, add the data-integrity guards so future edits can't silently drop them or introduce an unknown tag.

**Files:**
- Modify: `src/test/artists.test.js`

- [ ] **Step 1: Write the failing-then-passing invariants**

In `src/test/artists.test.js`, change the import line:

```js
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS } from '../data/artists'
```

to:

```js
import { DEFAULT_ARTISTS, DEFAULT_STUDIOS, STYLE_TAGS } from '../data/artists'
```

Then add these tests inside the `describe('DEFAULT_ARTISTS data integrity', ...)` block:

```js
  it('every artist has a non-empty styleNote and styleDescriptor', () => {
    for (const a of DEFAULT_ARTISTS) {
      expect(typeof a.styleNote).toBe('string')
      expect(a.styleNote.trim().length).toBeGreaterThan(0)
      expect(typeof a.styleDescriptor).toBe('string')
      expect(a.styleDescriptor.trim().length).toBeGreaterThan(0)
    }
  })

  it('every artist tag is a known STYLE_TAG', () => {
    const valid = new Set(STYLE_TAGS)
    for (const a of DEFAULT_ARTISTS) {
      for (const tag of a.tags) expect(valid.has(tag)).toBe(true)
    }
  })
```

- [ ] **Step 2: Run the suite**

Run: `npm test -- --run`
Expected: all tests PASS (data is complete after Task 3). If the styleNote/styleDescriptor test fails, an artist was missed in Task 3 — fix the data, not the test.

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/test/artists.test.js
git commit -m "test(artists): assert styleNote, styleDescriptor, and tag validity"
```

---

## Self-Review

**Spec coverage:**
- Data model (`styleNote` shown, `styleDescriptor` hidden, tag edits) → Tasks 2–4. ✓
- Build-time analysis from `tags-batch*.jpeg` montages → Tasks 2–3, Step 1. ✓
- Propose-for-approval, apply-only-approved → Tasks 2–3, Steps 2–4. ✓
- Pilot then batch → Task 2, Task 3. ✓
- `styleNote` on artist detail, view-mode only, graceful when absent → Task 1. ✓
- Keep `artists.test.js` green; final invariants added last → Tasks 2–3 (green throughout), Task 4 (invariants). ✓
- Non-goals (no runtime API, descriptor unused, no card/rank/studio/image changes) → respected; no task touches them. ✓

**Placeholders:** Task 2 Step 4 shows an *illustrative* artist literal; the actual tags/notes are generated and user-approved at runtime (a runtime-determined value with a concrete edit mechanism, not a TODO). All test code and commands are complete and literal.

**Type/name consistency:** Field names `styleNote` / `styleDescriptor` are identical across the UI (Task 1), the data edits (Tasks 2–3), and the invariants (Task 4). `STYLE_TAGS` import added in Task 4 matches its export in `artists.js`.
