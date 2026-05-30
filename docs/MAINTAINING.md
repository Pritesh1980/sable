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

1. Start the dev server: `npm run dev` (→ http://localhost:5173).
2. Seed sample data **in the capture browser only** so empty pages (Brief, Boards, Concepts)
   have content. Run this in the browser console / Playwright `evaluate` against the
   localhost origin, then reload. Object shapes must match the app (`src/data/brief.js`,
   `boards.js`, and how `Concepts.jsx` stores concepts):

   ```js
   // Artist statuses (partial records; applyDefaults() backfills the rest)
   localStorage.setItem('tattoo_artists_meta', JSON.stringify([
     { id: 'zoia.ink', status: 'contact-next' },
     { id: 'keremtattz', status: 'contact-next' },
     { id: 'oscarakermo', status: 'shortlisted' },
   ]))
   // Ideas — { id, title, description, tags[], placement, images:[{url,note}], linkedArtists[], status }
   localStorage.setItem('tattoo_ideas', JSON.stringify([/* see git history of this file's first commit */]))
   // Boards — { id, name, description, ideaIds[], cover }
   localStorage.setItem('tattoo_boards', JSON.stringify([{ id:'board-sleeve', name:'Sleeve concepts', description:'…', ideaIds:['idea-moth','idea-serpent'], cover:'' }]))
   // Concepts — { id, prompt, imageUrl, response, tags[], createdAt }
   localStorage.setItem('tattoo_concepts', JSON.stringify([{ id:'concept-moth', prompt:'…', imageUrl:'/images/artists/zoia.ink/5.jpg', response:'…', tags:['dark-illustrative','surrealism'], createdAt:'2026-05-20T10:00:00.000Z' }]))
   ```

   Use real artist IDs from `DEFAULT_ARTISTS` and real image paths (`/images/artists/<id>/<n>.jpg`)
   so thumbnails and matches render. **This never touches your real browser's data** — it's the
   capture browser's localStorage.
3. Navigate each route and save into `public/guide/` with the existing filenames:

   | Route | Files |
   |---|---|
   | `/` | `dashboard.png`, `dashboard-desktop.png` |
   | `/gallery` | `gallery-filmstrip.png`, `gallery-grid.png`, `gallery-grid-desktop.png`, `gallery-compare.png`, `gallery-stylewall.png`, `artist-detail.png`, `ranking-swipe.png` |
   | `/brief` | `brief-list.png`, `brief-idea-editor.png` |
   | `/boards` | `boards-list.png`, `board-editor.png` |
   | `/conventions` | `conventions.png` |
   | `/studios` | `studios.png` |
   | `/concepts` | `concepts.png`, `concept-card.png` |
   | `/manage` | `manage-list.png`, `manage-artist-expanded.png`, `manage-backup.png` |
   | `/help` | `help-overview.png` |

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
