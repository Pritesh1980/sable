export const MAX_PHOTO_MARKS = 12
export const MAX_MARK_LABEL_LENGTH = 48
export const MIN_CIRCLE_RADIUS = 0.04
export const MAX_CIRCLE_RADIUS = 0.48
export const DEFAULT_CIRCLE_RADIUS = 0.12
export const MARK_ACCENT = '#d9483b'
export const MARK_HALO = 'rgba(19, 17, 16, 0.88)'

let fallbackCounter = 0

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value))
}

function round4(value) {
  return Math.round(value * 10000) / 10000
}

export function createMarkId() {
  if (globalThis.crypto?.randomUUID) {
    return `m-${globalThis.crypto.randomUUID().slice(0, 8)}`
  }
  fallbackCounter += 1
  return `m-${fallbackCounter}`
}

export function normalizeMarkLabel(label) {
  if (typeof label !== 'string') return ''
  return label.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_MARK_LABEL_LENGTH)
}

/**
 * Normalizes one non-destructive reference markup annotation (`circle` or `arrow`)
 * using normalized `[0..1]` image coordinates so markup scales and tracks crops.
 */
export function normalizePhotoMark(mark, fallbackId) {
  if (!mark || typeof mark !== 'object' || Array.isArray(mark)) return null
  if (mark.kind !== 'circle' && mark.kind !== 'arrow') return null
  if (!Number.isFinite(mark.x) || !Number.isFinite(mark.y)) return null

  const rawId = typeof mark.id === 'string' ? mark.id.trim() : ''
  const id = rawId ? rawId.slice(0, 64) : (fallbackId || createMarkId())
  const x = clamp(mark.x, 0, 1)
  const y = clamp(mark.y, 0, 1)
  const label = normalizeMarkLabel(mark.label)

  if (mark.kind === 'circle') {
    const r = Number.isFinite(mark.r)
      ? clamp(mark.r, MIN_CIRCLE_RADIUS, MAX_CIRCLE_RADIUS)
      : DEFAULT_CIRCLE_RADIUS
    return label ? { id, kind: 'circle', x, y, r, label } : { id, kind: 'circle', x, y, r }
  }

  if (!Number.isFinite(mark.toX) || !Number.isFinite(mark.toY)) return null
  const toX = clamp(mark.toX, 0, 1)
  const toY = clamp(mark.toY, 0, 1)
  return label
    ? { id, kind: 'arrow', x, y, toX, toY, label }
    : { id, kind: 'arrow', x, y, toX, toY }
}

/**
 * Returns a clean array of normalized marks (up to MAX_PHOTO_MARKS), or
 * `undefined` when empty so unannotated reference refs keep their compact shape.
 */
export function normalizePhotoMarkup(marks) {
  if (!Array.isArray(marks)) return undefined
  const seenIds = new Set()
  const out = []
  for (let i = 0; i < marks.length; i += 1) {
    const normalized = normalizePhotoMark(marks[i], `mark-${i + 1}`)
    if (!normalized) continue
    let uniqueId = normalized.id
    if (seenIds.has(uniqueId)) {
      uniqueId = `${uniqueId}-${i + 1}`.slice(0, 64)
    }
    seenIds.add(uniqueId)
    out.push(uniqueId === normalized.id ? normalized : { ...normalized, id: uniqueId })
    if (out.length >= MAX_PHOTO_MARKS) break
  }
  return out.length > 0 ? out : undefined
}

/**
 * Builds a circle or arrow from normalized start/end pointer positions.
 * Short taps (< 0.025 normalized distance) produce a clearly visible default mark.
 */
