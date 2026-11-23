// Longitudinal rank history (#188).
// Records at most one entry per UTC day per artist (later edits that day
// overwrite the day's snapshot) so drag-reordering and swipe-compare never
// flood records, and computes monthly top five, movers and rank-weighted style share.

export const MAX_HISTORY_ENTRIES = 200

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/
const MS_PER_DAY = 86_400_000

export function asHistory(value) {
  return Array.isArray(value) ? value : []
}

// Buckets edits by UTC calendar day (YYYY-MM-DD) from the ISO timestamp.
export function dayKey(iso = '') {
  const key = String(iso || '').slice(0, 10)
  return DAY_RE.test(key) ? key : ''
}

export function monthKey(iso = '') {
  const key = String(iso || '').slice(0, 7)
  return MONTH_RE.test(key) ? key : ''
}

export function formatMonthLabel(ym = '') {
  if (!MONTH_RE.test(String(ym || ''))) return String(ym || '')
  const [year, monthStr] = String(ym).split('-')
  const idx = Number(monthStr) - 1
  const name = MONTHS[idx]
  return name ? `${name} ${year}` : String(ym)
}

function normalizeRank(rank) {
  const n = Number(rank)
  return Number.isFinite(n) && n > 0 ? n : null
}

function normalizeEntry(entry) {
  if (!entry || !dayKey(entry.at)) return null
  const rank = normalizeRank(entry.rank)
  if (rank === null) return null
  return {
    at: String(entry.at),
    rank,
  }
}

function sortHistoryAsc(entries) {
  return entries.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))
}

export function hasRankChange(prevArtist, nextArtist) {
  if (!prevArtist || !nextArtist) return false
  return normalizeRank(prevArtist.rank) !== normalizeRank(nextArtist.rank)
}

export function appendArtistHistory(existing = [], entry, maxEntries = MAX_HISTORY_ENTRIES) {
  const safeExisting = asHistory(existing)
  const normalized = normalizeEntry(entry)
  if (!normalized) return safeExisting

  const targetDay = dayKey(normalized.at)
  const byDay = new Map()
  for (const item of safeExisting) {
    const clean = normalizeEntry(item)
    if (!clean) continue
    const dk = dayKey(clean.at)
    if (dk && dk !== targetDay) byDay.set(dk, clean)
  }
  byDay.set(targetDay, normalized)

  return sortHistoryAsc(Array.from(byDay.values())).slice(-Math.max(1, maxEntries))
}

export function recordArtistHistoryOnEdit(prevArtist, nextArtist, at) {
  if (!hasRankChange(prevArtist, nextArtist) || !dayKey(at)) return nextArtist
  const nextHist = asHistory(nextArtist?.history)
  const base = nextHist.length ? nextHist : asHistory(prevArtist?.history)
  const validBase = base.map(normalizeEntry).filter(Boolean)

  let seededBase = base
  if (validBase.length === 0 && normalizeRank(prevArtist?.rank) !== null) {
    const prevDay = dayKey(prevArtist?.updatedAt)
    const editDay = dayKey(at)
    const seedAt = prevDay && prevDay < editDay
      ? String(prevArtist.updatedAt)
      : new Date(Date.parse(`${editDay}T12:00:00.000Z`) - MS_PER_DAY).toISOString()
    seededBase = appendArtistHistory([], {
      at: seedAt,
      rank: prevArtist.rank,
    })
  }

  return {
    ...nextArtist,
    history: appendArtistHistory(seededBase, {
      at,
      rank: nextArtist.rank,
    }),
  }
}

export function mergeArtistHistories(a = [], b = [], maxEntries = MAX_HISTORY_ENTRIES) {
  const byDay = new Map()
  for (const item of [...asHistory(a), ...asHistory(b)]) {
    const clean = normalizeEntry(item)
    if (!clean) continue
    const dk = dayKey(clean.at)
    const prev = byDay.get(dk)
    if (!prev || String(clean.at).localeCompare(String(prev.at)) >= 0) {
      byDay.set(dk, clean)
    }
  }
  return sortHistoryAsc(Array.from(byDay.values())).slice(-Math.max(1, maxEntries))
}

