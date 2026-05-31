# Artist Match Rationales Design

## Goal

Turn the numeric tag-overlap of artist↔idea matching into a short, human "why this fits"
sentence, generated locally from data the app already has (overlapping tags + the artist's
`styleDescriptor`). No AI call, no cost — it makes the `styleDescriptor` added in the Artist
Style DNA feature earn its keep.

This is idea #2 of the AI roadmap. It narrates the existing matcher; it does not change scoring.

## Scope

In scope:

- A pure helper `buildMatchRationale(idea, match)` in `src/data/planning.js`.
- Show the rationale in the Brief idea editor's ranked match list (`src/pages/Brief.jsx`).
- Show the rationale in the dashboard "Idea matches" panel (`src/pages/Dashboard.jsx`).
- Unit tests in `src/test/planning.test.js`.

Out of scope (YAGNI):

- Any AI/Gemini/runtime call (local templating only; an AI-written variant can come later).
- Caching or storing rationales (cheap to compute on render; ideas are dynamic).
- Changing the scoring in `matchArtistsForIdea` — this only narrates its output.
- Artist detail view (rationale is per idea-artist pair, not per artist).

## The function

`buildMatchRationale(idea, match) → string`, beside `matchArtistsForIdea` in `planning.js`.

Inputs used: `match.overlapTags` (array of shared style tags), `match.artist.styleDescriptor`
(comma-separated phrase string), `idea.placement` (optional).

Logic:

- `shared = (match.overlapTags || []).join(' + ')`
- `phrases =` first two comma-separated, trimmed, non-empty parts of `styleDescriptor`
- `subject = idea?.placement ? 'this ' + idea.placement : 'this idea'`
- `clause = joinAnd(phrases)` where `joinAnd(['a'])='a'`, `joinAnd(['a','b'])='a and b'`
- Compose:
  - shared **and** phrases → `Shares ${shared} — their ${clause} suit ${subject}.`
  - shared, no phrases → `Shares ${shared} with ${subject}.`
  - no shared (defensive), phrases → `Their ${clause} suit ${subject}.`
  - neither → `''`
- Returns `''` for a null/empty `match` so callers can render nothing.

Example: idea "Moth sleeve" (placement `sleeve`) × `zoia.ink` (overlap `dark-illustrative`,
`fine-line`; descriptor starts `black-and-grey, fine-line geometry, …`) →
`"Shares dark-illustrative + fine-line — their black-and-grey and fine-line geometry suit this sleeve."`

## Surfaces

**Brief idea editor** (`Brief.jsx`, the `matches.slice(0, 8)` ranked list): render the
rationale as a quiet line (`text-cream-muted`, small `text-xs`/`text-[0.8125rem]`) below the
`#rank · status` line and above the overlap-tag pills. Render only when the string is non-empty.

**Dashboard** (`Dashboard.jsx`, "Idea matches" panel, the `matches.map(...)` rows): keep the
existing `N tag match` count on the top row; add the rationale beneath the artist name as a
`text-cream-muted text-xs` line clamped to two lines (`line-clamp-2`). Render only when non-empty.

Both import and call the same `buildMatchRationale` from `planning.js`.

## Testing (TDD)

Add to `src/test/planning.test.js`:

- Full case: idea with `placement: 'sleeve'`, a match with `overlapTags: ['dark-illustrative','fine-line']`
  and an artist with a `styleDescriptor` → asserts the composed sentence (shared tags, first two
  descriptor phrases joined with "and", `this sleeve`, trailing period).
- No descriptor → `Shares … with this idea.` (no placement → `this idea`).
- No placement, with descriptor → sentence ends `… suit this idea.`
- Defensive: `buildMatchRationale(idea, null)` → `''`; match with empty `overlapTags` and no
  descriptor → `''`.

Existing `planning.test.js` and `artists.test.js` stay green.

## Build sequence

1. Write the failing `buildMatchRationale` tests; run to confirm they fail.
2. Implement `buildMatchRationale` + `joinAnd` helper in `planning.js`; tests pass.
3. Add the rationale line to `Brief.jsx`; verify in the running app.
4. Add the rationale line to `Dashboard.jsx`; verify.
5. Run `npm test` and `npm run build`; commit.
