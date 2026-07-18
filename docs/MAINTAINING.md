# Maintaining the docs

How to keep the user guide (`docs/`) and the in-app Help page (`src/pages/Help.jsx`) in
step with the app. **This is a contributor note, not part of the user guide.**

## What's connected to what

- `docs/README.md` + `docs/01`–`07-*.md` — the Markdown guide. Images: `../public/guide/*.png`.
- `src/pages/Help.jsx` — the in-app `/help` page (the `SECTIONS` array). Images: `/guide/*.png`.
- `public/guide/*.png` — **one** screenshot set, shared by both. Don't duplicate images.

When you change UI under `src/pages/` or `src/components/`, update the matching `docs/NN-*.md`
**and** the `SECTIONS` entry in `Help.jsx`, then re-capture any affected screenshots.

## Regenerating screenshots

Screenshots are captured against the dev server with Playwright at a phone viewport
(`430 × 920`), plus a couple at desktop width (`1280 × 900`). Capture **viewport** shots,
not `fullPage` — the fixed bottom nav floats to the middle on full-page captures.

1. Start a dev server pinned to the offline backend so seeded data can't sync to a
   real account: `VITE_BACKEND=local npm run dev -- --port 5174` (then capture against
   http://localhost:5174).
2. **Seed with the demo dataset, never real artist imagery.** These screenshots are
   committed and published — the curated images under `public/images/artists/` are
   third-party portfolio work that must never appear in them (this bit us once:
   pre-July-2026 captures shipped real artists' photos). Visit `/?demo=1` — it seeds
   a fictional session, 6 artists with committed hand-authored SVG artwork, and 3 ideas
   (`src/data/demoSeed.js`). Boards and Concepts aren't in the seed; inject them via
   Playwright `evaluate` using `/images/demo/<artist>/<n>.svg` paths, writing BOTH
   the `tattoo_*` and `tattoo_remote_*` localStorage keys so sync keeps them, then
   reload:

   ```js
   // Boards — { id, name, description, ideaIds[], cover } (demo idea ids:
   // demo-idea-forest, demo-idea-eclipse, demo-idea-geometry)
   // Concepts — { id, prompt, imageUrl, response, tags[], createdAt, updatedAt }
   // See the capture script pattern in git history (guide-recapture, July 2026).
   ```
3. Navigate each route and save into `public/guide/` with the existing filenames:

   | Route | Files |
   |---|---|
   | `/` | `wall.png` (desktop), `wall-viewer.png` (desktop, viewer open with HUD visible), `drawer.png` (desktop, ⋯ open) |
   | `/pipeline` | `dashboard.png`, `dashboard-desktop.png` |
   | `/gallery` | `gallery-filmstrip.png`, `gallery-grid.png`, `gallery-grid-desktop.png`, `gallery-compare.png`, `gallery-stylewall.png`, `artist-detail.png`, `ranking-swipe.png` |
   | `/gallery?mode=manage` | `manage-list.png`, `manage-artist-expanded.png` |
   | `/brief` | `brief-list.png`, `brief-idea-editor.png` |
   | `/brief?tab=boards` | `boards-list.png`, `board-editor.png` |
   | `/conventions` | `conventions.png` |
   | `/studios` | `studios.png` |
   | `/concepts` | `concepts.png` (desktop, composer open), `concept-card.png` (desktop, concept full-screen with `I` panel open) |
   | `/settings` | `settings.png` |
   | `/help` | `help-overview.png` |

   The v2 surfaces (`wall*`, `drawer`, `concepts*`) are laptop-first — capture those at
   `1280 × 900`; the classic pages keep the phone viewport.

   (Doing this with the Playwright MCP: resize → navigate → `browser_evaluate` to seed → reload →
   wait ~1.5s for images → `browser_take_screenshot` per state, clicking view toggles / opening
   modals as needed.)

## Cross-check before committing

Every referenced image should exist, and every image should be referenced:

```bash
grep -rho 'guide/[a-z-]*\.png' docs/ src/pages/Help.jsx | sed 's#.*guide/##' | sort -u > /tmp/refs.txt
ls public/guide/ | sort -u > /tmp/have.txt
echo "missing: $(comm -23 /tmp/refs.txt /tmp/have.txt | tr '\n' ' ')"
echo "unused:  $(comm -13 /tmp/refs.txt /tmp/have.txt | tr '\n' ' ')"
```

Both lines should be empty. Then run `npm run build` and `npm test` to confirm `Help.jsx`
and the routes still compile.

## The drift reminder

`scripts/docs-drift-check.sh` runs as a Stop hook (`.claude/settings.json`). It nudges you
when files under `src/pages/` or `src/components/` have uncommitted changes but `docs/` and
`public/guide/` don't. Run it manually any time: `bash scripts/docs-drift-check.sh`.
