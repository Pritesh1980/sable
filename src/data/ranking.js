const BUCKET_ORDER = { top: 0, maybe: 1, pass: 2 }

// Move one artist to a target position in rank order, then re-rank 1..N.
function rerankWithMove(artists, id, targetIndex) {
  const all = artists.slice().sort((a, b) => a.rank - b.rank)
  const from = all.findIndex((a) => a.id === id)
  if (from === -1) return artists
  const [moved] = all.splice(from, 1)
  all.splice(Math.max(0, Math.min(all.length, targetIndex)), 0, moved)
  return all.map((a, i) => ({ ...a, rank: i + 1 }))
}

// Pulling in lands at the bottom of the top 5; dropping out lands just below it.
export const moveIntoTop5 = (artists, id) => rerankWithMove(artists, id, 4)
export const moveOutOfTop5 = (artists, id) => rerankWithMove(artists, id, 5)

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
