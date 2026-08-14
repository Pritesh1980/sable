// Telling a drag's own click apart from a deliberate tap (issue #54).
//
// #51 grew the grid card's drag handle to a 44pt hit area. The handle is not a
// button — its only job is to activate a drag — yet it swallowed every click so
// that finishing a drag would not also open the artist. On a 113x150 card that
// turned a whole corner into a dead zone for the card's primary action.
//
// Both events look identical at the DOM: a `click` on the handle, by which time
// dnd-kit has already cleared `isDragging`. Two things separate them:
//
//   1. A deliberate tap always begins with its own `pointerdown`. The click a
//      drag produces has none after the drag ended — its pointerdown opened the
//      drag, long before. This is the deciding signal, and it is exact.
//   2. Time, as a backstop only. A drop re-renders and persists the whole
//      ranked list, so on a slow device the click can arrive a few hundred
//      milliseconds late; the window is generous precisely so that stutter
//      cannot leak a spurious "open artist" (cross-model review, #54).
//
// Worth knowing what this is really covering: dnd-kit installs its own
// capture-phase click suppressor on the document once a drag activates, and
// tears it down 50ms after the drag ends (@dnd-kit/core core.esm.js:1506,1479).
// So the prompt echo click is already handled upstream — what reaches here is
// the *late* one, after that 50ms has lapsed. Which is why the fast path is not
// what this guard is sized for.
//
// Timing alone was the first cut and was too fragile. A bare latch alone would
// be unsafe in the other direction — a drag that ends without producing a click
// (pointerup outside the handle, a cancelled gesture) would leave it set — but
// pointerdown clears it, and any genuine tap starts with one.
export const DRAG_CLICK_WINDOW_MS = 1500

// All arguments are `performance.now()` readings (monotonic), or null/undefined
// when the thing has not happened. Returns true when this click is the tail of
// the drag that just ended, and so must not reach the card.
export function isDragEcho(endedAt, pointerDownAt, now, windowMs = DRAG_CLICK_WINDOW_MS) {
  if (!Number.isFinite(endedAt) || !Number.isFinite(now)) return false
  // A pointerdown since the drag ended means a fresh interaction began, and this
  // click belongs to that, not to the drag.
  if (Number.isFinite(pointerDownAt) && pointerDownAt > endedAt) return false
  const elapsed = now - endedAt
  // A negative elapsed is a reading we cannot reason about; treat it as "not an
  // echo" so the failure mode is an extra card opening, never a handle that has
  // silently stopped responding.
  return elapsed >= 0 && elapsed < windowMs
}
