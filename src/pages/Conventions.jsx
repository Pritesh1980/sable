import { useEffect, useRef, useState } from 'react'
import { CONVENTIONS, getConventionFavicon, mergeConventionOverrides, toggleConventionAttendee } from '../data/conventions'
import { mergeLineupEntries, parseLineup } from '../data/lineup'
import { parseLineupHash } from '../data/lineupGrabber'
import { createArtist } from '../data/artists'
import ConventionLineup from '../components/ConventionLineup'
import Logo from '../components/Logo'

function DistanceBadge({ distanceMiles }) {
  if (distanceMiles === null || distanceMiles === undefined) {
    return <span className="text-xs font-mono text-cream-muted/40 tracking-wide">distance TBC</span>
  }
  if (distanceMiles === 0) {
    return <span className="text-xs font-mono text-accent tracking-widest uppercase">◎ In Milton Keynes</span>
  }
  return (
    <span className="text-xs font-mono text-cream-muted/70 tracking-wide whitespace-nowrap">
      {distanceMiles} mi from MK
    </span>
  )
}

function ConventionLogo({ convention, size }) {
  const favicon = getConventionFavicon(convention)
  if (!favicon) {
    return (
      <div className={`${size} shrink-0 bg-ink-muted rounded-xs flex items-center justify-center`}>
        <span className="font-display text-cream-muted/40">{convention.name[0]}</span>
      </div>
    )
  }
  return (
    <div className={`${size} shrink-0 bg-ink-muted rounded-xs overflow-hidden flex items-center justify-center`}>
      <img
        src={favicon}
        alt=""
        className="w-2/3 h-2/3 object-contain"
        onError={(e) => { e.currentTarget.style.display = 'none' }}
        loading="lazy"
      />
    </div>
  )
}

function artistLabel(a) {
  return a.name || `@${a.handle}`
}

