// Pure geometry for the Top 5 coverflow. Given a card count and the active
// index, return per-card transforms the renderer (three.js, or a CSS fallback)
// applies verbatim. No WebGL here so the maths stays unit-testable.
//
// Units are arbitrary "card widths"; the renderer scales them to the viewport.

const DEFAULTS = {
  centerGap: 0.62, // x offset of the first neighbour either side of centre
  sideGap: 0.42, // additional x per extra step outward (tighter than centre)
  depth: 0.6, // how far back each step recedes (z gets more negative)
  angle: 50, // degrees each side card turns inward, toward the viewer
  scaleStep: 0.16, // scale lost per step from centre
  opacityStep: 0.28, // opacity lost per step from centre
  minScale: 0.3, // visible floor — far cards never vanish entirely
  minOpacity: 0, // far cards may fade fully out
}

const clampIndex = (index, count) => Math.max(0, Math.min(count - 1, index))

export function coverflowLayout(count, activeIndex, options = {}) {
  if (count <= 0) return []
  const cfg = { ...DEFAULTS, ...options }
  const active = clampIndex(activeIndex, count)

  return Array.from({ length: count }, (_, i) => {
    const offset = i - active
    const dist = Math.abs(offset)
    const sign = Math.sign(offset)

    if (dist === 0) {
      return { x: 0, z: 0, rotationY: 0, scale: 1, opacity: 1 }
    }

    const x = sign * (cfg.centerGap + (dist - 1) * cfg.sideGap)
    const z = -dist * cfg.depth
    // Right-side cards (sign > 0) turn left (negative rotationY) to face centre.
    const rotationY = -sign * cfg.angle
    const scale = Math.max(cfg.minScale, 1 - dist * cfg.scaleStep)
    const opacity = Math.max(cfg.minOpacity, 1 - dist * cfg.opacityStep)

    return { x, z, rotationY, scale, opacity }
  })
}