export function buildMarkFromPoints(kind, start, end, { id, label } = {}) {
  const sx = clamp(Number.isFinite(start?.x) ? start.x : 0.5, 0, 1)
  const sy = clamp(Number.isFinite(start?.y) ? start.y : 0.5, 0, 1)
  const ex = clamp(Number.isFinite(end?.x) ? end.x : sx, 0, 1)
  const ey = clamp(Number.isFinite(end?.y) ? end.y : sy, 0, 1)
  const dist = Math.hypot(ex - sx, ey - sy)
  const markId = id || createMarkId()
  const cleanLabel = normalizeMarkLabel(label)

  if (kind === 'arrow') {
    if (dist < 0.025) {
      const dx = sx >= 0.2 ? -0.14 : 0.14
      const dy = sy >= 0.2 ? -0.14 : 0.14
      return normalizePhotoMark({
        id: markId,
        kind: 'arrow',
        x: round4(clamp(sx + dx, 0, 1)),
        y: round4(clamp(sy + dy, 0, 1)),
        toX: round4(sx),
        toY: round4(sy),
        label: cleanLabel,
      })
    }
    return normalizePhotoMark({
      id: markId,
      kind: 'arrow',
      x: round4(sx),
      y: round4(sy),
      toX: round4(ex),
      toY: round4(ey),
      label: cleanLabel,
    })
  }

  const r = dist < 0.025
    ? DEFAULT_CIRCLE_RADIUS
    : clamp(dist, MIN_CIRCLE_RADIUS, MAX_CIRCLE_RADIUS)
  return normalizePhotoMark({
    id: markId,
    kind: 'circle',
    x: round4(sx),
    y: round4(sy),
    r: round4(r),
    label: cleanLabel,
  })
}

export function createDefaultMark(kind, existingMarks = []) {
  const step = ((existingMarks?.length || 0) % 5) - 2
  const cx = clamp(0.5 + step * 0.06, 0.15, 0.85)
  const cy = clamp(0.5 + step * 0.06, 0.15, 0.85)
  if (kind === 'arrow') {
    return buildMarkFromPoints(
      'arrow',
      { x: cx - 0.12, y: cy - 0.12 },
      { x: cx + 0.06, y: cy + 0.06 },
    )
  }
  return normalizePhotoMark({
    id: createMarkId(),
    kind: 'circle',
    x: round4(cx),
    y: round4(cy),
    r: DEFAULT_CIRCLE_RADIUS,
  })
}

export function createMarkupHistory(initialMarks) {
  return {
    past: [],
    present: normalizePhotoMarkup(initialMarks) || [],
    future: [],
  }
}

export function pushMarkupHistory(history, nextMarks) {
  const next = normalizePhotoMarkup(nextMarks) || []
  if (JSON.stringify(next) === JSON.stringify(history.present)) return history
  return {
    past: [...history.past.slice(-49), history.present],
    present: next,
    future: [],
  }
}

export function undoMarkupHistory(history) {
  if (!history.past.length) return history
  const previous = history.past[history.past.length - 1]
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redoMarkupHistory(history) {
  if (!history.future.length) return history
  const [next, ...rest] = history.future
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  }
}

function segmentIntersectsRect(x1, y1, x2, y2, rect) {
  const minX = rect.x
  const maxX = rect.x + rect.width
  const minY = rect.y
  const maxY = rect.y + rect.height
  const dx = x2 - x1
  const dy = y2 - y1
  let t0 = 0
  let t1 = 1
  const checks = [
    [-dx, x1 - minX],
    [dx, maxX - x1],
    [-dy, y1 - minY],
    [dy, maxY - y1],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
  }
  return t0 <= t1
}

function pointInRect(px, py, rect, margin = 0) {
  return px >= rect.x - margin &&
    px <= rect.x + rect.width + margin &&
    py >= rect.y - margin &&
    py <= rect.y + rect.height + margin
}

/**
 * Projects a normalized mark through an image's export crop into a target slot rect.
 */
export function projectPhotoMarkToSlot(mark, { iw, ih, sx, sy, sw, sh, slot }) {
  const safeW = sw > 0 ? sw : iw || slot.width || 1
  const safeH = sh > 0 ? sh : ih || slot.height || 1
  const safeIw = iw || slot.width || 1
  const safeIh = ih || slot.height || 1
  const toSlotX = (u) => slot.x + ((u * safeIw - sx) / safeW) * slot.width
  const toSlotY = (v) => slot.y + ((v * safeIh - sy) / safeH) * slot.height

  if (mark.kind === 'circle') {
    const cx = toSlotX(mark.x)
    const cy = toSlotY(mark.y)
    const r = mark.r * Math.min(safeIw, safeIh) * (slot.width / safeW)
    const nearX = clamp(cx, slot.x, slot.x + slot.width)
    const nearY = clamp(cy, slot.y, slot.y + slot.height)
    const visible = Math.hypot(cx - nearX, cy - nearY) <= r + 2
    return { kind: 'circle', id: mark.id, cx, cy, r, label: mark.label, anchorX: cx, anchorY: cy + r, visible }
  }

  const x1 = toSlotX(mark.x)
  const y1 = toSlotY(mark.y)
  const x2 = toSlotX(mark.toX)
  const y2 = toSlotY(mark.toY)
  const padded = { x: slot.x - 4, y: slot.y - 4, width: slot.width + 8, height: slot.height + 8 }
  const visible = segmentIntersectsRect(x1, y1, x2, y2, padded)
  const tailVisible = pointInRect(x1, y1, slot, 4)
  const anchorX = tailVisible ? x1 : (x1 + x2) / 2
  const anchorY = tailVisible ? y1 : (y1 + y2) / 2
  return { kind: 'arrow', id: mark.id, x1, y1, x2, y2, label: mark.label, anchorX, anchorY, visible }
}

