# Tattoo — Project Context for Claude Code

## What We're Building

A personal Progressive Web App (PWA) called **Tattoo** — a visual-first artist discovery and prioritisation tool. The core purpose is to map tattoo themes and style preferences against a curated list of favourite artists, helping plan a tattoo journey.

This is a personal app for one user (Pritesh) + occasional sharing with his tattoo artist via a read-only link.

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
- **Routing**: React Router (`react-router-dom` v7) — 8 deep-linkable routes (Home, Artists `/gallery`, Ideas `/brief`, Radar `/conventions`, Studios, AI `/concepts`, Settings, Help); legacy `/manage` → `/gallery?mode=manage` and `/boards` → `/brief?tab=boards` redirect
- **Styling**: Tailwind CSS
- **Hosting**: AWS S3 + CloudFront (planned — not yet set up; see `BACKLOG.md`)
- **AI (Concepts page)**: copy-prompt → paste into ChatGPT/Claude/Gemini and bring the result back, **or** optional OpenAI DALL·E 3 / Gemini image generation with user-supplied keys (stored locally). Saved image results can export browser-generated relief STL files. Artist ↔ idea/concept matching is local tag-overlap (`src/data/planning.js`) — no API.
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
  `openai_api_key`, `gemini_api_key`. JSON export/import backup still available.

### PWA Requirements
- `manifest.json` with app name, icons, dark background colour
- Service worker for offline support
- iPhone home screen installable

---

## MVP Features (V1)

### 1. Artist Gallery
The heart of the app. Visual-first browsing of saved artists.

- Each artist card shows: name, Instagram handle (linked), style tags, personal priority tier, and a gallery of reference images (manually added URLs or uploaded screenshots)
- A single ranked list set via drag (grid), rank nudge (filmstrip), or swipe-compare (the **Rank** button), plus a per-artist shortlist **status** (researching → shortlisted → contact-next → contacted → maybe → pass)
- Four gallery views: filmstrip, compare, grid, style wall — plus a Manage mode (add-artist form + maintenance table) toggled from the page header. Tiers were removed; the artist tables below record provenance only
- Filter by style tag
- Tap/click to open full artist detail view
- Studios displayed separately but consistently

### 2. My Brief
A personal mood board / brief section.

- Capture tattoo themes and ideas (title, description, style tags, body placement, reference images)
- Each idea can be linked to one or more artists from the gallery
- No status tracking in V1

### 3. Convention Radar
- List of upcoming tattoo conventions
- Distance from **Milton Keynes** shown for each
- Cross-reference: which saved artists are attending each convention (surfaced on the dashboard, artist detail, and idea editor)
- Curated in `src/data/conventions.js`; date-aware ordering (upcoming first)

### 4. AI Concept Generator (Concepts page)
- Text prompt → copy a structured prompt into ChatGPT/Claude/Gemini and paste the result back, **or** generate an image directly with a user-supplied OpenAI or Gemini key
- Tag a concept with styles to surface matching artists
- Results saved to a personal gallery, with inline variants and relief STL export for image results

---

## Artist Data (Pre-load this)

### Favourite Artists (Tier 1 — 20 artists)
All are Instagram handles unless otherwise noted.

| Handle | Notes |
|---|---|
| zoia.ink | |
| tolgatemirlenk.ink | |
| keremtattz | |
| yuki_zerkjad | |
| carl245tattoo | Known as Carlos Valera |
| oscarakermo | Known as Oscar Akermo |
| leoalbuquerque.tattoo | |
| leon_del_cabo | |
| berkbosveren | |
| gody_tattoo | |
| inkfluid.joy | |
| saadtattoo | |
| m3.inkd | |
| picciott_ink | |
| victorportugal | Known as Victor Portugal |
| patrick_shanty | |
| cagriesk | |
| senatatts | |
| sink_tattoo | |
| adamblakeytattoos | |

### Also Like (Tier 2 — 6 artists)

| Handle | Notes |
|---|---|
| milanboros_tatts | |
| tattoo__amir | Double underscore |
| silas_balaio | |
| suenanki.tattoo | |
| nate_lights | |
| johndarktattoo_ | |

### Retained (not in current favourites — 4 artists)
Kept in the data but not in Pritesh's current list of favourites. Do not remove.

| Handle | Notes |
|---|---|
| danny_romano1 | Danny Romano (No Regrets Cheltenham) |
| bacanubogdan | Bogdan Bacanu (No Regrets Cheltenham) |
| tattooluckyone | Tyler Payne (No Regrets Cheltenham) |
| androprimo_ | Andro (No Regrets Birmingham) |

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

