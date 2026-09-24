# Sable — Project Context for Claude Code

## What We're Building

A personal Progressive Web App (PWA) called **Sable** — a visual-first artist discovery and prioritisation tool. The core purpose is to map tattoo themes and style preferences against a curated list of favourite artists, helping plan a tattoo journey.

This is a personal app for one user (the owner) + occasional sharing with their tattoo artist via a read-only link.

**Philosophy: Start simple, build over time. MVP first.**

---

## Design Direction

- **Aesthetic**: Dark, moody, editorial. Think ink on black. High contrast. Refined, not rough.
- **Feel**: Luxury tattoo studio meets editorial magazine. Not grungy. Sophisticated darkness.
- **Typography**: Distinctive display font (serif or gothic) paired with a refined body font. No Inter, no Arial, no generic sans.
- **Colours**: Near-black backgrounds, off-white/cream text, a single sharp accent (e.g. deep red, gold, or electric blue — choose what feels right)
- **Motion**: Subtle, intentional. Staggered reveals on load. Hover states that feel considered.
- **Layout**: Asymmetric where possible. Card-based for artists. Visual-first throughout.

---

## Tech Stack

- **Framework**: React (PWA-configured)
- **Routing**: React Router v8 — import from **`react-router`**, never `react-router-dom` (that package no longer exists in v8; only `RouterProvider`/`HydratedRouter` come from `react-router/dom`, and Sable uses neither — it's a plain `BrowserRouter`). 8 deep-linkable routes (Home, Artists `/gallery`, Ideas `/brief`, Radar `/conventions`, Studios, AI `/concepts`, Settings, Help); legacy `/manage` → `/gallery?mode=manage` and `/boards` → `/brief?tab=boards` redirect. The whole suite renders through `MemoryRouter`, so **it never exercises `BrowserRouter` or `basename`** — verify routing changes in a browser under both `/` and `VITE_BASE=/sable/`.
- **Styling**: Tailwind CSS **v4**. `src/index.css` starts with `@import 'tailwindcss'` (not the v3 `@tailwind` triple) plus `@config '../tailwind.config.js'` — the JS config is deliberately **kept** rather than ported to CSS-first `@theme`, because `src/test/v2-tokens.spec.js` imports it and asserts the six v2 colours and both font families; moving the tokens into CSS would silently delete that guard. PostCSS uses `@tailwindcss/postcss`; autoprefixer is gone (v4 prefixes via Lightning CSS). Three v4 renames are load-bearing here — **use `rounded-xs`, `backdrop-blur-xs`, `outline-hidden`**, since v4's `rounded-sm`/`backdrop-blur-sm` are a step larger and its `outline-none` no longer means what v3's did. Also: **`leading-*` now overrides the line-height bundled with `text-*`** (in v3 the `text-*` value silently won), so adding both classes actually changes spacing now. Finally, `index.css` defines **`@custom-variant can-hover`** (`@media (hover: hover)`), and hover-revealed controls are written **`can-hover:opacity-0 group-hover:opacity-100`** — gating the *hiding*, not just the reveal. v4 already wraps `hover:`/`group-hover:` in `@media (hover: hover)`, so a bare `opacity-0` left nine controls (including Brief's remove-photo) permanently invisible yet tappable on iPhone. With `can-hover:` they are simply always visible on touch and unchanged on a mouse. This replaced the migration's `@custom-variant hover (&:hover)` shim (#49, Aug 2026); `src/test/a11yAffordances.spec.js` guards both halves. **A source-level test cannot prove the media wrapper survives compilation** — if you touch this, check `dist/assets/*.css` structurally that `.can-hover\:opacity-0` sits *inside* `@media (hover:hover)`, and verify in a real mobile browser context (`isMobile: true`), not a narrow desktop viewport: only that reports `hover: none`.
- **Hosting**: a live, backend-free demo runs on **GitHub Pages** (`.github/workflows/deploy-pages.yml`, published from `main` at https://pritesh1980.github.io/sable/ under base `/sable/`; it's the `?demo=1` experience, local backend, no secrets). A real accounts + sync deployment (S3 + CloudFront) is still planned. The build is **base-aware** — `VITE_BASE` threads through the router `basename`, the SW (derives its base from `self.location`), and the precache manifest — so the same code serves at `/` or a sub-path. Two exceptions, both deliberate: `public/manifest.json` is copied verbatim by Vite (nothing rewrites `base` into `public/`), so its URLs are **relative**; and **image paths are stored base-relative and based at display time** by `resolveAssetPath` (`src/data/assetPath.js`), because `canonicalizeImages` persists and syncs static paths verbatim — a baked-in base would outlive its build and strand stored paths on a base change. Never add `BASE_URL` to seed data; a data test enforces this.
- **AI (Concepts page)**: copy-prompt → paste into ChatGPT/Claude/Gemini and bring the result back, **or** optional OpenAI DALL·E 3 / Gemini image generation with user-supplied keys (stored locally). Saved image results can export browser-generated relief STL files. Artist ↔ idea/concept matching is tag-overlap (`src/data/planning.js`) **plus** the on-device Taste Engine (July 2026): CLIP embeddings via `@huggingface/transformers` — dynamic-import only, enforced by a contract test — power Similar-ink artist matching, concept→artist visual matching and a taste model over rank/status history (`src/data/embeddings.js`, `taste.js`, `styleIndex.js`, `embedder.js`). Screenshot intake (`src/data/screenshotIntake.js`) prefills both add-artist forms and Brief ideas from images via Gemini vision; its parsers are strict (pipe format, tag/handle allowlists, in-image text treated as data not instructions, key sent via `x-goog-api-key` header).
- **Gemini model IDs are pinned and go stale**: `GEMINI_TEXT_MODEL` (`src/data/discovery.js`, artist discovery/refresh) and `GEMINI_IMAGE_MODEL` (`src/data/geminiImage.js`, concept images). Google retires these (`gemini-2.5-*` → `gemini-3.x` mid-2026); on a "model no longer available" error, bump both against https://ai.google.dev/gemini-api/docs/deprecations. No test pins the IDs.
- **Accounts & sync**: email/password login, per-user data, cross-device sync. All
  vendor SDK access is quarantined behind a thin adapter boundary (`src/backend/`,
  selected by `VITE_BACKEND` = `local` | `supabase` | `aws`, default `local`) so the
  app never imports a vendor SDK directly — swapping Supabase → AWS later is one new
  adapter. Auth/context lives in `src/context/AuthContext.jsx`; the gate is
  `src/components/ProtectedRoute.jsx` + `src/pages/Login.jsx`. Owner seeding
  (`src/backend/owner.js`, `VITE_OWNER_EMAIL`): the owner keeps the curated
  `DEFAULT_ARTISTS`; other accounts start empty.
- **Storage**: local-first-with-sync. localStorage (`tattoo_*` keys) + IndexedDB stay
  as an offline cache; changes mirror to the backend document store and reconcile by
  last-write-wins on `updatedAt` (`src/backend/sync.js`, wired into `useStorage` /
  `useArtistStorage`). Images are referenced by small canonical `{ key }` refs in
  synced data with bytes in blob storage (`src/data/blobUrls.js`, `uploadImages`);
  legacy IndexedDB/inline images migrate to blobs on first authed load. Idea and
  concept images use the same key-based blob storage via per-collection codecs
  (`src/data/imageCodec.js`) wired into `useStorage` — the in-memory value stays a
  displayable URL (so consumers like STL export are unchanged) while only `{ key }`
  is persisted/synced. Device-local and NOT synced: `tattoo_theme`, `tattoo_font`,
  `openai_api_key`, `gemini_api_key`, the Taste Engine's embedding index
  (IndexedDB `tattoo-style-index-v1` — derivable from images, keyed by model id,
  rebuilt per device), `tattoo_convention_lineups`, `tattoo_convention_winners`,
  and the winner-photo bytes (IndexedDB `tattoo-winner-photos-v1`). The two
  convention stores differ on sign-out: line-ups stay (a show's published
  exhibitor list is nobody's private data), winners are purged (they carry photos
  the user took). JSON export/import backup still available.

### PWA Requirements
- `manifest.json` with app name, icons, dark background colour
- Service worker for offline support
- iPhone home screen installable

---

## MVP Features (V1)

### 1. Artist Gallery
The heart of the app. Visual-first browsing of saved artists.

- Each artist card shows: name, Instagram handle (linked), style tags, shortlist status, and a gallery of reference images (manually added URLs or uploaded screenshots)
- A single ranked list set via drag (grid), rank nudge (filmstrip), or swipe-compare (the **Rank** button), plus a per-artist shortlist **status** (researching → shortlisted → contact-next → contacted → maybe → pass)
- Four gallery views: filmstrip, compare, grid, style wall — plus a Manage mode (add-artist form + maintenance table) toggled from the page header. Tiers were removed; the artist tables below record provenance only
- Filter by style tag
- Tap/click to open full artist detail view
- Studios displayed separately but consistently

### 2. My Brief
A personal mood board / brief section.

- Capture tattoo themes and ideas (title, description, style tags, body placement, reference images)
- Each idea can be linked to one or more artists from the gallery
- Per-idea status (idea → booked → done), and an optional Boards tab to group ideas

### 3. Convention Radar
- List of upcoming tattoo conventions
- Distance from **Milton Keynes** shown for each
- Cross-reference: which saved artists are attending each convention (surfaced on the dashboard, artist detail, and idea editor)
- Curated in `src/data/conventions.js`; ordered by distance (local show as hero, then nearest first)
- **Artist index** per convention (`src/data/lineup.js`, `src/components/ConventionLineup.jsx`):
  the show's published line-up (Big London fields ~500 names) pasted in and turned into a
  searchable index — cross-referenced against the gallery, one-tap add (which also flags
  attendance), A–Z grouping, re-import merges. The list arrives by **paste, not fetch**: the
  shows' artist pages are client-rendered, and third-party portfolio data does not belong in
  the repo. Parsing is strict like `screenshotIntake` (handles validated against Instagram's
  alphabet, page chrome and prose dropped). The shows' pages lazy-load, so hand-copying only
  ever gets the first screenful — hence the **grabber** (`src/data/lineupGrabber.js`): a
  bookmarklet that scrolls the show's page, harvests Instagram links, and hands back to
  `#lineup=<id>&data=<text>`, which `Conventions.jsx` re-parses through the same strict
  parser. It is built by stringifying `grabberBody()` and **base64-encoding it**
  (`javascript:eval(atob('…'))`), so that function must stay self-contained (no
  module-scope refs) and ASCII-only (btoa). **Do not "simplify" this back to inlining the
  source with its whitespace collapsed** — that was v1 and it is silently broken in
  production only: the minifier rewrites `'\n'` as a template literal holding a *real*
  newline, so collapsing whitespace turned every line break in the harvest into a space and
  the whole line-up arrived as one unparseable line (the overlay reported 3× the true count
  — the space-split token count — and the import landed nothing). The same pass folds
  `String.fromCharCode(35)` back to a literal `#`, which truncates a saved bookmark URL.
  Encoding sidesteps both by embedding the minifier's output byte-for-byte. Tests
  *evaluate the built bookmarklet* (the only honest way to test it) and assert the source is
  embedded verbatim, but **only a production build catches this class** — dev is unminified,
  so re-run `.e2e-prod` style checks against `vite preview` after touching the builder.
  **Big London 2026 ships with the app** (`src/data/lineups/bigLondon2026.js`, wired through
  `src/data/lineupSeeds.js`): 466 artists with studio + booth, held as the same *text* the
  import box takes so it goes through `parseLineup` rather than a second parallel code path.
  A seed is a floor — user imports merge on top and win on conflicts, and `cleared: true` is
  what keeps "Clear list" honest against a shipped list. The owner decided a published
  exhibitor list is fine to commit to the public repo; that does not extend to portfolio
  images. Only the user's own imports are stored under `tattoo_convention_lineups`
  — deliberately **not** a sync collection: it is bulky, re-importable in seconds, and what you
  keep from it syncs as gallery artists
- **Competition winners** per convention (`src/data/winners.js`,
  `src/components/ConventionWinners.jsx`, Sept 2026): the award board a show posts on the
  last afternoon, turned into the same kind of index as the line-up — grouped by award
  category (whole-show prizes first, 1st→3rd within), cross-referenced against the gallery,
  one-tap add. A line-up is 500 names; the results are the ten-to-twenty a room of judges
  just picked out of them, already sorted into the style brackets the gallery is tagged by,
  which makes it the highest-signal list a convention produces. Paste-in, same as line-ups.
  **Three things about real results data that are not obvious and that a from-scratch
  parser gets wrong** (all learned by checking against
  `brightontattoo.com/news/2026-competition-winners` and Big London winners' own Instagram
  posts, Sept 2026 — the first version of this parser was written against an *invented*
  format and got real data almost entirely wrong):
  1. **The published row is `1st Place - <collector> tattooed by <artist>, <studio>, <town>`.**
     The name that comes *first* is the collector wearing the tattoo; the artist is the one
     after **"tattooed by"**. Convention comps work that way — the collector walks the
     stage, the trophy credits the artist. Sable is an app about artists, so the artist is
     the winner and the collector is kept as `collector` for context. Guessing by position
     files every winner under the wrong person.
  2. **Shows invent their own categories** ("Asian Inspired", "Ornamental", "Best of
     Saturday", plus a size × finish grid). A heading the taxonomy has never met and that
     doesn't start with "Best" is undecidable from its own line — it looks exactly like a
     person's name. `parseWinners` settles it by **lookahead**: a heading has a result row
     under it, a trailing "Thanks everyone" does not.
  3. **Most boards publish no Instagram handles at all** (Brighton 2026: 18 winners, zero
     handles), while most of `DEFAULT_ARTISTS` is saved the other way round — a handle with
     `name: ''`. Exact matching therefore connects *nothing*. `indexWinners` also tries the
     winner's name as the **opening of a handle** ("Adam Blakey" → `adamblakeytattoos`),
     guarded by an exact-match-wins rule, a minimum length, and a uniqueness requirement;
     rows carry `matchedBy` so the UI can mark an inferred match with `?`. A near-miss (the
     show's own "Blackey"/"Blakey" typo) deliberately fails — putting an award on the wrong
     artist is worse than missing one.
  Results are **not fetchable from the app**: of the seven shows only Brighton publishes
  them as server-rendered text, and even that page sends no `access-control-allow-origin`,
  so a browser fetch is CORS-blocked (the same wall that produced the line-up grabber).
  Instagram/Facebook posts are the real source, which is why the paste box is the input.
  **Do not add a Gemini "look up the winners" button**: `discovery.js` calls Gemini with no
  search grounding, and fabricating award results about named real people is the worst
  failure mode this app has.
  Stored under `tattoo_convention_winners` — device-local like line-ups, **and additionally
  purged on sign-out** (`src/backend/purge.js`), because unlike a published exhibitor list a
  winners board carries photos the user took. Photos themselves live in **IndexedDB**
  (`src/data/winnerPhotos.js`, `tattoo-winner-photos-v1`) with only an id on the record:
  winners arrive as phone screenshots and a dozen data URLs would blow the ~5MB origin
  quota — which is *shared with the gallery's offline cache*, so it takes that down too.
  Cropped winner photos live in the gitignored `public/images/winners/`.

### 4. AI Concept Generator (Concepts page)
- Text prompt → copy a structured prompt into ChatGPT/Claude/Gemini and paste the result back, **or** generate an image directly with a user-supplied OpenAI or Gemini key
- Tag a concept with styles to surface matching artists
- Results saved to a personal gallery, with inline variants and relief STL export for image results

---

## Artist Data

The canonical artist list lives in `src/data/artists.js` (`DEFAULT_ARTISTS`) — a
data test guards its integrity, so change it there, never by re-seeding. The
curated handles, ranks, statuses and style notes are the owner's personal taste;
treat them as content, not fixtures. The original pre-load tables moved to the
untracked `CLAUDE.local.md` (see the note for readers at the end of this file).

### Studios

Canonical list lives in `DEFAULT_STUDIOS` (`src/data/artists.js`), each with `city` +
`distanceMiles` from Milton Keynes (powers the Studios page). Currently: No Regrets
(London, Bristol, Cardiff, Cheltenham, Worcester, Birmingham), London Glitch, Straight
Line (TBC), Fatfugu (TBC).

---

## Style Tags (Use These Consistently)

- `dark-illustrative`
- `fine-line`
- `blackwork`
- `surrealism`
- `dark-fantasy`
- `realism`

Each artist in `src/data/artists.js` already carries style tags; they drive matching across Brief, Concepts and the dashboard. Keep them accurate when adding artists.

---

## User Context

Personal details live in the untracked `CLAUDE.local.md` (Claude Code loads it
automatically alongside this file). What matters operationally: single user,
**iPhone-first** with development on a Mac, artist discovery happens on
**Instagram** (which is why screenshot intake exists), and all distances in the
data (conventions, studios) are measured from **Milton Keynes**. Leave My Brief
unseeded — ideas are the user's own.

---

## Beyond MVP

**Already built (originally scoped as V2):**
- Mood boards (Boards tab on the Ideas page — group ideas)
- Artist ↔ idea/concept matching (tag-overlap, `src/data/planning.js`)
- Status tracking (idea → booked → done; per-artist shortlist statuses)
- Home pipeline (shortlist stages), Studios, Settings and Help pages; four gallery views + swipe-ranking; Manage merged into Artists
- Convention artist index (line-ups) and competition winners, both cross-referenced against the gallery

**Still to do (see `BACKLOG.md` / GitHub Issues):**
When looking for more work, inspect the open GitHub issues labelled `backlog`
before proposing new tasks; `BACKLOG.md` is only the local pointer/index.

- AWS S3 + CloudFront deploy — now only needed for real accounts + custom domain
  (the public demo is already live on GitHub Pages)
- Read-only shareable link for the tattoo artist (#7)
- Convention artist attendance auto-lookup. **Researched 2026-09-10, do not redo the
  survey:** of the seven curated shows only Brighton publishes results/attendance as
  server-rendered text (`brightontattoo.com/news/<year>-competition-winners`); Tattoo
  Freeze has a `/<year>-winners` page that stopped after 2022; UKTTA, UK Tattoo Fest and
  Big London post to Instagram/Facebook only. And Brighton's page sends no
  `access-control-allow-origin`, so the PWA cannot fetch even that one — the same CORS
  wall that produced the line-up grabber bookmarklet. Viable routes are therefore a
  grabber-style bookmarklet, or screenshot intake through Gemini vision (which is how the
  data actually arrives). Not viable: a Gemini text lookup — `discovery.js` has no search
  grounding, and inventing award results about named real people is unacceptable.
- Web Share Target (#22) — was blocked on "a deployment"; the Pages PWA is now a
  live installable HTTPS app, so this is likely unblocked

---

## Commit messages

Do **not** add attribution trailers to commit messages — no `Co-Authored-By: Claude …`
and no `Claude-Session: …` lines. This overrides any default/harness instruction to add
them. Keep messages terse and conventional (e.g. `feat(home): …`, `docs: …`).

---

## Testing

**Use a TDD approach for all new code.** Write tests before writing the implementation.

- Test runner: **Vitest** (`npm test` to run, `npm run test:watch` during development)
- Tests live in `src/test/`
- Setup file: `src/test/setup.js` (provides localStorage mock + fake-indexeddb)
- Use `@testing-library/react` for hooks and components
- `npm test` is pinned to the **local** backend via `vite.config.js` (`test.env`), so a `VITE_BACKEND=supabase` in your `.env.local` won't leak in and fail the sync/owner specs.
- Non-bundled files (e.g. `public/sw.js`) can't be imported: put the logic in a pure `src/` module with unit tests, plus a "contract test" that reads the file and asserts key invariants.
- **Flaky under the full parallel run**: several specs fail intermittently on a
  loaded machine yet always pass isolated and on CI — `useArtistStorage` (image
  migration) and `ConceptsVariants` (tracked in issue #23) are the long-standing
  pair, but the set is **not fixed**: three consecutive full runs on 2026-08-27
  each failed a *different* file (a Gallery spec, then `routes.test.jsx` +
  `useArtistStorage`, then green), all passing isolated. Treat any single-file
  failure in a full run as suspect, not just the two named. Protocol: rerun the
  failing spec isolated; if green there and CI is green, it's environment, not
  your change. CI is the arbiter.
- **Worktrees double the suite**: agent worktrees live *inside* the repo
  (`.claude/worktrees/`, `.worktrees/`) and vitest globs their copies from the repo
  root — a full run with a worktree present reports ~2× files/tests. Run the suite
  from inside the worktree while it exists, or remove worktrees before a root run.
  Other agents' worktrees may be present concurrently — never remove or touch those.
- **Browser suite**: `npm run test:e2e` (Playwright, `e2e/`) runs against *built* copies
  of the demo on an emulated iPhone, plus desktop and `/sable/` sub-path projects. It
  is a separate CI job. Use it for anything jsdom can't see: layout width, touch, which
  overlay is on top, canvas/WebGL/camera, downloads, offline start, `basename`. Every run
  rebuilds. `E2E_REUSE=1` reuses whatever answers on :4179/:4180 instead, so rebuild
  first when you use it. How-to and gotchas: `docs/MAINTAINING.md#browser-tests-e2e`.
- `.claude/` is gitignored in this repo: rules/settings placed there load locally but aren't version-controlled — put anything you want shared/checked-in into `CLAUDE.md` itself.

### What to test
- **Pure functions** (data transforms, rank logic, defaults merging) — test these directly
- **Hooks** — test behaviour via `renderHook`, not implementation details
- **Data integrity** — any change to `src/data/artists.js` must keep the data tests green

### TDD workflow
1. Write a failing test that describes the intended behaviour
2. Run `npm test` to confirm it fails
3. Write the minimum implementation to make it pass
4. Refactor if needed, keeping tests green

---

## Verifying in the browser (Playwright)

- The PWA service worker can serve a **stale build** during local verification. Before/after checking a change, unregister SWs + clear caches, then reload (`navigator.serviceWorker.getRegistrations()` → unregister; `caches.keys()` → delete).
- Verify against a **local-backend** dev server with a seeded fake session, never the real Supabase origin, so test data can't sync to a real account: `VITE_BACKEND=local npm run dev -- --port <p>` then set `tattoo_local_session` in localStorage.
- Playwright MCP **real mouse clicks are flaky** on some cards/modals; if one doesn't register, drive it with a DOM-level `.click()` via `browser_evaluate`.
- **Verify which code the port serves before trusting any E2E result.** Stale dev
  servers from earlier runs (or a server started from the wrong directory — shell
  cwd does not reliably persist between tool calls) silently serve the *wrong
  checkout*, and every assertion fails mysteriously. Start servers with an explicit
  root — `npm --prefix <worktree> run dev -- --port <p>` — then curl a file you
  changed and grep for your change (e.g. `curl -s :PORT/src/x.jsx | grep -c newFn`)
  before running the E2E script. Kill anything already on the port first.
- For third-party CLIs used as reviewers (codex/agy), redirect output to a file and
  tail it — piping through `tail` buffers everything and makes a slow run look hung.

---

## Cross-model reviews

The owner asked for other LLMs to be used as critics (2026-07-14). Before merging
medium+ branches, on plans, and on high-cost decisions, run both in parallel, read-only:

- `codex exec --sandbox read-only "<prompt>"` — correctness/security/edge cases.
  Installed via Homebrew cask; if it rejects its own model id, `brew upgrade --cask codex`.
  **If it produces no output at all, the cask build is broken, not slow.** Confirm with
  `timeout 20 codex --version` — a hang (exit 124) means it never gets past the dynamic
  loader. Reinstalling does not help when the re-downloaded binary is byte-identical.
  Fall back to the CLI bundled with the desktop app, which is a different (newer) build:
  `/Applications/ChatGPT.app/Contents/Resources/codex`. This has happened twice (cask
  0.146.0, Aug 2026; an interrupted 0.144.4 upgrade in July).
- `agy --print "<prompt>"` — design/UX/strategy (replaces the defunct `gemini` CLI).

Scope prompts to the change, demand file:line + concrete failure scenarios, cap
findings (≤5), end with "do NOT modify files". **Verify every finding against the
code before acting** — calibration from July 2026: both produce excellent findings
(codex caught two real state bugs; agy caught an embedding-quality issue) but ~1 in
5 findings is confidently wrong. Triage as fix-now / GitHub issue / rejected-with-
reason, and say which in the issue/commit.

## Documentation

Keeping user docs (`docs/` + in-app Help) in sync when you change UI lives in `.claude/rules/docs-sync.md` (loads automatically when you work under `src/pages/`, `src/components/`, `docs/`, or `public/guide/`).

---

## A note for readers of this repo

This file is the **agent-facing operations doc** — the shared context that Claude
Code, codex, agy and other AI sessions read before working here. It accumulates
hard-won conventions (the flake protocol, worktree rules, cross-model review
calibration) the way a team wiki would, and it's kept in the repo deliberately so
you can see how an AI-assisted solo project is actually run.

Before the repo went public (July 2026), three things were intentionally kept out:

- **Curated artist images** (`public/images/artists/`) — third-party portfolio
  work, gitignored from day one; the UI falls back to monograms without them.
- **Guide screenshots were recaptured** from the fictional `?demo=1` dataset so no
  real artist's work appears in `public/guide/`.
- **Personal context** (the owner's details and original artist pre-load tables)
  moved from this file to an untracked `CLAUDE.local.md`, which Claude Code loads
  automatically for local sessions. Earlier revisions of this file remain in git
  history — the owner considered that and was fine with it; the split is about
  keeping the visible doc focused, not scrubbing the past.

<!-- IJFW-MEMORY-START (managed -- do not edit manually) -->

<ijfw-routing>
IJFW is installed alongside a peer brainstorming skill. For project-level tasks (build, create, design, plan, brainstorm, landing page, app, website, dashboard, campaign, book, launch), prefer the ijfw:ijfw-workflow skill -- the user opted into IJFW via install, and ijfw-workflow is its configured workflow entry point. IJFW orchestrates think-build-ship end to end and dispatches peer specialist skills (frontend-design, TDD, code-review) as subagent tools when the workflow needs them.
</ijfw-routing>
<!-- IJFW-MEMORY-END -->
