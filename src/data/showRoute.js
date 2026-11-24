// Top picks in walking order over a show's floor plan (#190, Phase 2 of
// docs/plans/convention-route-planner.md).
//
// Booth numbers serpentine across the hall, so the walk uses real positions:
// from the entrance, always on to the nearest pick not yet visited. That is a
// good route, not a provably shortest one, and the copy never claims more.
//
// The stops are the picks you set out to see: Must see and the field guide.
// Worth a look and the wildcards are picked up on the way, under whichever
// stop they are closest to, when they are within NEARBY_RADIUS of it; the rest
// stay in the ranked list. A pick whose booth is not on the plan goes under
// "Elsewhere in the hall", never at a guessed position.
import { parseBooth } from './showPlan'

// In plan widths, after the aspect correction: about three stands.
export const NEARBY_RADIUS = 0.06

const boothOf = (pick) => parseBooth(pick.entry.note)?.raw || null

function distance(a, b, aspect) {
  return Math.hypot(a[0] - b[0], (a[1] - b[1]) * aspect)
}

export function buildShowRoute(plan, floorplan, { radius = NEARBY_RADIUS } = {}) {
  if (!floorplan) return { stops: [], elsewhere: [] }
  const { booths, entrance, aspect = 1 } = floorplan
  const seen = new Set()
  const keyOf = (pick) => pick.entry.handle || pick.entry.label
  const fresh = (pick) => {
    const key = keyOf(pick)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }

  const placed = []
  const elsewhere = []
  for (const pick of [...(plan.mustSee || []), ...(plan.fieldGuide || [])].filter(fresh)) {
    const booth = boothOf(pick)
    const at = booth ? booths[booth] : null
    if (at) placed.push({ pick, booth, at })
    else elsewhere.push({ pick, booth })
  }

  // Nearest-neighbour walk from the doors.
  const stops = []
  let here = entrance
  const left = [...placed]
  while (left.length) {
    let best = 0
    for (let i = 1; i < left.length; i++) {
      if (distance(here, left[i].at, aspect) < distance(here, left[best].at, aspect)) best = i
    }
    const [next] = left.splice(best, 1)
    stops.push({ ...next, nearby: [] })
    here = next.at
  }

  // Each pickup goes to the one stop it is closest to, if that is close enough.
  for (const pick of [...(plan.suggested || []), ...(plan.wildcards || [])].filter(fresh)) {
    const booth = boothOf(pick)
    const at = booth ? booths[booth] : null
    if (!at || stops.length === 0) continue
    let best = null
    for (const stop of stops) {
      const d = distance(stop.at, at, aspect)
      if (d <= radius && (!best || d < best.d)) best = { stop, d }
    }
    if (best) best.stop.nearby.push({ pick, booth, d: best.d })
  }

  return {
    stops: stops.map(({ pick, booth, nearby }) => ({
      pick,
      booth,
      nearby: nearby.sort((a, b) => a.d - b.d).map(({ pick: p, booth: b }) => ({ pick: p, booth: b })),
    })),
    elsewhere,
  }
}

function stopLine({ pick, booth }) {
  const { name, handle, label } = pick.entry
  const who = name ? `${name}${handle ? ` (@${handle})` : ''}` : label || `@${handle}`
  return `${booth ? `Booth ${booth}` : 'No booth listed'} · ${who}`
}

// Plain text for Notes on the day.
export function formatRoute(route, { title = '' } = {}) {
  const lines = [`${title ? `${title}: ` : ''}route`, 'Ordered across the floor from the entrance.', '']
  route.stops.forEach((stop, i) => {
    lines.push(`${i + 1}. ${stopLine(stop)}`)
    for (const n of stop.nearby) lines.push(`   Close by: ${stopLine(n)}`)
  })
  if (route.elsewhere.length) {
    lines.push('', 'Elsewhere in the hall (not on the floor plan):')
    for (const e of route.elsewhere) lines.push(`- ${stopLine(e)}`)
  }
  return lines.join('\n')
}
