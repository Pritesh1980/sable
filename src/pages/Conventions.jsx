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
              <img src={artist.images[0]} alt="" className="w-5 h-5 rounded-sm object-cover" />
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

function ConventionCard({ convention, artists, onEditAttendees }) {
  const favicon = getConventionFavicon(convention)
  const attendingCount = (convention.attendingArtistIds || []).length

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

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-ink-border/40">
        <p className="text-[0.6875rem] font-mono text-cream-muted/70 tracking-widest uppercase group-hover:text-accent transition-colors">
          Visit site →
        </p>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEditAttendees(convention.id) }}
          className={`text-[0.625rem] font-mono tracking-widest uppercase transition-colors ${
            attendingCount > 0
              ? 'text-accent/70 hover:text-accent'
              : 'text-cream-muted/30 hover:text-cream-muted/60'
          }`}
        >
          {attendingCount > 0 ? `${attendingCount} attending · Edit` : '+ Add attending artists'}
        </button>
      </div>
    </a>
  )
}

function AttendeeEditor({ convention, artists, onSave, onClose }) {
  const [selected, setSelected] = useState(new Set(convention.attendingArtistIds || []))

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sorted = [...artists].sort((a, b) => (a.rank || 99) - (b.rank || 99))

  return (
    <div className="fixed inset-0 z-50 bg-ink-black flex flex-col animate-fade-in">
      <div className="flex items-center justify-between px-5 pt-14 pb-4 border-b border-ink-border shrink-0">
        <div>
          <p className="text-[0.625rem] font-mono text-accent tracking-widest uppercase mb-1">Attending artists</p>
          <h2 className="font-display text-xl text-cream leading-tight">{convention.name}</h2>
          <p className="text-cream-muted/60 text-xs font-mono mt-0.5">{convention.dates}</p>
        </div>
        <button
          onClick={() => { onSave(convention.id, [...selected]); onClose() }}
          className="text-accent hover:text-accent-hover text-sm font-body transition-colors"
        >
          Done
        </button>
      </div>

      <div className="shrink-0 px-5 py-3 border-b border-ink-border/40">
        <p className="text-cream-muted/50 text-[0.625rem] font-mono tracking-widest">
          {selected.size} artist{selected.size !== 1 ? 's' : ''} marked attending · tap to toggle
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-3">
        <div className="space-y-2">
          {sorted.map((artist) => {
            const isSelected = selected.has(artist.id)
            return (
              <button
                key={artist.id}
                onClick={() => toggle(artist.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-sm border transition-colors text-left ${
                  isSelected
                    ? 'border-accent/50 bg-accent/5'
                    : 'border-ink-border hover:border-cream-muted/30'
                }`}
              >
                {artist.images?.[0] ? (
                  <img src={artist.images[0]} alt="" className="w-9 h-9 rounded-sm object-cover shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-sm bg-ink-muted shrink-0 flex items-center justify-center">
                    <span className="font-display text-cream-muted/30 text-sm">
                      {(artist.name || artist.handle)[0].toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className={`font-display text-base leading-tight truncate ${isSelected ? 'text-cream' : 'text-cream-muted'}`}>
                    {artist.name || `@${artist.handle}`}
                  </p>
                  <p className="font-mono text-cream-muted/40 text-[0.625rem] tracking-widest mt-0.5">
                    #{artist.rank} · @{artist.handle}
                  </p>
                </div>
                <span className={`w-5 h-5 rounded-sm border flex items-center justify-center shrink-0 text-[0.625rem] transition-colors ${
                  isSelected ? 'bg-accent border-accent text-cream font-bold' : 'border-ink-border text-transparent'
                }`}>
                  ✓
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default function Conventions({ artists = [], conventionOverrides = {}, setConventionOverrides }) {
  const [sortBy, setSortBy] = useState('date')
  const [editingId, setEditingId] = useState(null)
  const [showPast, setShowPast] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const conventions = CONVENTIONS.map((c) => ({
    ...c,
    attendingArtistIds: conventionOverrides[c.id] ?? c.attendingArtistIds ?? [],
  }))

  const sorted = [...conventions].sort((a, b) => {
    if (sortBy === 'distance') {
      const da = a.distanceMiles ?? Infinity
      const db = b.distanceMiles ?? Infinity
      return da - db
    }
    return 0
  })

  const upcoming = sorted.filter((c) => !c.endDate || c.endDate >= today)
  const past = sorted.filter((c) => c.endDate && c.endDate < today).reverse()

  const upcomingPopular = upcoming.filter((c) => c.popular)
  const upcomingRest = upcoming.filter((c) => !c.popular)

  function saveAttendees(conventionId, artistIds) {
    setConventionOverrides?.((prev) => ({ ...prev, [conventionId]: artistIds }))
  }

  const editingConvention = editingId ? conventions.find((c) => c.id === editingId) : null

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
                sortBy === 'date' ? 'bg-accent/20 text-accent' : 'text-cream-muted/50 hover:text-cream-muted'
              }`}
            >
              Date
            </button>
            <button
              onClick={() => setSortBy('distance')}
              className={`text-[0.625rem] font-mono tracking-widest uppercase px-2 py-1 rounded-sm transition-colors ${
                sortBy === 'distance' ? 'bg-accent/20 text-accent' : 'text-cream-muted/50 hover:text-cream-muted'
              }`}
            >
              Distance
            </button>
          </div>
        </div>
      </div>

      {sortBy === 'date' ? (
        <>
          {upcomingPopular.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-mono text-accent tracking-widest uppercase mb-3">★ Highlights</h2>
              <div className="space-y-3">
                {upcomingPopular.map((c) => (
                  <ConventionCard key={c.id} convention={c} artists={artists} onEditAttendees={setEditingId} />
                ))}
              </div>
            </section>
          )}
          {upcomingRest.length > 0 && (
            <section className="mb-8">
              <h2 className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-3">More shows</h2>
              <div className="space-y-3">
                {upcomingRest.map((c) => (
                  <ConventionCard key={c.id} convention={c} artists={artists} onEditAttendees={setEditingId} />
                ))}
              </div>
            </section>
          )}
          {upcoming.length === 0 && (
            <p className="text-cream-muted/50 text-sm font-body py-8 text-center">No upcoming conventions — check back later.</p>
          )}
        </>
      ) : (
        <section className="mb-8">
          <div className="space-y-3">
            {upcoming.map((c) => (
              <ConventionCard key={c.id} convention={c} artists={artists} onEditAttendees={setEditingId} />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="mt-4">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-2 text-[0.625rem] font-mono text-cream-muted/30 hover:text-cream-muted/60 tracking-widest uppercase transition-colors mb-3"
          >
            <span className={`transition-transform ${showPast ? 'rotate-180' : ''}`}>▾</span>
            {showPast ? 'Hide' : `Show ${past.length} past`} shows
          </button>
          {showPast && (
            <div className="space-y-3 opacity-40">
              {past.map((c) => (
                <ConventionCard key={c.id} convention={c} artists={artists} onEditAttendees={setEditingId} />
              ))}
            </div>
          )}
        </section>
      )}

      {editingConvention && (
        <AttendeeEditor
          convention={editingConvention}
          artists={artists}
          onSave={saveAttendees}
          onClose={() => setEditingId(null)}
        />
      )}
    </div>
  )
}
