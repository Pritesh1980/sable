// "Worth the trip?" — a go/skip line for a Radar card (#190), built from the
// same signals as Top picks (showPlan.js) and nothing else: no network.
//
// Your own artists decide it. A saved artist going is reason enough to make a
// day trip; a long trip (over FAR_MILES from Milton Keynes) needs your #1, or
// two of your artists, before it is called worth it. A researched field-guide
// pick or a stablemate at a studio you follow is worth a maybe on its own, and
// anything at all is worth the drive to the show on your doorstep.
//
// Speculative wildcards never count: they are there to be judged at the show,
// not to justify going (see bigLondon2026Picks.js). And with no line-up and
// nobody marked attending there is nothing to judge on, so it says so rather
// than calling a show a skip on no evidence.
import { buildShowPlan } from './showPlan'

export const FAR_MILES = 100

// Rank-weighted like Top picks: your #1 counts 2, your #30 a shade over 1.
const weightOf = (artist) => 1 + Math.max(0, 31 - (artist.rank || 31)) / 30

const LABELS = {
  go: 'Worth the trip',
  maybe: 'Maybe',
  skip: 'Skip it',
  unknown: 'Too early to say',
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

function yoursReason(yours) {
  const ranks = yours.map((a) => a.rank).filter(Boolean)
  const best = ranks.length ? Math.min(...ranks) : null
  const count = `${yours.length} of your artists`
  if (!best) return count
  return yours.length === 1 ? `${count}, #${best}` : `${count}, best #${best}`
}

export function worthTheTrip({
  distanceMiles = null,
  artists = [],
  studios = [],
  attendingIds = [],
  entries = [],
  curated = {},
} = {}) {
  const plan = buildShowPlan(entries, { artists, studios, attendingIds, curated })

  // Your artists at the show: marked attending, or found on the line-up.
  const yours = new Map()
  for (const a of artists) if (attendingIds.includes(a.id)) yours.set(a.id, a)
  for (const p of plan.mustSee) if (p.artist) yours.set(p.artist.id, p.artist)
  const mine = [...yours.values()]
  const picks = plan.fieldGuide.length
  const stablemates = plan.suggested.length

  const verdict = (v, reasons) => ({ verdict: v, label: LABELS[v], reasons })

  if (entries.length === 0 && mine.length === 0) {
    return verdict('unknown', ['no line-up or attending artists yet'])
  }

  const reasons = []
  if (mine.length) reasons.push(yoursReason(mine))
  if (picks) reasons.push(plural(picks, 'field-guide pick', 'field-guide picks'))
  if (stablemates) reasons.push(stablemates === 1 ? '1 at a studio you follow' : `${stablemates} at studios you follow`)

  if (reasons.length === 0) return verdict('skip', ['none of your artists or studios on the line-up'])
  if (distanceMiles === 0) return verdict('go', [...reasons, 'on your doorstep'])
  if (mine.length === 0) return verdict('maybe', reasons)

  const far = distanceMiles > FAR_MILES
  const weight = mine.reduce((sum, a) => sum + weightOf(a), 0)
  if (!far || weight >= 2) return verdict('go', reasons)
  return verdict('maybe', [...reasons, `a long way for ${plural(mine.length, 'artist', 'artists')}`])
}
