# t6b verify — one-click full-screen (Wall → WallViewer)

Manual/Playwright checklist for the orchestrator. Exercises the headline
acceptance criterion: **open app → click any image → full screen, 1 click.**

## Setup

1. Start a local-backend dev server (never point Playwright at the real
   Supabase origin):
   ```
   VITE_BACKEND=local npm run dev -- --port 5183
   ```
2. Navigate to `http://localhost:5183/`.
3. Before asserting anything, clear any stale service worker / cache from a
   previous run:
   ```js
   const regs = await navigator.serviceWorker.getRegistrations()
   await Promise.all(regs.map((r) => r.unregister()))
   const keys = await caches.keys()
   await Promise.all(keys.map((k) => caches.delete(k)))
   ```
   Reload after clearing.
4. Seed a fake local session so the app isn't stuck on `/login` (adjust key
   name/shape if `AuthContext`/`src/backend/local.js` has since changed):
   ```js
   localStorage.setItem('tattoo_local_session', JSON.stringify({
     user: { id: 'local-test-user', email: 'me@pritesh.net' },
   }))
   ```
   Reload again. You should land on the Wall (`/`), masonry of artist images,
   hairline bar on top (wordmark "Sable.", Artists/Concepts switch, "+ Add
   artist", "⋯" drawer button).
5. If the wall is empty (no seed images in this environment), seeding an
   artist with at least 2 images via **+ Add artist** → Gallery manage mode is
   enough to exercise the checklist; otherwise use the owner's default
   artists if present.

## 1-click full-screen criterion

6. `browser_snapshot` to get refs, then click the **first wall image** (the
   `<figure>` tile — click the image, not the caption, since the caption is
   only visible on hover and has `pointer-events: none`).
   - **Expect**: within the same interaction, the full-viewport viewer
     appears — dark background, large image centered, artist name (uppercase
     display type) bottom-left, `@handle ↗` Instagram link, style tags,
     `NN / total · artist X of Y` index top-right, prev/next chevrons,
     "Generate a concept in this style" button bottom-right with a `G` kbd
     hint, keyboard legend along the bottom.
   - **Expect**: the hairline bar (wordmark/Artists/Concepts/Add
     artist/⋯) is **gone** — the viewer owns the whole screen.
   - This is the 1-click check: exactly one click, no intermediate route
     change, no modal-then-modal.

## Keyboard walk

7. Press `→` a few times (if the artist has multiple images) — filmstrip
   thumbnail row (if present) highlights the new current image, index label
   updates (e.g. `02 / 03`).
8. Press `↓` — jumps to the **next artist's first image** (index label's
   "artist X of Y" increments; artist name/handle/styles update). Press `↑`
   to confirm it returns to the previous artist.
9. Press `I` — info panel slides in from the right (status pill, notes,
   linked ideas). Press `I` again (or its close button) to dismiss.
10. Press `G` (or click the "Generate a concept in this style" button) —
    **expect**: the viewer closes and the browser navigates to
    `/concepts?steer=<artistId>` (check the URL bar / `page.url()`) where
    `<artistId>` matches the artist that was on screen when `G` was pressed.
    Confirm the URL is exactly `/concepts?steer=...` — not `/` or `/gallery`.
11. Navigate back to `/`, click a wall image, then press `Escape`.
    - **Expect**: viewer closes, wall reappears with the hairline bar back,
      and the page is scrolled to (approximately) the same position it was
      at before opening the viewer — i.e. it didn't jump to the top.
12. While the viewer is open (step 6/7), try scrolling the page (mouse wheel
    or `PageDown`) — **expect** the wall behind the viewer does not scroll
    (body scroll is locked to the overlay).

## Deep artist (not the first tile)

13. Scroll the wall down to an artist further down the page (not the very
    first tile) and click one of their images.
    - **Expect**: the viewer opens directly on that artist's image (correct
      "artist X of Y" ordinal, correct image), not on the first artist.

## Regression checks

14. Confirm the Artists/Concepts switch and "+ Add artist" / "⋯" drawer
    buttons in the bar still work when the viewer is closed (unaffected by
    this change).
15. Confirm `Esc` on a route other than `/` (e.g. inside Gallery) is
    unaffected — this task only touches the Wall's viewer.
