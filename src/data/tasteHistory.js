// Longitudinal rank and status history (#188).
// Records at most one entry per day per artist (later edits that day overwrite
// the day's snapshot) so drag-reordering and swipe-compare never flood records,
// and computes monthly Top 5, movers, rank-weighted style share and status durations.
import { ARTIST_STATUSES, normalizeArtistStatus } from './planning'

export const MAX_HISTORY_ENTRIES = 200

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/
const MS_PER_DAY = 86_400_000

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
  return {
    at: String(entry.at),
    rank: normalizeRank(entry.rank),
    status: normalizeArtistStatus(entry.status),
  }
}

function sortHistoryAsc(entries) {
  return entries.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)))
}

export function hasRankOrStatusChange(prevArtist, nextArtist) {
  if (!prevArtist || !nextArtist) return false
  const prevRank = normalizeRank(prevArtist.rank)
  const nextRank = normalizeRank(nextArtist.rank)
  if (prevRank !== nextRank) return true
  return normalizeArtistStatus(prevArtist.status) !== normalizeArtistStatus(nextArtist.status)
}

export function appendArtistHistory(existing = [], entry, maxEntries = MAX_HISTORY_ENTRIES) {
  const normalized = normalizeEntry(entry)
  if (!normalized) return Array.isArray(existing) ? existing : []

  const targetDay = dayKey(normalized.at)
  const byDay = new Map()
  for (const item of existing || []) {
    const clean = normalizeEntry(item)
    if (!clean) continue
    const dk = dayKey(clean.at)
    if (dk && dk !== targetDay) byDay.set(dk, clean)
  }
  byDay.set(targetDay, normalized)

  return sortHistoryAsc(Array.from(byDay.values())).slice(-Math.max(1, maxEntries))
}

export function recordArtistHistoryOnEdit(prevArtist, nextArtist, at) {
  if (!hasRankOrStatusChange(prevArtist, nextArtist) || !dayKey(at)) return nextArtist
  const base = Array.isArray(nextArtist.history)
    ? nextArtist.history
    : (Array.isArray(prevArtist.history) ? prevArtist.history : [])
  return {
    ...nextArtist,
    history: appendArtistHistory(base, {
      at,
      rank: nextArtist.rank,
      status: nextArtist.status,
    }),
  }
}

export function mergeArtistHistories(a = [], b = [], maxEntries = MAX_HISTORY_ENTRIES) {
  const byDay = new Map()
  for (const item of [...(a || []), ...(b || [])]) {
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

function collectMonths(artists = []) {
  const months = new Set()
  for (const artist of artists) {
    for (const item of artist?.history || []) {
      const mk = monthKey(item?.at)
      if (mk) months.add(mk)
    }
  }
  return Array.from(months).sort()
}

function latestEntryThroughMonth(history = [], month) {
  let latest = null
  for (const raw of history) {
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

export function topNByMonth(artists = [], n = 5) {
  const months = collectMonths(artists)
  return months.map((month) => {
    const entries = []
    for (const artist of artists) {
      const entry = latestEntryThroughMonth(artist?.history, month)
      if (!entry || entry.rank === null || entry.status === 'pass') continue
      entries.push({
        id: artist.id,
        handle: artist.handle,
        name: artist.name || '',
        rank: entry.rank,
        status: entry.status,
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
  for (const artist of artists) {
    const ranked = sortHistoryAsc(
      (artist?.history || []).map(normalizeEntry).filter((e) => e && e.rank !== null),
    )
    let entries = ranked
    if (entries.length === 1) {
      const currentRank = normalizeRank(artist?.rank)
      const currentDay = dayKey(artist?.updatedAt)
      const histDay = dayKey(entries[0].at)
      if (currentRank !== null && currentRank !== entries[0].rank && (!currentDay || currentDay !== histDay)) {
        entries = [
          entries[0],
          { at: String(artist.updatedAt || entries[0].at), rank: currentRank, status: normalizeArtistStatus(artist.status) },
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
export function styleShareByMonth(artists = []) {
  const months = collectMonths(artists)
  return months.map((month) => {
    const weights = new Map()
    for (const artist of artists) {
      const entry = latestEntryThroughMonth(artist?.history, month)
      if (!entry || entry.status === 'pass') continue
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

function resolveEndTimestamp(artists = [], nowIso) {
  if (nowIso && Number.isFinite(Date.parse(nowIso))) return Date.parse(nowIso)
  let maxMs = -Infinity
  for (const artist of artists) {
    for (const item of artist?.history || []) {
      const ms = Date.parse(item?.at || '')
      if (Number.isFinite(ms) && ms > maxMs) maxMs = ms
    }
    const updMs = Date.parse(artist?.updatedAt || '')
    if (Number.isFinite(updMs) && updMs > maxMs) maxMs = updMs
  }
  return Number.isFinite(maxMs) ? maxMs : Date.now()
}

export function statusDurations(artists = [], nowIso) {
  const endMs = resolveEndTimestamp(artists, nowIso)
  const byStatus = new Map(ARTIST_STATUSES.map((s) => [s.value, new Map()]))

  for (const artist of artists) {
    const entries = sortHistoryAsc((artist?.history || []).map(normalizeEntry).filter(Boolean))
    if (!entries.length) continue
    const latestStatus = entries[entries.length - 1].status
    const perArtistDays = new Map()

    for (let i = 0; i < entries.length; i += 1) {
      const startMs = Date.parse(entries[i].at)
      if (!Number.isFinite(startMs)) continue
      const nextMs = i + 1 < entries.length ? Date.parse(entries[i + 1].at) : endMs
      if (!Number.isFinite(nextMs)) continue
      const days = Math.max(1, Math.round(Math.max(0, nextMs - startMs) / MS_PER_DAY))
      const st = entries[i].status
      perArtistDays.set(st, (perArtistDays.get(st) || 0) + days)
    }

    for (const [status, days] of perArtistDays) {
      const statusMap = byStatus.get(status)
      if (!statusMap) continue
      statusMap.set(artist.id, {
        id: artist.id,
        handle: artist.handle,
        name: artist.name || '',
        days,
        isCurrent: status === latestStatus,
      })
    }
  }

  return ARTIST_STATUSES.map((def) => {
    const list = Array.from(byStatus.get(def.value).values())
      .sort((a, b) => b.days - a.days || String(a.id).localeCompare(String(b.id)))
    const totalDays = list.reduce((sum, a) => sum + a.days, 0)
    return {
      status: def.value,
      label: def.label,
      totalDays,
      artistCount: list.length,
      artists: list,
    }
  }).filter((row) => row.totalDays > 0 || row.artistCount > 0)
}
