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

A phone *viewport* is not a phone: a resized desktop context still reports
`hover: hover`, so the seven `can-hover:opacity-0` controls (Wall/Style Wall captions,
Brief's remove-photo ×, the filmstrip rank nudges) photograph as **hidden**, while a real
iPhone shows them. To capture what a phone actually renders, use a mobile browser
context — `browser.newContext({ viewport: { width: 430, height: 920 }, isMobile: true,
hasTouch: true })` — which reports `hover: none`. Most of the image set predates that
distinction and was shot with the plain viewport; the two Grid shots were re-captured
with a mobile context for #70.

The grid card's own handle and **+** are no longer in that group: since #70 they appear
only with **⇅ Reorder** on, so a default Grid shot has bare cards either way. Shoot Grid
with Reorder **off** — that is the view people arrive in.

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

## Auditing touch targets

```bash
VITE_BACKEND=local npm run dev -- --port 5174
npx playwright install chromium   # once
npm run audit:targets -- http://localhost:5174
```

`scripts/auditTouchTargets.mjs` walks every route in a **mobile** browser context,
measures each interactive control, and lists anything under 44 × 44. It reports; it
never fails. The judgement is in `src/a11y/touchTargets.js` and is unit-tested — this
is the same pure-module-plus-thin-wrapper split the service worker uses.

It exists because the source scan in `src/test/a11yAffordances.spec.js` **cannot** do
this job, and it is worth understanding why before trusting a green suite here. That
scan reads `w-N` / `h-N` classes, so:

- a control sized by padding (`px-2 py-1`) has no size it can read, and
- `<button>{label}</button>` is indistinguishable from a button holding a sentence.

The Artists view switcher sat at 24 × 28 for months with every test passing (#73). If
you are changing control sizes, the browser is the only thing that can tell you the
truth — as with the `can-hover` media wrapper, which also survives only in a real
mobile context.

### It also checks nothing is covered

Growing targets is what makes them overlap, so the audit hit-tests each control's
centre after scrolling it into view, and reports anything a tap would miss. Scrolling
first matters: the fixed bottom nav covers whatever is under it at some scroll
position, and reporting that would bury the real finding.

**Its blind spot, and the guard for it:** the pass only looks at controls, so it cannot
see a control covering *non-interactive* content. That is exactly how #76's worst
regression appeared — the filmstrip's Instagram link was grown to 44pt with `-my-3`
and covered the artist's name, so tapping the name opened Instagram. The victim was an
`<h3>`, invisible to the audit. What is visible is the technique, so
`a11yAffordances.spec.js` fails any 44pt growth class combined with a negative margin.
**Grow the layout, never pull the target over its neighbour.**

## Browser tests (e2e)

```bash
npx playwright install chromium   # once
npm run test:e2e                  # builds, serves, runs everything
npx playwright test e2e/stl.e2e.js --project=iphone   # one file
npx playwright show-trace test-results/<test>/trace.zip   # after a failure
```

`playwright.config.js` builds the app twice and serves both builds with `vite preview`:
one at `/` on :4179, and one with `VITE_BASE=/sable/` on :4180, matching the public
demo. Both use the **offline local backend**. Every run rebuilds (about 20 seconds).
`E2E_REUSE=1` reuses servers already on those ports for a faster loop, but anything
answering there counts, including an old build or another checkout. Rebuild
(`npm run build`) after changing app code, or you are testing yesterday's `dist/` (the
same trap as a stale dev server).
Service workers are **blocked** by default so a cached build can't hide a change; only
the offline tests opt back in (`test.use({ serviceWorkers: 'allow' })`).
Every test starts from the fictional `?demo=1` data (`openDemo` in `e2e/fixtures.js`),
fails on any uncaught page error, and never touches a real key or Google: the one
Gemini call is intercepted with `page.route`.

Three projects: **iphone** (390×844, `isMobile`, touch; runs almost everything),
**desktop** (`*.desktop.e2e.js`: hover and keyboard) and **iphone-subpath**
(`*.subpath.e2e.js`). What each file guards:

| File | Guards |
|---|---|
| `layout` | No route or gallery view wider than the screen at 320/375/390px (#96) |
| `viewers` | Swipe/tap/close in both viewers; delete + undo; drawers paint above the viewer; Escape peels **one** layer |
| `stl` | Real canvas → mesh → download for relief, line art (+ mask pixels) and lithophane; WebGL preview |
| `tryon` | Gemini request shape (key in header, three parts); fake-camera drag + pinch; refused-camera photo fallback |
| `tastemap` | Map from a seeded style index (no 90MB model in CI); tap through to the artist |
| `hover` / `hover.desktop` | `can-hover` controls visible on a phone and hover-revealed on desktop (#49) |
| `offline` | Once installed, the app opens every main route with the network off, images included |
| `routes.subpath` | Deep links, redirects, image paths, the manifest and offline start under `/sable/` |

### Live demo smoke test

`e2e/smoke.live.js` runs against the **deployed** demo (https://pritesh1980.github.io/sable/),
not a local build: Pages' CDN, the real service worker and the production-minified
bundle. `.github/workflows/live-smoke.yml` runs it after every successful Pages deploy
and weekly. Its own config, `playwright.live.config.js`, has no `webServer`, and its
`*.live.js` pattern keeps it and the offline suite from running each other.

```bash
npx playwright test --config playwright.live.config.js
LIVE_URL=http://localhost:4190/sable/ npx playwright test --config playwright.live.config.js
```

To try it against a local build, build with `VITE_BASE=/sable/` **and start
`vite preview` with `VITE_BASE=/sable/` too**. Preview reads the base when it starts.
Without it, `/sable/assets/*` script requests 404 and the page is blank.
Pages answers deep links with `404.html` and a 404 status, so the spec judges documents
by what renders and requires only sub-resources to be 2xx. `vite preview` answers a
missing stylesheet with `index.html` (200), so that one class of breakage shows up only
against the real site.

Things this suite taught that are easy to get wrong:

- **Measure overflow against `documentElement.clientWidth`, not `innerWidth`.** On a
  mobile viewport Chromium zooms out to fit overflowing content, so `innerWidth` grows
  with the page and the check can never fail.
- **Swipes go through CDP `Input.dispatchTouchEvent`, one session per gesture.**
  Playwright's touchscreen only taps, and a new CDP session mid-gesture rejects the
  move.
- **"On top" means `elementFromPoint`, after scrolling into view.** A drawer rendered
  *under* a viewer can still be visible and clickable as far as Playwright is
  concerned.
- **Real key presses run microtasks between listeners; `fireEvent` doesn't.** That is
  why the Escape-stacking bug passed in Vitest and failed here. React had already
  removed the closed drawer before the viewer's `window` listener ran. Layers now
  `preventDefault()` the Escape they handle, and lower layers skip handled events
  (`isTopmostDialog` in `useDialogFocus.js` covers the reverse order).
- **Check a new guard can fail.** Each one here was mutation-checked: revert the fix,
  rebuild, watch it go red.

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