function drawArrowPath(ctx, x1, y1, x2, y2, headLen) {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  const len = Math.hypot(x2 - x1, y2 - y1)
  if (len >= 2) {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const spread = Math.PI / 6
    ctx.moveTo(x2 - headLen * Math.cos(angle - spread), y2 - headLen * Math.sin(angle - spread))
    ctx.lineTo(x2, y2)
    ctx.lineTo(x2 - headLen * Math.cos(angle + spread), y2 - headLen * Math.sin(angle + spread))
  }
  ctx.stroke()
}

function drawLabelBadge(ctx, text, anchorX, anchorY, slot, fontFamily, slotWidth) {
  if (!text) return
  const fontSize = Math.max(13, Math.min(18, Math.round(slotWidth * 0.042)))
  const padX = 8
  const padY = 4
  ctx.font = `500 ${fontSize}px ${fontFamily}`
  const textWidth = ctx.measureText ? ctx.measureText(text).width : text.length * fontSize * 0.55
  const maxWidth = Math.max(40, slot.width - 12)
  const boxWidth = Math.min(maxWidth, textWidth + padX * 2)
  const boxHeight = fontSize + padY * 2
  const minX = slot.x + 6
  const maxX = Math.max(minX, slot.x + slot.width - boxWidth - 6)
  const minY = slot.y + 6
  const maxY = Math.max(minY, slot.y + slot.height - boxHeight - 6)
  const boxX = clamp(anchorX - boxWidth / 2, minX, maxX)
  const boxY = clamp(anchorY + 6, minY, maxY)

  ctx.fillStyle = MARK_HALO
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight)
  ctx.strokeStyle = MARK_ACCENT
  ctx.lineWidth = 1.5
  ctx.strokeRect(boxX, boxY, boxWidth, boxHeight)

  ctx.textBaseline = 'top'
  ctx.fillStyle = '#efe9dc'
  ctx.fillText(text, boxX + padX, boxY + padY, Math.max(12, boxWidth - padX * 2))
}

/**
 * Draws projected reference annotations inside a clipped photo slot on a Brief card canvas.
 */
export function drawPhotoMarkupOnSlot(ctx, marks, { iw, ih, sx, sy, sw, sh, slot, fonts }) {
  const normalized = normalizePhotoMarkup(marks)
  if (!normalized?.length) return

  const strokeW = Math.max(2.5, Math.min(5, slot.width * 0.009))
  const headLen = Math.max(10, Math.min(20, slot.width * 0.045))
  const fontFamily = fonts?.mono || fonts?.body || 'sans-serif'

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  for (const mark of normalized) {
    const projected = projectPhotoMarkToSlot(mark, { iw, ih, sx, sy, sw, sh, slot })
    if (!projected.visible) continue

    if (projected.kind === 'circle' && typeof ctx.arc === 'function') {
      for (const [color, width] of [[MARK_HALO, strokeW + 3], [MARK_ACCENT, strokeW]]) {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.beginPath()
        ctx.arc(projected.cx, projected.cy, projected.r, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else if (projected.kind === 'arrow') {
      for (const [color, width] of [[MARK_HALO, strokeW + 3], [MARK_ACCENT, strokeW]]) {
        ctx.strokeStyle = color
        ctx.lineWidth = width
        drawArrowPath(ctx, projected.x1, projected.y1, projected.x2, projected.y2, headLen)
      }
    }

    if (projected.label) {
      drawLabelBadge(ctx, projected.label, projected.anchorX, projected.anchorY, slot, fontFamily, slot.width)
    }
  }

  ctx.restore()
}
