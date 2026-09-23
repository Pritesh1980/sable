// Gesture maths for the live try-on overlay. A transform is
// { x, y, scale, rotation } — centre position in px, rotation in degrees.

export const MIN_SCALE = 0.1
export const MAX_SCALE = 8
// ISO/IEC 7810 ID-1: every bank card is 85.60 × 53.98 mm.
export const CARD_WIDTH_MM = 85.6
export const CARD_HEIGHT_MM = 53.98

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
const angleDeg = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

export function dragTransform(startPoint, currentPoint, base) {
  return {
    ...base,
    x: base.x + currentPoint.x - startPoint.x,
    y: base.y + currentPoint.y - startPoint.y,
  }
}

// Two fingers: spread scales and twist rotates *about the point between the
// fingers* (as in Photos), and that point carries the design with it. Always
// measured from where the gesture started, so nothing drifts from rounding.
export function pinchTransform(start, current, base) {
  const startSpread = distance(start.a, start.b) || 1
  const startMid = midpoint(start.a, start.b)
  const currentMid = midpoint(current.a, current.b)
  const scale = clamp(base.scale * (distance(current.a, current.b) / startSpread), MIN_SCALE, MAX_SCALE)
  const k = scale / base.scale
  const turn = angleDeg(current.a, current.b) - angleDeg(start.a, start.b)
  const rad = (turn * Math.PI) / 180
  const vx = base.x - startMid.x
  const vy = base.y - startMid.y
  return {
    x: currentMid.x + k * (vx * Math.cos(rad) - vy * Math.sin(rad)),
    y: currentMid.y + k * (vx * Math.sin(rad) + vy * Math.cos(rad)),
    scale,
    rotation: base.rotation + turn,
  }
}

export function pxPerMmFromCard(cardWidthPx) {
  return cardWidthPx / CARD_WIDTH_MM
}

export function formatDesignWidth(designWidthPx, pxPerMm) {
  if (!pxPerMm) return ''
  const cm = Math.round((designWidthPx / pxPerMm / 10) * 2) / 2
  return `≈ ${cm} cm wide`
}
