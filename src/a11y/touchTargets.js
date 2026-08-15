// Touch-target auditing (issue #73).
//
// #51 grew the hover-revealed controls to 44pt and `src/test/a11yAffordances.spec.js`
// guards them. That guard is a source scan, and a source scan cannot do this job in
// general: it reads `w-N`/`h-N` classes, so a button sized by padding looks
// unmeasurable, and a button whose content is `{label}` is indistinguishable from
// one containing a sentence. The Artists view switcher was 24x28 for months and no
// test could have said so.
//
// What can say so is the browser. These helpers are the judgement half of
// `scripts/auditTouchTargets.mjs`, kept pure so they are testable without one.

// Apple's Human Interface Guidelines minimum, and the number #51 used.
export const MIN_TARGET_PX = 44

// How much surrounding text makes something "prose" rather than a call to
// action wearing a <p>. A sentence clears this; "Get started →" does not.
const PROSE_CHARS = 20

// Controls legitimately under 44pt because they are a run of text inside flowing
// prose rather than a discrete control. Ancestry alone is not enough — a <p>
// wrapped around a single link is a button in disguise, and exempting it hid the
// control completely (codex review).
export function isInlineTextLink(el) {
  return el.tag === 'A' && (el.proseAround || 0) >= PROSE_CHARS
}

// A control counts only if the user can actually hit it: rendered, on screen,
// not a zero-box wrapper, and able to receive the tap. A positive rectangle is
// not the same as an actionable target (codex review).
export function isHittable(el) {
  if (!el) return false
  if (el.width <= 0 || el.height <= 0) return false
  if (el.visibility === 'hidden' || el.display === 'none') return false
  if (el.pointerEvents === 'none') return false
  if (el.disabled) return false
  return true
}

// Undersized on either axis — 44x20 fails as surely as 20x44.
export function isUndersized(el, min = MIN_TARGET_PX) {
  return el.width < min || el.height < min
}

export function shortfall(el, min = MIN_TARGET_PX) {
  return {
    width: Math.max(0, min - el.width),
    height: Math.max(0, min - el.height),
  }
}

// → { checked, offenders, byRoute } with offenders sorted worst-first, so a run
// reads as a worklist rather than a wall.
export function summarise(measurements, min = MIN_TARGET_PX) {
  const hittable = measurements.filter(isHittable)
  const offenders = hittable
    .filter((el) => !isInlineTextLink(el) && isUndersized(el, min))
    .map((el) => ({ ...el, missing: shortfall(el, min) }))
    .sort((a, b) => {
      // Worst first: the largest single-axis shortfall is what hurts a thumb.
      const worst = (x) => Math.max(x.missing.width, x.missing.height)
      return worst(b) - worst(a)
    })

  const byRoute = {}
  for (const el of offenders) {
    byRoute[el.route] = (byRoute[el.route] || 0) + 1
  }

  // The nav, its font/theme/sign-out buttons and the wordmark render on every
  // route, so the raw list reports one control eight times and the debt looks
  // far bigger than it is (codex review). Collapse by identity — same name, same
  // element, same measured size — and keep the routes it showed up on.
  const seen = new Map()
  for (const el of offenders) {
    const key = `${el.tag}|${el.label}|${Math.round(el.width)}x${Math.round(el.height)}`
    if (!seen.has(key)) seen.set(key, { ...el, routes: [], sightings: 0 })
    const entry = seen.get(key)
    entry.sightings += 1
    // Distinct routes: a status pill repeated down one page is three sightings
    // on one route, not three routes.
    if (!entry.routes.includes(el.route)) entry.routes.push(el.route)
  }
  const uniqueOffenders = [...seen.values()]

  return { checked: hittable.length, offenders, uniqueOffenders, byRoute }
}

export function formatOffender(el) {
  const w = Math.round(el.width)
  const h = Math.round(el.height)
  const label = (el.label || '').replace(/\s+/g, ' ').trim().slice(0, 40) || '(no accessible name)'
  return `${el.route}  ${w}x${h}  <${el.tag.toLowerCase()}> ${label}`
}
