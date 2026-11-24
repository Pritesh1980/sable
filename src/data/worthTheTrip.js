// "Worth the trip?" — a go/skip line for a Radar card (#190), built from the
// same signals as Top picks (showPlan.js) and nothing else: no network.
//
// Your own artists decide it. A saved artist going is reason enough to make a
// day trip; a long trip (over FAR_MILES from Milton Keynes) needs one of your
// top five, two of your artists, or one plus two more picks or stablemates. A
// researched field-guide pick or a stablemate at a studio you follow is worth a
// maybe on its own, and the show on your doorstep is never a skip.
//
// Speculative wildcards never count: they are there to be judged at the show,
// not to justify going (see bigLondon2026Picks.js). And with no line-up and
// nobody marked attending there is nothing to judge on, so it says so rather
// than calling a show a skip on no evidence.
import { buildShowPlan } from './showPlan'

export const FAR_MILES = 100
// One of your top five is worth a long trip on their own.
export const TOP_RANK = 5

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

  // The show on your doorstep costs nothing to look round, so it is never a skip.
  const local = distanceMiles === 0
  if (reasons.length === 0) {
    const none = 'none of your artists or studios on the line-up'
    return local ? verdict('maybe', [none, 'on your doorstep']) : verdict('skip', [none])
  }
  if (local) return verdict('go', [...reasons, 'on your doorstep'])
  if (mine.length === 0) return verdict('maybe', reasons)

  // A long trip needs more than one artist outside your top five, unless the
  // field guide and your studios add at least two more reasons to stop. Rank
  // weighting is the top-five line: below it, one artist alone is a maybe.
  const far = distanceMiles > FAR_MILES
  const best = Math.min(...mine.map((a) => a.rank || Infinity))
  if (!far || mine.length >= 2 || best <= TOP_RANK || picks + stablemates >= 2) return verdict('go', reasons)
  // Before the line-up is out, one artist is all that is known, not all there is.
  const pending = entries.length === 0 ? ['line-up not in yet'] : []
  return verdict('maybe', [...reasons, 'a long way for one artist', ...pending])
}
