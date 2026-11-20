import { useMemo } from 'react'
import { movers, statusDurations, styleShareByMonth, topNByMonth } from '../data/tasteHistory'
import TagPill from './TagPill'

function artistLabel(artist) {
  return artist?.name || `@${artist?.handle}`
}

export default function TasteOverTime({ artists = [] }) {
  const hasHistory = useMemo(
    () => artists.some((artist) => Array.isArray(artist?.history) && artist.history.length > 0),
    [artists],
  )

  const monthlyTop = useMemo(
    () => (hasHistory ? topNByMonth(artists, 5).slice(-4) : []),
    [artists, hasHistory],
  )
  const rankMovers = useMemo(
    () => (hasHistory ? movers(artists, { limit: 4 }) : { risers: [], fallers: [], all: [] }),
    [artists, hasHistory],
  )
  const monthlyStyles = useMemo(
    () => (hasHistory ? styleShareByMonth(artists).slice(-4) : []),
    [artists, hasHistory],
  )
  const durations = useMemo(
    () => (hasHistory ? statusDurations(artists) : []),
    [artists, hasHistory],
  )

  if (!hasHistory) {
    return (
      <p className="text-cream-muted/90 text-sm font-body leading-relaxed">
        No rank or status history yet. Rank and status changes are recorded once per day per artist and build up Top 5 by month, risers and fallers, style share, and time spent in each status over time.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {monthlyTop.length > 0 && (
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted mb-2.5">Top 5 by month</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {monthlyTop.map((month) => (
              <div key={month.month} className="bg-ink-card border border-ink-border rounded-xs p-3">
                <p className="font-mono text-xs text-accent tracking-widest uppercase mb-2">{month.label}</p>
                <ol className="space-y-1">
                  {month.artists.map((entry) => (
                    <li key={entry.id} className="flex items-baseline gap-2 text-xs">
                      <span className="font-mono text-[0.6875rem] text-cream-muted/70 tabular-nums shrink-0">#{entry.rank}</span>
                      <span className="text-cream truncate">{artistLabel(entry)}</span>
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

      {durations.length > 0 && (
        <div>
          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-cream-muted mb-2.5">Time in each status</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {durations.map((row) => (
              <div key={row.status} className="bg-ink-card border border-ink-border rounded-xs p-3">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="font-mono text-xs text-cream uppercase tracking-widest">{row.label}</span>
                  <span className="font-mono text-[0.6875rem] text-cream-muted/80 tabular-nums">
                    {row.totalDays}d · {row.artistCount} {row.artistCount === 1 ? 'artist' : 'artists'}
                  </span>
                </div>
                <p className="text-xs text-cream-muted/80 leading-relaxed truncate">
                  {row.artists.slice(0, 3).map((a) => `${artistLabel(a)} · ${a.days}d`).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
