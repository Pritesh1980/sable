import { useState } from 'react'
import { Link } from 'react-router'
import { nearbySoon, formatSpotDates, todayIso, NEARBY_DAYS, NEARBY_RADIUS_MILES } from '../data/guestSpots'

const RADIUS_KEY = 'tattoo_nearby_radius' // device-local preference, not synced
const RADII = [50, 100, 200, 400]

function readRadius() {
  try {
    const value = Number(localStorage.getItem(RADIUS_KEY))
    return RADII.includes(value) ? value : NEARBY_RADIUS_MILES
  } catch {
    return NEARBY_RADIUS_MILES
  }
}

const artistLabel = (artist) => artist?.name || `@${artist?.handle}`
const milesLabel = (miles) => (miles === 0 ? 'local' : `${miles} mi`)
// Lands on the artist's Guest spots section, not the top of their photos.
const artistLink = (artist) => `/gallery?artist=${encodeURIComponent(artist.id)}#guest-spots`

// Guest spots by saved artists coming up near Milton Keynes (#183). The full
// version sits on Pipeline; `compact` is a single line on Home (the soonest
// spot, then a count linking to Pipeline), and nothing at all when none is coming up.
export default function NearbySoon({ artists = [], today = todayIso(), compact = false, className = '' }) {
  const [radiusMiles, setRadiusMiles] = useState(readRadius)
  const rows = nearbySoon(artists, { today, radiusMiles })

  function chooseRadius(e) {
    const value = Number(e.target.value)
    setRadiusMiles(value)
    try { localStorage.setItem(RADIUS_KEY, String(value)) } catch { /* private mode: keep it for this visit */ }
  }

  if (compact) {
    if (rows.length === 0) return null
    const [{ artist, spot, distanceMiles }] = rows
    return (
      <div className={`flex items-center gap-3 min-w-0 font-mono text-[0.6875rem] tracking-wide ${className}`}>
        <Link to={artistLink(artist)} className="flex items-center min-h-11 min-w-0 text-cream-muted hover:text-cream">
          <span className="text-accent uppercase tracking-widest mr-2 shrink-0">Nearby soon</span>
          <span className="truncate">{artistLabel(artist)} · {spot.city} · {formatSpotDates(spot)} · {milesLabel(distanceMiles)}</span>
        </Link>
        {rows.length > 1 && (
          <Link to="/pipeline" className="flex items-center min-h-11 shrink-0 text-cream-muted/80 hover:text-cream">+{rows.length - 1} more</Link>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-3">
        <label htmlFor="nearby-radius" className="font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase">Within</label>
        <select
          id="nearby-radius"
          value={radiusMiles}
          onChange={chooseRadius}
          className="min-h-11 bg-ink-muted border border-ink-border rounded-xs px-2 text-xs text-cream font-mono outline-hidden focus:border-cream-muted/50"
        >
          {RADII.map((r) => <option key={r} value={r}>{r} mi</option>)}
        </select>
      </div>
      {rows.length === 0 ? (
        <p className="text-cream-muted/80 text-sm font-body">
          No guest spots within {radiusMiles} mi in the next {NEARBY_DAYS} days. Add one from an artist’s page when they announce a trip.
        </p>
      ) : (
        <ul aria-label="Guest spots nearby soon" className="space-y-2">
          {rows.map(({ artist, spot, distanceMiles }) => (
            <li key={`${artist.id}-${spot.id}`}>
              <Link
                to={artistLink(artist)}
                className="flex items-start justify-between gap-3 p-3 bg-ink-card border border-ink-border rounded-xs hover:border-accent/50 transition-colors group"
              >
                <div className="min-w-0">
                  <p className="font-display text-cream text-base leading-tight truncate group-hover:text-accent transition-colors">{artistLabel(artist)}</p>
                  <p className="font-body text-cream-muted text-sm mt-0.5">
                    <span>{spot.city}</span>{spot.studio && <span> · {spot.studio}</span>}
                  </p>
                  <p className="font-mono text-cream-muted/60 text-[0.625rem] tracking-widest mt-0.5">{formatSpotDates(spot)}</p>
                  {spot.notes && <p className="font-body text-cream-muted/90 text-xs mt-1 line-clamp-2">{spot.notes}</p>}
                </div>
                <span className="font-mono text-[0.625rem] text-cream-muted/60 shrink-0 mt-0.5">{milesLabel(distanceMiles)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
