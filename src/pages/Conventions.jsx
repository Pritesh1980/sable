import { useState } from 'react'
import { CONVENTIONS, getConventionFavicon } from '../data/conventions'
import Logo from '../components/Logo'

function DistanceBadge({ distanceMiles, distanceNote }) {
  if (distanceMiles === null) return null
  const label = distanceMiles === 0 ? 'local' : `${distanceMiles} mi`
  return (
    <span className="text-[0.625rem] font-mono text-cream-muted/60 tracking-wide whitespace-nowrap">
      {label}{distanceNote ? ` · ${distanceNote}` : ''}
    </span>
  )
}

function AttendingArtists({ convention, artists }) {
  const attending = (convention.attendingArtistIds || [])
    .map((id) => artists.find((a) => a.id === id))
    .filter(Boolean)

  if (attending.length === 0) return null

  return (
    <div className="mt-3 pt-3 border-t border-ink-border/50">
      <p className="text-[0.625rem] font-mono text-accent tracking-widest uppercase mb-2">
        Your artists attending
      </p>
      <div className="flex flex-wrap gap-2">
        {attending.map((artist) => (
          <a
            key={artist.id}
            href={`https://instagram.com/${artist.handle}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 bg-ink-muted/60 rounded-sm px-2 py-1 hover:bg-ink-muted transition-colors"
          >
            {artist.images?.[0] && (
              <img
                src={artist.images[0]}
                alt=""
                className="w-5 h-5 rounded-sm object-cover"
              />
            )}
            <span className="text-[0.6875rem] font-mono text-cream-muted">
              @{artist.handle}
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function ConventionCard({ convention, artists }) {
  const favicon = getConventionFavicon(convention)

  return (
    <a
      href={convention.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group block bg-ink-card border rounded-sm p-4 transition-colors animate-slide-up ${
        convention.popular
          ? 'border-accent/40 hover:border-accent/70'
          : 'border-ink-border hover:border-cream-muted/50'
      }`}
    >
      <div className="flex items-start gap-3 mb-2">
        {favicon && (
          <div className="w-10 h-10 shrink-0 bg-ink-muted rounded-sm overflow-hidden flex items-center justify-center">
            <img
              src={favicon}
              alt=""
              className="w-8 h-8 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
              loading="lazy"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-cream text-lg leading-tight">{convention.name}</h3>
            {convention.popular && (
              <span className="text-[0.625rem] font-mono text-accent tracking-widest uppercase shrink-0 mt-1">★ Popular</span>
            )}
          </div>
          <p className="text-cream-muted text-xs font-mono mt-0.5">{convention.location}</p>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-cream-muted/90 text-xs font-mono">{convention.dates}</p>
            <DistanceBadge distanceMiles={convention.distanceMiles} distanceNote={convention.distanceNote} />
          </div>
        </div>
      </div>
      <p className="text-cream-muted text-sm font-body leading-relaxed mt-2">{convention.summary}</p>
      <AttendingArtists convention={convention} artists={artists} />
      <p className="text-[0.6875rem] font-mono text-cream-muted/70 tracking-widest uppercase mt-3 group-hover:text-accent transition-colors">
        Visit site →
      </p>
    </a>
  )
}

export default function Conventions({ artists = [] }) {
  const [sortBy, setSortBy] = useState('date')

  const sorted = [...CONVENTIONS].sort((a, b) => {
    if (sortBy === 'distance') {
      const da = a.distanceMiles ?? Infinity
      const db = b.distanceMiles ?? Infinity
      return da - db
    }
    return 0 // preserve original date order
  })

  const hasAttending = CONVENTIONS.some((c) =>
    (c.attendingArtistIds || []).some((id) => artists.find((a) => a.id === id))
  )

  const popular = sorted.filter((c) => c.popular)
  const rest = sorted.filter((c) => !c.popular)

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-12 pb-6">
        <Logo size={24} className="mb-2" />
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-display text-3xl text-cream">Convention Radar</h1>
            <p className="text-cream-muted/80 text-xs font-mono mt-2">UK tattoo conventions · 2026 editions · distances from MK</p>
          </div>
          <div className="flex gap-1 mb-1">
            <button
              onClick={() => setSortBy('date')}
              className={`text-[0.625rem] font-mono tracking-widest uppercase px-2 py-1 rounded-sm transition-colors ${
                sortBy === 'date'
                  ? 'bg-accent/20 text-accent'
                  : 'text-cream-muted/50 hover:text-cream-muted'
              }`}
            >
              Date
            </button>
            <button
              onClick={() => setSortBy('distance')}
              className={`text-[0.625rem] font-mono tracking-widest uppercase px-2 py-1 rounded-sm transition-colors ${
                sortBy === 'distance'
                  ? 'bg-accent/20 text-accent'
                  : 'text-cream-muted/50 hover:text-cream-muted'
              }`}
            >
              Distance
            </button>
          </div>
        </div>
      </div>

      {sortBy === 'date' ? (
        <>
          <section className="mb-8">
            <h2 className="text-xs font-mono text-accent tracking-widest uppercase mb-3">★ Highlights</h2>
            <div className="space-y-3">
              {popular.map((c) => (
                <ConventionCard key={c.id} convention={c} artists={artists} />
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">More shows</h2>
            <div className="space-y-3">
              {rest.map((c) => (
                <ConventionCard key={c.id} convention={c} artists={artists} />
              ))}
            </div>
          </section>
        </>
      ) : (
        <section>
          {hasAttending && (
            <h2 className="text-xs font-mono text-accent tracking-widest uppercase mb-3">Nearest first</h2>
          )}
          <div className="space-y-3">
            {sorted.map((c) => (
              <ConventionCard key={c.id} convention={c} artists={artists} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