// Lets you record which of your saved artists are appearing at a convention.
// (Manual for now — automatic look-up is on the backlog.)
function AttendeesEditor({ artists, attendingIds, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  const attending = artists.filter((a) => attendingIds.includes(a.id))

  return (
    <div className="mt-4 pt-3 border-t border-ink-border">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.625rem] font-mono text-cream-muted tracking-widest uppercase">
          {attending.length > 0
            ? `◎ ${attending.length} of your artists attending`
            : 'Your artists attending'}
        </p>
        {artists.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="min-w-11 min-h-11 px-3 flex items-center justify-center shrink-0 text-[0.625rem] font-mono text-accent tracking-widest uppercase hover:text-accent-hover transition-colors"
          >
            {expanded ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {!expanded && attending.length > 0 && (
        <p className="text-cream-muted/80 text-xs font-mono mt-1.5 leading-relaxed">
          {attending.map(artistLabel).join(' · ')}
        </p>
      )}

      {!expanded && attending.length === 0 && (
        <p className="text-cream-muted/40 text-xs font-mono mt-1.5">
          {artists.length > 0 ? 'None marked yet — tap Edit.' : 'Add artists first.'}
        </p>
      )}

      {expanded && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {artists.map((a) => {
            const on = attendingIds.includes(a.id)
            return (
              <button
                key={a.id}
                onClick={() => onToggle(a.id)}
                className={`text-[0.6875rem] px-2 py-1 rounded-xs border font-mono tracking-wide transition-colors ${
                  on
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-ink-border text-cream-muted hover:border-cream-muted hover:text-cream'
                }`}
              >
                {artistLabel(a)}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function HeroCard({ convention, artists, attendingIds, onToggle, lineupProps }) {
  return (
    <div id={`convention-${convention.id}`} className="bg-gradient-to-br from-accent/10 to-ink-card border border-accent/40 rounded-xs p-6 animate-slide-up">
      <div className="flex items-start gap-4">
        <ConventionLogo convention={convention} size="w-14 h-14" />
        <div className="flex-1 min-w-0">
          <p className="text-[0.625rem] font-mono text-accent tracking-[0.3em] uppercase mb-1">Closest to you</p>
          <h2 className="font-display text-2xl md:text-3xl text-cream leading-tight">{convention.name}</h2>
          <p className="text-cream-muted text-sm font-mono mt-1">{convention.location}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
            <p className="text-cream text-sm font-mono">{convention.dates}</p>
            <DistanceBadge distanceMiles={convention.distanceMiles} />
          </div>
        </div>
      </div>
      <p className="text-cream-muted text-sm md:text-base font-body leading-relaxed mt-4">{convention.summary}</p>
      <a
        href={convention.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center min-h-11 text-xs font-mono text-accent tracking-widest uppercase mt-1 hover:underline"
      >
        More info →
      </a>
      <AttendeesEditor artists={artists} attendingIds={attendingIds} onToggle={onToggle} />
      <ConventionLineup
        convention={convention}
        artists={artists}
        attendingIds={attendingIds}
        {...lineupProps}
      />
    </div>
  )
}

function ConventionCard({ convention, artists, attendingIds, onToggle, lineupProps }) {
  return (
    <div
      id={`convention-${convention.id}`}
      className={`flex flex-col bg-ink-card border rounded-xs p-5 animate-slide-up ${
        convention.popular ? 'border-accent/30' : 'border-ink-border'
      }`}
    >
      <div className="flex items-start gap-3">
        <ConventionLogo convention={convention} size="w-11 h-11" />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-cream text-lg leading-tight">{convention.name}</h3>
            {convention.popular && (
              <span className="text-[0.5625rem] font-mono text-accent tracking-widest uppercase shrink-0 mt-1.5">★</span>
            )}
          </div>
          <p className="text-cream-muted/80 text-xs font-mono mt-0.5">{convention.location}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3">
        <p className="text-cream-muted text-xs font-mono">{convention.dates}</p>
        <DistanceBadge distanceMiles={convention.distanceMiles} />
      </div>

      <p className="text-cream-muted text-sm font-body leading-relaxed mt-3 flex-1">{convention.summary}</p>

      <a
        href={convention.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center min-h-11 text-[0.6875rem] font-mono text-cream-muted/70 tracking-widest uppercase mt-1 hover:text-accent transition-colors"
      >
        More info →
      </a>
      <AttendeesEditor artists={artists} attendingIds={attendingIds} onToggle={onToggle} />
      <ConventionLineup
        convention={convention}
        artists={artists}
        attendingIds={attendingIds}
        {...lineupProps}
      />
    </div>
  )
}

export default function Conventions({
  artists = [],
  setArtists = () => {},
  conventionOverrides = {},
  setConventionOverrides = () => {},
  conventionLineups = {},
  setConventionLineups = () => {},
}) {
  const merged = mergeConventionOverrides(conventionOverrides)
  const attendanceById = Object.fromEntries(merged.map((c) => [c.id, c.attendingArtistIds]))

  function toggle(conventionId, artistId) {
    setConventionOverrides((prev) =>
      toggleConventionAttendee(prev, conventionId, artistId, attendanceById[conventionId] || [])
    )
  }

  // A re-import merges rather than replaces: shows add artists to the list in
  // the weeks before the doors open, and you should not lose the one you
  // already added to the gallery from an earlier paste.
  function importLineup(conventionId, entries) {
    setConventionLineups((prev) => ({
      ...prev,
      [conventionId]: {
        entries: mergeLineupEntries(prev?.[conventionId]?.entries || [], entries),
        updatedAt: new Date().toISOString(),
      },
    }))
  }

  function clearLineup(conventionId) {
    setConventionLineups((prev) => {
      const next = { ...prev }
      delete next[conventionId]
      return next
    })
  }

  // Adding from the index does both halves of the job: the artist lands in the
  // gallery to research later, and is flagged as attending this show so they
  // show up on the floor plan you actually walk round with.
  function addFromLineup(conventionId, draft) {
    const artist = createArtist(draft, artists)
    if (!artist) return
    setArtists((prev) => [...prev, artist])
    if (!(attendanceById[conventionId] || []).includes(artist.id)) {
      toggle(conventionId, artist.id)
    }
  }

  // The grabber's hand-off: it sends the harvest back as
  // `#lineup=<convention>&data=<text>`. Untrusted input, so it goes through the
  // same strict parser a hand-paste does, and the hash is cleared either way so
  // a reload cannot re-import it.
  // Read once, at first render: parsing is pure, so it belongs here rather than
  // in an effect that would have to set state to report what it found.
  const [handoff] = useState(() => {
    const incoming = parseLineupHash(globalThis.location?.hash || '')
    if (!incoming) return null
    const known = CONVENTIONS.some((c) => c.id === incoming.conventionId)
    return { conventionId: incoming.conventionId, entries: known ? parseLineup(incoming.text) : [] }
  })
  const landed = handoff?.entries.length ? handoff : null
  // The effect does only the things that touch the world outside React.
  const handled = useRef(false)
  useEffect(() => {
    if (!handoff || handled.current) return
    handled.current = true
    const { pathname = '', search = '' } = globalThis.location || {}
    globalThis.history?.replaceState?.(null, '', `${pathname}${search}`)
    if (landed) importLineup(landed.conventionId, landed.entries)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function lineupPropsFor(conventionId) {
    return {
      entries: conventionLineups?.[conventionId]?.entries || [],
      onImport: (entries) => importLineup(conventionId, entries),
      onClear: () => clearLineup(conventionId),
      onAddArtist: (draft) => addFromLineup(conventionId, draft),
      onToggleAttending: (artistId) => toggle(conventionId, artistId),
      defaultExpanded: landed?.conventionId === conventionId,
    }
  }

  // Local show first as the hero, then the rest by reachability (nearest first).
  const local = CONVENTIONS.filter((c) => c.distanceMiles === 0)
  const rest = CONVENTIONS
    .filter((c) => c.distanceMiles !== 0)
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))

  return (
    <div className="min-h-screen bg-ink-black px-4 md:px-8 pt-safe-top pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="pt-12 pb-6">
          <Logo size={24} className="mb-2" />
          <h1 className="font-display text-3xl md:text-4xl text-cream">Convention Radar</h1>
          <p className="text-cream-muted/80 text-xs md:text-sm font-mono mt-2">
            The shows worth your time — biggest UK conventions, your local fest, distances from Milton Keynes.
            All recur annually; dates shown are the latest edition, so check the link for the next one.
          </p>
        </div>

        {landed && (
          <div
            role="status"
            className="bg-accent/10 border border-accent/40 rounded-xs px-4 py-3 mb-4 animate-slide-up"
          >
            <p className="text-cream text-sm font-mono">
              Imported {landed.entries.length} artists into{' '}
              {CONVENTIONS.find((c) => c.id === landed.conventionId)?.name}.
            </p>
            <p className="text-cream-muted/70 text-xs font-body mt-0.5">
              Search the index, or filter it to the artists already in your gallery.
            </p>
            <button
              onClick={() => {
                globalThis.document
                  ?.getElementById(`convention-${landed.conventionId}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="min-h-11 flex items-center text-[0.625rem] font-mono text-accent tracking-widest uppercase hover:text-accent-hover transition-colors"
            >
              Take me to it →
            </button>
          </div>
        )}

        {local.map((c) => (
          <HeroCard
            key={c.id}
            convention={c}
            artists={artists}
            attendingIds={attendanceById[c.id] || []}
            onToggle={(artistId) => toggle(c.id, artistId)}
            lineupProps={lineupPropsFor(c.id)}
          />
        ))}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
          {rest.map((c) => (
            <ConventionCard
              key={c.id}
              convention={c}
              artists={artists}
              attendingIds={attendanceById[c.id] || []}
              onToggle={(artistId) => toggle(c.id, artistId)}
              lineupProps={lineupPropsFor(c.id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