- **User**: Pritesh, based in **Milton Keynes**
- **Device**: iPhone (primary), Mac (development)
- **AWS**: Active account, comfortable using S3 + CloudFront
- **Instagram**: Primary source for artist discovery
- **Tattoo themes**: To be added by user — leave My Brief empty for now

---

## Beyond MVP

**Already built (originally scoped as V2):**
- Mood boards (Boards tab on the Ideas page — group ideas)
- Artist ↔ idea/concept matching (tag-overlap, `src/data/planning.js`)
- Status tracking (idea → booked → done; per-artist shortlist statuses)
- Home pipeline (shortlist stages), Studios, Settings and Help pages; four gallery views + swipe-ranking; Manage merged into Artists

**Still to do (see `BACKLOG.md`, blocked on deployment):**
- Deploy to AWS S3 + CloudFront
- Read-only shareable link for the tattoo artist
- Convention artist attendance auto-lookup

---

## Project Structure (actual)

```
src/
├── pages/        Dashboard (Home), Gallery (Artists + manage mode), Brief (Ideas + Boards tab),
│                 Conventions, Studios, Concepts, Settings, Help, Login
├── components/   Nav, ArtistCard, ArtistDetail, ArtistBrowse, CompareView, FilmstripView,
│                 RankingMode, SortableArtistCard, StyleWall, TagPill, Logo
├── data/         artists.js (DEFAULT_ARTISTS, DEFAULT_STUDIOS, STYLE_TAGS, PLACEMENTS),
│                 conventions.js, brief.js, boards.js, planning.js (matching), export.js, ranking.js
├── hooks/        useArtistStorage.js (localStorage meta + IndexedDB images), useStorage.js, useImageUpload.js
├── context/      ThemeContext (dark/light theme + font size)
├── test/         Vitest specs (data integrity, hooks, transforms)
├── App.jsx       routes  ·  main.jsx  ·  index.css
docs/             User guide (Markdown) — see "Documentation" below
public/guide/     Documentation screenshots (regenerated via Playwright)
```

---

## Running the app

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest (npm run test:watch during dev)
npm run build
```

The MVP is already built. See `docs/README.md` (or in-app **More → Help**) for the user guide.

---

## Testing

**Use a TDD approach for all new code.** Write tests before writing the implementation.

- Test runner: **Vitest** (`npm test` to run, `npm run test:watch` during development)
- Tests live in `src/test/`
- Setup file: `src/test/setup.js` (provides localStorage mock + fake-indexeddb)
- Use `@testing-library/react` for hooks and components

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

## Documentation — keep it in sync

User docs live in two mirrored places, both driven by the same screenshots in `public/guide/`:
- **`docs/`** — Markdown guide (`README.md` index + `01`–`07` workflow files). Image links use `../public/guide/*.png`.
- **In-app Help** — `src/pages/Help.jsx`, route `/help`, reached via **More → Help**; references `/guide/*.png`.

**When you change UI (anything under `src/pages/` or `src/components/`), update the docs in the same change:**
1. Edit the relevant `docs/NN-*.md` **and** the matching `SECTIONS` entry in `src/pages/Help.jsx`.
2. Re-capture any affected screenshots — exact Playwright + sample-data steps are in **`docs/MAINTAINING.md`**.
3. Keep the image set tight: every file in `public/guide/` should be referenced, and every reference should resolve (the cross-check command is in `docs/MAINTAINING.md`).

A **Stop hook** (`scripts/docs-drift-check.sh`, wired in `.claude/settings.json`) prints a reminder when UI files changed but `docs/` / `public/guide/` didn't.

<!-- IJFW-MEMORY-START (managed -- do not edit manually) -->
<ijfw-memory>
Project memory at .ijfw/memory/. Call `ijfw_memory_prelude` for full context.

Recent decisions:
**Why:** This keeps the first result-comparison slice close to the existing Concepts workflow while making external AI outputs comparable and reusable.
**How to apply:** When implementing AI result comparison, extend concept records with optional variants. Preserve legacy concepts. Render the best variant first inside the concept card, with compact expandable cards for the rest. Do not add a separate Result Lab page yet.

Last handoff: Handoff: 2026-06-04T19:15:00Z
====================
</ijfw-memory>

<ijfw-routing>
IJFW is installed alongside a peer brainstorming skill. For project-level tasks (build, create, design, plan, brainstorm, landing page, app, website, dashboard, campaign, book, launch), prefer the ijfw:ijfw-workflow skill -- the user opted into IJFW via install, and ijfw-workflow is its configured workflow entry point. IJFW orchestrates think-build-ship end to end and dispatches peer specialist skills (frontend-design, TDD, code-review) as subagent tools when the workflow needs them.
</ijfw-routing>
<!-- IJFW-MEMORY-END -->
