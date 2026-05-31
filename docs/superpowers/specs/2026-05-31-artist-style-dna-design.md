# Artist Style DNA Design

## Goal

Enrich each saved artist with AI-derived style data, generated at build-time by Claude Code
(no runtime API, no cost), and use it to (a) sharpen the style tags that drive matching and
(b) give every artist a short editorial "style signature" in the UI.

This is the deferred "Artist style DNA analysis" item from the AI Concepts prompt-pack spec.
It is idea #1 of the AI roadmap; it deliberately sets up later ideas (concept-generation
steering, match rationales) without building their runtime infrastructure now.

## Scope

In scope:

- Add two fields to every artist in `DEFAULT_ARTISTS` (`src/data/artists.js`):
  - `styleNote` — shown in the UI; one editorial sentence (~12–25 words).
  - `styleDescriptor` — hidden; comma-separated style phrases for later machine use.
- Propose style-tag changes per artist for human approval; apply only approved edits.
- Display `styleNote` on the artist detail view.
- Roll out as a pilot (3–4 artists) then the remaining 26.

Out of scope (YAGNI):

- Any runtime/Gemini/OpenAI API calls or key handling (that is idea #4).
- Consuming `styleDescriptor` in matching or generation yet (ideas #2/#4).
- In-app editing of `styleNote`/`styleDescriptor` (curated data; display-only for now).
- Changes to ranks, studios, images, or the gallery cards.
- Auto-overwriting tags without approval.

## Data model

Two additive, optional string fields per artist object in `DEFAULT_ARTISTS`:

- **`styleNote`** (shown): editorial voice matching the app (dark, refined). One sentence,
  ~12–25 words. e.g. `"Surreal dark-illustrative work — fine botanical linework dissolving
  into heavy negative space."`
- **`styleDescriptor`** (hidden): compact, comma-separated style phrases for steering the
  concept generator and match rationales later. e.g. `"heavy blackwork, fine-line botanical
  detail, surreal composition, high contrast, ornamental framing"`.

`tags` (existing array) is edited only where the user approves a diff; values stay within
the six `STYLE_TAGS`.

Both new fields are additive, so existing `src/test/artists.test.js` invariants
(30 artists, unique sequential ranks, required fields, valid studios) remain green.

## Analysis process (build-time, Claude Code)

Primary input: the **`tags-batch*.jpeg` montages** already captured from the audit-page grid
viewer (gitignored, local-only). The 12 montages show every artist's portfolio in labelled
rows (e.g. `ANDRO · 15 IMAGES`) across all 30 artists — the full range of each artist's work
in a handful of reads. Fall back to individual `public/images/artists/<id>/*.jpg` only where
a montage row is ambiguous or too small to read.

For each artist, produce a proposal in this fixed shape (the same shape that can later become
the Gemini prompt for a Manage "suggest style" button — the path to approach C):

```
{
  id: "<artist id>",
  tags: ["<subset of STYLE_TAGS>"],        // proposed final set
  tagChanges: [{ tag, action: "add"|"remove", reason }],
  styleNote: "<one editorial sentence>",
  styleDescriptor: "<comma-separated phrases>"
}
```

Voice guide for `styleNote`: editorial and specific, no marketing fluff, lowercase style-tag
vocabulary woven in naturally, present tense, no artist name. `styleDescriptor`: concrete
visual attributes (technique, motif, composition, contrast), not opinions.

## Review & apply flow

- **Round 1 — pilot (3–4 artists, e.g. zoia.ink, carlosvalera, yuki_zerkjad):** present each
  proposal in chat — `current tags → proposed (+/- with one-line reasons)`, `styleNote`,
  `styleDescriptor`. User approves/edits; Claude tunes voice, length, and tag-strictness from
  the feedback, then writes the approved pilot entries into `artists.js`.
- **Round 2 — remaining 26:** analyse all, present a compact scannable review (a tag-diff +
  styleNote table; descriptors listed below it). User approves, with edits where wanted.
  Apply approved entries. Tags change only where approved.

Applying = editing the affected artist objects in `DEFAULT_ARTISTS`. No other data touched.

## UI change

Display `styleNote` on the artist detail view (`src/components/ArtistDetail.jsx`), inside the
identity block (after the studio/status lines at ~line 134–138, before the Photos section),
as a quiet editorial line (e.g. `text-cream-muted`, italic or small serif). View-mode only;
not shown in edit mode, not on the small gallery cards. `styleDescriptor` is never displayed.
Render nothing if `styleNote` is absent (graceful during pilot rollout).

## Testing (TDD)

- Keep `src/test/artists.test.js` green throughout (additive fields don't break it).
- UI: before the `ArtistDetail` change, add a render test (`@testing-library/react`) — an
  artist with a `styleNote` shows it; an artist without one renders no style line.
- After Round 2 (full rollout) add data invariants to `artists.test.js`:
  - every artist has a non-empty string `styleNote` and `styleDescriptor`;
  - every tag across all artists is within `STYLE_TAGS`.
  (Added at the end so the pilot phase, where most artists lack the fields, stays green.)

## Build sequence

1. Add the `ArtistDetail` `styleNote` display + its render test (works with zero data).
2. Round 1 pilot: analyse 3–4 from the montages, review, apply approved entries.
3. Round 2: analyse the remaining 26, review, apply approved entries.
4. Add the full-rollout data-integrity invariants; run `npm test` and `npm run build`.