function collectMonths(artists = [], nowIso) {
  let minMonth = ''
  let maxMonth = ''
  for (const artist of asHistory(artists)) {
    for (const item of asHistory(artist?.history)) {
      const mk = monthKey(item?.at)
      if (!mk) continue
      if (!minMonth || mk < minMonth) minMonth = mk
      if (!maxMonth || mk > maxMonth) maxMonth = mk
    }
  }
  if (!minMonth) return []
  const nowMonth = monthKey(nowIso)
  if (nowMonth && nowMonth > maxMonth) maxMonth = nowMonth
  const [startY, startM] = minMonth.split('-').map(Number)
  const [endY, endM] = maxMonth.split('-').map(Number)
  const out = []
  let y = startY
  let m = startM
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function latestEntryThroughMonth(history = [], month) {
  let latest = null
  for (const raw of asHistory(history)) {
    const clean = normalizeEntry(raw)
    if (!clean) continue
    const mk = monthKey(clean.at)
    if (!mk || mk > month) continue
    if (!latest || String(clean.at).localeCompare(String(latest.at)) > 0) {
      latest = clean
    }
  }
  return latest
}

// Resolves an artist's snapshot for a month: carries forward their latest
// history entry through that month (or backfills from their earliest known
// rank if history started later), falling back to current rank if untouched.
function artistSnapshotForMonth(artist, month) {
  const valid = asHistory(artist?.history).map(normalizeEntry).filter(Boolean)
  if (valid.length > 0) {
    return latestEntryThroughMonth(valid, month) || sortHistoryAsc(valid)[0]
  }
  return normalizeEntry({
    at: `${month}-01T00:00:00.000Z`,
    rank: artist?.rank,
  })
}

export function topNByMonth(artists = [], n = 5, nowIso) {
  const list = asHistory(artists)
  const months = collectMonths(list, nowIso)
  return months.map((month) => {
    const entries = []
    for (const artist of list) {
      const entry = artistSnapshotForMonth(artist, month)
      if (!entry) continue
      entries.push({
        id: artist.id,
        handle: artist.handle,
        name: artist.name || '',
        rank: entry.rank,
        at: entry.at,
      })
    }
    entries.sort((a, b) => (
      a.rank - b.rank
      || String(b.at).localeCompare(String(a.at))
      || String(a.id).localeCompare(String(b.id))
    ))
    return {
      month,
      label: formatMonthLabel(month),
      artists: entries.slice(0, Math.max(0, n)),
    }
  })
}

export function movers(artists = [], { limit = 5 } = {}) {
  const all = []
  for (const artist of asHistory(artists)) {
    const ranked = sortHistoryAsc(asHistory(artist?.history).map(normalizeEntry).filter(Boolean))
    let entries = ranked
    if (entries.length === 1) {
      const currentRank = normalizeRank(artist?.rank)
      const currentDay = dayKey(artist?.updatedAt)
      const histDay = dayKey(entries[0].at)
      if (currentRank !== null && currentRank !== entries[0].rank && (!currentDay || currentDay !== histDay)) {
        entries = [
          entries[0],
          { at: String(artist.updatedAt || entries[0].at), rank: currentRank },
        ]
      }
    }
    if (entries.length < 2) continue
    const first = entries[0]
    const latest = entries[entries.length - 1]
    const delta = first.rank - latest.rank
    if (delta === 0) continue
    all.push({
      id: artist.id,
      handle: artist.handle,
      name: artist.name || '',
      fromRank: first.rank,
      toRank: latest.rank,
      delta,
      fromAt: first.at,
      toAt: latest.at,
    })
  }

  const risers = all
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta || a.toRank - b.toRank || String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, limit))

  const fallers = all
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta || a.toRank - b.toRank || String(a.id).localeCompare(String(b.id)))
    .slice(0, Math.max(0, limit))

  all.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.toRank - b.toRank || String(a.id).localeCompare(String(b.id)))

  return { risers, fallers, all }
}

// Same rank weighting as preferredStyles in src/data/showPlan.js.
export function styleShareByMonth(artists = [], nowIso) {
  const list = asHistory(artists)
  const months = collectMonths(list, nowIso)
  return months.map((month) => {
    const weights = new Map()
    for (const artist of list) {
      const entry = artistSnapshotForMonth(artist, month)
      if (!entry) continue
      const boost = Math.max(0, 31 - (entry.rank || 31)) / 10
      for (const tag of artist?.tags || []) {
        weights.set(tag, (weights.get(tag) || 0) + 1 + boost)
      }
    }
    let totalWeight = 0
    for (const w of weights.values()) totalWeight += w
    const styles = Array.from(weights, ([tag, weight]) => {
      const share = totalWeight > 0 ? Number((weight / totalWeight).toFixed(4)) : 0
      return {
        tag,
        weight: Number(weight.toFixed(4)),
        share,
        percent: Math.round(share * 100),
      }
    }).sort((a, b) => b.weight - a.weight || a.tag.localeCompare(b.tag))
    return {
      month,
      label: formatMonthLabel(month),
      totalWeight: Number(totalWeight.toFixed(4)),
      styles,
    }
  })
}
