import { useState } from 'react'
import { Link } from 'react-router'
import { nearbySoon, formatSpotDates, todayIso, NEARBY_DAYS } from '../data/guestSpots'
import { NEARBY_RADII as RADII, readNearbyRadius, saveNearbyRadius } from '../data/nearbyRadius'

const artistLabel = (artist) => artist?.name || `@${artist?.handle}`
const milesLabel = (miles) => (miles === 0 ? 'local' : `${miles} mi`)
// Lands on the artist's Guest spots section, not the top of their photos.
const artistLink = (artist) => `/gallery?artist=${encodeURIComponent(artist.id)}#guest-spots`

// Guest spots by saved artists coming up near Milton Keynes (#183). The full
// version sits on Plan; `compact` is a small chip in the Artists header (the
// soonest spot, then a +N linking to Plan), and nothing at all when none is coming up.
// Plan passes `radiusMiles` + `onRadiusChange` so its idea chips follow the same radius.
export default function NearbySoon({ artists = [], today = todayIso(), compact = false, className = '', radiusMiles: controlled, onRadiusChange }) {
  const [own, setOwn] = useState(readNearbyRadius)
  const radiusMiles = controlled ?? own
  const rows = nearbySoon(artists, { today, radiusMiles })

  function chooseRadius(e) {
    const value = Number(e.target.value)
    if (onRadiusChange) onRadiusChange(value)
    else setOwn(value)
    saveNearbyRadius(value)
  }

  if (compact) {
    if (rows.length === 0) return null
    const [{ artist, spot }] = rows
    return (
      <div className={`inline-flex items-center max-w-full min-h-11 rounded-full border border-ink-border font-mono text-[0.6875rem] tracking-wide ${className}`}>
        <Link to={artistLink(artist)} className="flex items-center min-h-11 min-w-0 pl-3 pr-3 text-cream-muted hover:text-cream">
          <span className="text-accent uppercase tracking-widest mr-2 shrink-0">Nearby soon</span>
          <span className="truncate">{artistLabel(artist)} · {spot.city}</span>
        </Link>
        {rows.length > 1 && (
          <Link to="/plan" aria-label={`${rows.length - 1} more nearby, see Plan`} className="flex items-center min-h-11 pr-3 shrink-0 text-cream-muted/80 hover:text-cream">+{rows.length - 1}</Link>
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
