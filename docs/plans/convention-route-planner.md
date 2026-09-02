# Plan: convention route planner / top picks

*Status: planned, not started. Written 2 Sep 2026 for the Big London Tattoo Show
(4–6 Sep 2026), on top of the artist index shipped in `3a836d3`.*

## What we're building

For a convention you have a line-up for, answer two questions:

1. **Who must I see?** — a ranked "Top picks" list drawn from your gallery, your
   ranking, and the studios you already follow.
2. **In what order do I walk it?** — the same picks sorted into a booth-order
   route, with nearby suggestions picked up along the way.

Top picks is the deliverable. The route is a presentation of it, and should be
built second so the feature is useful even if the route work stalls.

## Three findings that constrain the design — read these first

**1. 460 of the 466 line-up artists have no style data at all.**
`parseLineup` produces `{ name, handle, note }` and nothing else; style tags are
left empty *deliberately* (`lineupArtistDraft` in `src/data/lineup.js` — the
show's list says nothing about style, and a guessed tag would pollute the
matching Brief and Concepts run on). So "match my preferred styles" can only run
against artists we already hold tags for — the 6 in the gallery — unless new
data is fetched. **Do not** start writing inferred tags into line-up entries.

**2. There IS a floor plan, and it kills the booth-order shortcut.**
(Revised 2 Sep after the show's domain was allowlisted.) The plan is published
as a PDF on the main domain —
`/_files/ugd/32010e_0392b5c8a9164fd39cd893130240f4da.pdf`, one page, a single
6400×4233 image. Do **not** bother with the `static.wixstatic.com` copy: it is
only 1940×1284 and that host is blocked anyway.

The numbering **serpentines**: on the right-hand island `209→220` runs along the
top face and `208→197` back along the bottom. Sorting by booth number walks one
face and then teleports across the aisle. Booth number order is *not* walking
order, so the route must use real coordinates.

Extracting them works — see `docs/plans/floorplan-extraction.md` for the method:
colour-mask the booth rectangles, then OCR each cell. **Threshold dark pixels
directly (`gray < 110`); Otsu binarisation silently eats digits** (`276` reads
as `28`). Result: **391 booths placed, 95.4% of the placeable ones.**

**The plan does not cover the whole show.** 54 booths on the artist list have no
position on it: the entire `521`–`556` block, all of `T1`–`T43`, and `P2`–`P4`.
The highest booth drawn is 520. So ~12% of artists cannot be placed at all, and
the feature must degrade gracefully for them — list them in a trailing
"elsewhere in the hall" group rather than dropping them or guessing a position.

**3. The Taste Engine cannot help here.** `predictedRank`/`buildTasteVector`
(`src/data/taste.js`) need a CLIP vector per artist, which needs images.
Line-up entries have no images and no image URLs to fetch. Don't wire it up.

## The signal that does work: studio affinity

Twelve of the thirty saved artists are at **No Regrets** (six branches) and one
at **London Glitch** — both of which exhibit:

| Studio in the line-up | Entries | Already yours | New to you |
| --- | --- | --- | --- |
| No Regrets (all spellings) | 7 | Andro (315), Silas (255) | 5 — booths 61, 321, 344, 380, 401 |
| London's Glitch | 6 | Berk Bosveren (362) | 5 — booths 179, 181, 202, 356, 368 |
| Fatfugu Collective | 1 | — | 1 — booth 7 |

That is ~11 explainable suggestions from data already on disk, no network. Note
London's Glitch has 356/362/368 — adjacent stands, so the studio doubles as a
route cluster.

Your gallery's style weighting, for reference (count, and rank-weighted):
`dark-illustrative` 21/33.3 · `realism` 15/21.2 · `fine-line` 11/18.8 ·
`surrealism` 8/15.7 · `dark-fantasy` 6/10.3 · `blackwork` 6/7.3.

---

## Phase 1 — Top picks (deterministic, no network)

### New file: `src/data/showPlan.js`

```js
// Booth out of the note string ("No Regrets, Booth 315"), not a new field on the
// entry — keeps parseLineup's contract and works for user-imported line-ups too.
export function parseBooth(note)        // → { raw:'T39', zone:'T', number:39 } | null
export function preferredStyles(artists)// → [{ tag, weight }] rank-weighted, desc
export function scoreShowEntry(entry, ctx)  // ctx: { artists, attendingIds, studioIndex, styles }
export function buildShowPlan(entries, ctx) // → { mustSee, suggested, skipped }
```

`scoreShowEntry` returns the same shape as `scoreArtistForIdea`
(`src/data/planning.js`) — score plus the reasons that produced it — so
`buildShowPlanRationale` can mirror `buildMatchRationale`:

```js
{ entry, score, kind, reasons: ['#9 in your ranking', 'London’s Glitch — you follow 1 artist there'], savedArtistId }
```

Weights (mirroring the house scale in `scoreArtistForIdea`: 10 per tag, status
boosts 3/2/1/−4, rank boost `(31 − rank)/10`):

| Signal | Score | Notes |
| --- | --- | --- |
| In your gallery | +100 | plus rank boost `(31−rank)/10` and the status boost |
| Status `pass` | **exclude** | never route to someone you rejected — put in `skipped` |
| Studio you follow | +20, +2 per saved artist at that studio (cap +30) | the No Regrets / Glitch signal |
| Already flagged attending | +5 | |
| Style tag overlap | +10 per tag | only fires for artists with tags — see finding 1 |

Reuse `normalizeArtistStatus` from `planning.js`. Note `DEFAULT_ARTISTS` carry
**no `status` field** — statuses appear only once the user sets one, so
`scoreShowEntry` must not assume it exists.

Studio matching needs to be fuzzy: the gallery stores studio *ids*
(`no-regrets-london`) while the line-up carries free text (`No Regrets Studios`,
`No Regrets Tattoo`, `London’s Glitch`). Normalise both — lowercase, strip
punctuation and the trailing `studios|studio|tattoo|collective`, then match on
the leading token run. `DEFAULT_STUDIOS` in `src/data/artists.js` maps ids to
display names; build the index from there plus each saved artist's `studio`.

### Tests first: `src/test/showPlan.test.js`

- `parseBooth`: plain `454`; prefixed `T39`; range `153 - 158` → 153; `AE` → null; missing → null
- `preferredStyles`: rank-weighted order matches the table above
- a saved artist outranks a stablemate outranks an unknown
- a `pass` artist lands in `skipped`, never in `mustSee`
- studio affinity fires on `No Regrets Studios` vs stored id `no-regrets-london`
- an entry with no booth still scores, and is simply unplaced in the route
- **integration**: `buildShowPlan(seedEntriesFor('big-london'), { artists: DEFAULT_ARTISTS })`
  puts all 6 saved artists in `mustSee` and the No Regrets / Glitch stablemates
  in `suggested` — this is the test that proves the feature actually works

### UI

Add a fourth chip to `VIEWS` in `src/components/ConventionLineup.jsx`
(`{ id: 'picks', label: 'Top picks' }`). When active, render sections rather
than the A–Z grouping: **Must see** → **Worth a look** → each row carrying its
one-line rationale.

`ConventionLineup.jsx` is already 372 lines; put the picks rendering in a new
`src/components/ShowPlanView.jsx` and have the parent switch on the view.

---

## Phase 2 — Route (now geometry-based)

Ship the booth map as data: `src/data/lineups/bigLondon2026Floorplan.js`,
`{ booth: { x, y } }` with x/y normalised 0–1 against the plan image, so it is
resolution-independent. 391 entries; anything absent is simply unplaced.

- Order the route by **nearest-neighbour walk** over the real coordinates,
  starting from the entrance (bottom-right of the plan, near booths 1–12), not
  by booth number.
- **Neighbour pickups** become genuinely spatial: for each must-see, surface
  unpicked entries within a small radius in x/y — "two stands along from Berk
  Bosveren", which the plan confirms (356/362/368 are the same London's Glitch
  block).
