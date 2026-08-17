// Whether an element's bounding rect overlaps the viewport at all — the pure
// half of "is this on screen" (issue #64). Kept separate from the DOM read so
// it is testable without a browser: jsdom has no layout, so every
// `getBoundingClientRect()` there returns zeros regardless of truth.
export function intersectsViewport(rect, viewport) {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false
  return rect.right > 0 && rect.left < viewport.width && rect.bottom > 0 && rect.top < viewport.height
}
