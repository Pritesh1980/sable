import { useMemo } from 'react'
import { movers, styleShareByMonth, topNByMonth } from '../data/tasteHistory'
import TagPill from './TagPill'

function artistLabel(artist) {
  return artist?.name || `@${artist?.handle}`
}

export default function TasteOverTime({ artists = [], today }) {
  const list = useMemo(() => (Array.isArray(artists) ? artists : []), [artists])

  const nowIso = useMemo(
    () => (today && /^\d{4}-\d{2}-\d{2}$/.test(String(today))
      ? `${today}T12:00:00.000Z`
      : new Date().toISOString()),
    [today],
  )

  const hasHistory = useMemo(
    () => list.some((artist) => Array.isArray(artist?.history) && artist.history.length > 0),
    [list],
  )

  const monthlyTop = useMemo(
    () => (hasHistory ? topNByMonth(list, 5, nowIso).slice(-4) : []),
    [list, hasHistory, nowIso],
  )
  const rankMovers = useMemo(
    () => (hasHistory ? movers(list, { limit: 4 }) : { risers: [], fallers: [], all: [] }),
    [list, hasHistory],
  )
  const monthlyStyles = useMemo(
    () => (hasHistory ? styleShareByMonth(list, nowIso).slice(-4) : []),
    [list, hasHistory, nowIso],
  )

  if (!hasHistory) {
    return (
      <p className="text-cream-muted/90 text-sm font-body leading-relaxed">
        No rank history yet. Rank changes are recorded once per day per artist and build up your top five by month, biggest risers and fallers, and style share over time.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {monthlyTop.length > 0 && (
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted mb-2.5">Top five by month</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {monthlyTop.map((month) => (
              <div key={month.month} className="bg-ink-card border border-ink-border rounded-xs p-3">
                <p className="font-mono text-xs text-accent tracking-widest uppercase mb-2">{month.label}</p>
                <ol className="space-y-1">
                  {month.artists.map((entry, idx) => (
                    <li key={entry.id} className="flex items-baseline gap-2 text-xs">
                      <span className="font-mono text-[0.6875rem] text-cream-muted/70 tabular-nums shrink-0">#{idx + 1}</span>
                      <span className="text-cream truncate">{artistLabel(entry)}</span>
                      {entry.rank !== idx + 1 && (
                        <span className="font-mono text-[0.625rem] text-cream-muted/70 shrink-0">(rank #{entry.rank})</span>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}

      {(rankMovers.risers.length > 0 || rankMovers.fallers.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="bg-ink-card border border-ink-border rounded-xs p-3">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted mb-2">Biggest risers</p>
            {rankMovers.risers.length > 0 ? (
              <ul className="space-y-1.5">
                {rankMovers.risers.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-cream truncate">{artistLabel(entry)}</span>
                    <span className="font-mono text-[0.6875rem] text-accent tabular-nums shrink-0">
                      #{entry.fromRank} → #{entry.toRank} (+{entry.delta})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-cream-muted/70">No risers recorded yet.</p>
            )}
          </div>

          <div className="bg-ink-card border border-ink-border rounded-xs p-3">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted mb-2">Biggest fallers</p>
            {rankMovers.fallers.length > 0 ? (
              <ul className="space-y-1.5">
                {rankMovers.fallers.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-cream truncate">{artistLabel(entry)}</span>
                    <span className="font-mono text-[0.6875rem] text-cream-muted tabular-nums shrink-0">
                      #{entry.fromRank} → #{entry.toRank} ({entry.delta})
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-cream-muted/70">No fallers recorded yet.</p>
            )}
          </div>
        </div>
      )}

      {monthlyStyles.length > 0 && (
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted mb-2.5">Style share by month</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {monthlyStyles.map((month) => (
              <div key={month.month} className="bg-ink-card border border-ink-border rounded-xs p-3">
                <p className="font-mono text-xs text-accent tracking-widest uppercase mb-2">{month.label}</p>
                <div className="space-y-1.5">
                  {month.styles.slice(0, 4).map((style) => (
                    <div key={style.tag} className="flex items-center justify-between gap-2">
                      <TagPill tag={style.tag} small />
                      <span className="font-mono text-[0.6875rem] text-cream-muted tabular-nums shrink-0">{style.percent}%</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