- Artists whose booth is not on the plan (the 54 above) go in a trailing
  **"Elsewhere in the hall"** group, explicitly labelled — never silently
  dropped, never given a made-up position.
- Header copy stays honest: *"Ordered across the floor from the entrance — based
  on the show's published plan."* A nearest-neighbour walk is a good route, not a
  provably optimal one; don't claim "shortest".
- Stretch, only if it earns its place: render the picks as dots on a simplified
  SVG of the hall. The coordinates support it. Do not ship the show's floorplan
  image itself — it is their copyrighted artwork.
- A "Copy route" button, reusing the clipboard pattern already in
  `GrabberPanel` (`ConventionLineup.jsx`), so it can go in Notes for the day.

## Phase 3 — Optional style enrichment (network, may be skipped entirely)

Only if phases 1–2 land well. The gap in finding 1 closes by asking Gemini to
tag unknown artists, following the existing user-key pattern exactly:
`buildDiscoveryPrompt`/`parseDiscoveryResponse` in `src/data/discovery.js`, with
`GEMINI_TEXT_MODEL` and the same strict allowlist parsing (tags only from
`STYLE_TAGS`, handles validated, one line per artist, batched ~40 at a time).

Cache results device-local under a new `tattoo_lineup_styles` key — **not** a
sync collection, same reasoning as `tattoo_convention_lineups`. Keep enriched
tags in that side map, never written back into the line-up entries themselves.

Gate it behind an explicit button ("Suggest styles for the rest — uses your
Gemini key"), and mark enriched rows visibly as guesses.

---

## Traps

- Tailwind v4 spellings: `rounded-xs`, `outline-hidden`, and hover-revealed
  controls need `can-hover:opacity-0`, not bare `opacity-0` (see CLAUDE.md).
- Touch targets `min-h-11`; no `cream-muted/30|40` (`v2-tokens.spec.js` bans them).
- `outline-hidden` must be paired with a `focus:border-*` (`a11yAffordances.spec.js`).
- Update the README's "The suite is N Vitest tests across M files" claim —
  `readmeClaims.test.js` asserts the file count exactly.
- Docs sync: `docs/05-conventions-and-studios.md` and the `conventions-studios`
  section of `src/pages/Help.jsx`.
- Run the suite from inside a worktree if one exists, or vitest double-counts.
  `src/test/shareTarget.test.js` fails on a clean checkout already — not yours.

## Verification

`npx vitest run`, `npm run lint`, `npm run build`, then a real browser check:
seed `tattoo_artists_meta` with `DEFAULT_ARTISTS`, open `/conventions`, and
confirm Top picks lists the six saved artists above the stablemates, with booth
order matching the table in this document.
