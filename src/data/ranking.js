const BUCKET_ORDER = { top: 0, maybe: 1, pass: 2 }

// Sort comparator that tolerates missing / non-numeric ranks (they sort last).
// JS Array.sort is stable, so equal/absent ranks keep their current order.
function byRank(a, b) {
  const ra = Number.isFinite(a.rank) ? a.rank : Infinity
  const rb = Number.isFinite(b.rank) ? b.rank : Infinity
  return ra - rb
}

// Move one artist to a target 0-based position in rank order, recompute ranks
// 1..N, and return artists in their ORIGINAL array order (only `rank` changes)
// so array-order consumers like the Wall masonry (buildWallItems) stay stable.
// Also self-heals duplicate/missing ranks into a contiguous 1..N.
function rerankWithMove(artists, id, targetIndex) {
  const order = artists.slice().sort(byRank)
  const from = order.findIndex((a) => a.id === id)
  if (from === -1) return artists
  const [moved] = order.splice(from, 1)
  order.splice(Math.max(0, Math.min(order.length, targetIndex)), 0, moved)
  const rankById = new Map(order.map((a, i) => [a.id, i + 1]))
  return artists.map((a) => ({ ...a, rank: rankById.get(a.id) }))
}

// Move to an explicit 1-based rank (clamped 1..N).
export const moveToRank = (artists, id, rank) => rerankWithMove(artists, id, rank - 1)

// Move by a relative offset in rank order (+1 down, -1 up); clamped at the ends.
export function moveByDelta(artists, id, delta) {
  const order = artists.slice().sort(byRank)
  const from = order.findIndex((a) => a.id === id)
  if (from === -1) return artists
  return rerankWithMove(artists, id, from + delta)
}

export const moveUp = (artists, id) => moveByDelta(artists, id, -1)
export const moveDown = (artists, id) => moveByDelta(artists, id, 1)
export const moveToTop = (artists, id) => moveToRank(artists, id, 1)

// Pulling in lands at the bottom of the top 5; dropping out lands just below it.
export const moveIntoTop5 = (artists, id) => moveToRank(artists, id, 5)
export const moveOutOfTop5 = (artists, id) => moveToRank(artists, id, 6)

export function computeSwipeRanking(decisions, artists) {
  const decisionMap = Object.fromEntries(decisions.map((d) => [d.artistId, d.bucket]))

  const ranked = artists
    .filter((a) => decisionMap[a.id] !== undefined)
    .sort((a, b) => {
      const bucketDiff = BUCKET_ORDER[decisionMap[a.id]] - BUCKET_ORDER[decisionMap[b.id]]
      if (bucketDiff !== 0) return bucketDiff
      return a.rank - b.rank
    })

  const unranked = artists
    .filter((a) => decisionMap[a.id] === undefined)
    .sort((a, b) => a.rank - b.rank)

  return [...ranked, ...unranked].map((a, i) => ({ ...a, rank: i + 1 }))
}
