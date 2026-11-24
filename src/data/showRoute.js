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
// follow the route as "Also on your list". A pick whose booth is not on the
// plan goes under "Elsewhere in the hall", never at a guessed position.
import { parseBooth } from './showPlan'

// In plan widths, after the aspect correction: about three stands.
export const NEARBY_RADIUS = 0.06

const boothOf = (pick) => parseBooth(pick.entry.note)?.raw || null

function distance(a, b, aspect) {
  return Math.hypot(a[0] - b[0], (a[1] - b[1]) * aspect)
}

// One artist, one place in the route. A line-up merged from two sources can
// hold the same person twice (one row with a handle, one without), so a pick
// is a repeat if either its handle or its name has been seen.
function dedupe() {
  const seen = new Set()
  return (pick) => {
    const keys = [pick.entry.handle, pick.entry.label?.toLowerCase()].filter(Boolean)
    if (keys.some((k) => seen.has(k))) return false
    keys.forEach((k) => seen.add(k))
    return true
  }
}

export function buildShowRoute(plan, floorplan, { radius = NEARBY_RADIUS } = {}) {
  if (!floorplan) return { stops: [], elsewhere: [], others: [] }
  const { booths, entrance, aspect = 1 } = floorplan
  const fresh = dedupe()
  const place = (pick) => {
    const booth = boothOf(pick)
    return { pick, booth, at: booth ? booths[booth] || null : null }
  }

  // With no Must see or field-guide pick at all (a show where only stablemates
  // turn up), the rest of Top picks become the stops instead of an empty route.
  const priority = [...(plan.mustSee || []), ...(plan.fieldGuide || [])].filter(fresh)
  const secondary = [...(plan.suggested || []), ...(plan.wildcards || [])].filter(fresh)
  const [lead, extra] = priority.length ? [priority, secondary] : [secondary, []]

  const placed = []
  const elsewhere = []
  for (const p of lead.map(place)) {
    if (p.at) placed.push(p)
    else elsewhere.push({ pick: p.pick, booth: p.booth })
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
  // The rest are still listed, after the route, so a copied route for the day
  // has everything Top picks has.
  const others = []
  for (const p of extra.map(place)) {
    let best = null
    for (const stop of p.at ? stops : []) {
      const d = distance(stop.at, p.at, aspect)
      if (d <= radius && (!best || d < best.d)) best = { stop, d }
    }
    if (best) best.stop.nearby.push({ pick: p.pick, booth: p.booth, d: best.d })
    else others.push({ pick: p.pick, booth: p.booth })
  }

  return {
    stops: stops.map(({ pick, booth, nearby }) => ({
      pick,
      booth,
      nearby: nearby.sort((a, b) => a.d - b.d).map(({ pick: p, booth: b }) => ({ pick: p, booth: b })),
    })),
    elsewhere,
    others,
  }
}

// Why a pickup is worth the detour, in a word or two.
export function pickupReason(pick) {
  if (pick.kind === 'wildcard') return 'wildcard'
  if (pick.kind === 'suggested') return 'studio you follow'
  return ''
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
    for (const n of stop.nearby) lines.push(`   Close by: ${[stopLine(n), pickupReason(n.pick)].filter(Boolean).join(' · ')}`)
  })
  if (route.elsewhere.length) {
    lines.push('', 'Elsewhere in the hall (not on the floor plan):')
    for (const e of route.elsewhere) lines.push(`- ${stopLine(e)}`)
  }
  if (route.others?.length) {
    lines.push('', 'Also on your list:')
    for (const o of route.others) lines.push(`- ${[stopLine(o), pickupReason(o.pick)].filter(Boolean).join(' · ')}`)
  }
  return lines.join('\n')
}
