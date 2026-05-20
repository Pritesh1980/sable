const BUCKET_ORDER = { top: 0, maybe: 1, pass: 2 }

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
