const TAP_SLOP = 10
const SWIPE_MIN = 40
// The dominant axis must beat the other by this factor, so a sloppy diagonal
// drag doesn't flip between photos and artists at random.
const DOMINANCE = 1.5

// Classifies finger travel (end - start) as 'tap', a swipe direction
// ('left' | 'right' | 'up' | 'down', named for where the finger went), or null.
export function classifyGesture(dx, dy) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (ax < TAP_SLOP && ay < TAP_SLOP) return 'tap'
  if (Math.max(ax, ay) < SWIPE_MIN) return null
  if (ax >= ay * DOMINANCE) return dx < 0 ? 'left' : 'right'
  if (ay >= ax * DOMINANCE) return dy < 0 ? 'up' : 'down'
  return null
}
