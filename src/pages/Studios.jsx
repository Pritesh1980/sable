import { DEFAULT_STUDIOS } from '../data/artists'
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

function ArtistChip({ artist }) {
  return (
    <a
      href={`https://instagram.com/${artist.handle}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 bg-ink-muted/60 rounded-sm pl-1 pr-2.5 py-1 hover:bg-ink-muted transition-colors"
    >
      {artist.images?.[0] ? (
        <img src={artist.images[0]} alt="" className="w-6 h-6 rounded-sm object-cover shrink-0" />
      ) : (
        <span className="w-6 h-6 rounded-sm bg-ink-card flex items-center justify-center font-display text-cream-muted/40 text-xs shrink-0">
          {(artist.name || artist.handle)[0].toUpperCase()}
        </span>
      )}
      <span className="text-xs font-mono text-cream-muted">@{artist.handle}</span>
    </a>
  )
}

function StudioCard({ studio, artists }) {
  return (
    <div className="flex flex-col bg-ink-card border border-ink-border rounded-sm p-5 animate-slide-up">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-cream text-lg leading-tight">{studio.name}</h3>
          <p className="text-cream-muted/80 text-xs font-mono mt-0.5">
            {studio.city || (studio.notes ? studio.notes : 'Location TBC')}
          </p>
        </div>
        {!studio.confirmed && (
          <span className="text-[0.5625rem] font-mono text-cream-muted/40 tracking-widest uppercase border border-ink-border rounded-sm px-1.5 py-0.5 shrink-0">
            TBC
          </span>
        )}
      </div>

      <div className="mt-2">
        <DistanceBadge distanceMiles={studio.distanceMiles} />
      </div>

      {artists.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink-border/50">
          <p className="text-[0.625rem] font-mono text-cream-muted/50 tracking-widest uppercase mb-2">
            {artists.length} of your artist{artists.length !== 1 ? 's' : ''} here
          </p>
          <div className="flex flex-wrap gap-2">
            {artists.map((a) => <ArtistChip key={a.id} artist={a} />)}
          </div>
        </div>
      )}

      {studio.url && (
        <a
          href={studio.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.6875rem] font-mono text-cream-muted/70 tracking-widest uppercase mt-4 hover:text-accent transition-colors"
        >
          Visit site →
        </a>
      )}
    </div>
  )
}

export default function Studios({ artists = [] }) {
  // Studios that have at least one of your saved artists, nearest first.
  // (Studios with no saved artists are hidden — they're just placeholders.)
  const withArtists = DEFAULT_STUDIOS
    .map((studio) => ({
      studio,
      artists: artists.filter((a) => a.studio === studio.id).sort((a, b) => (a.rank || 99) - (b.rank || 99)),
    }))
    .filter(({ artists }) => artists.length > 0)
    .sort((a, b) => (a.studio.distanceMiles ?? Infinity) - (b.studio.distanceMiles ?? Infinity))

  const totalArtists = withArtists.reduce((n, { artists }) => n + artists.length, 0)

  return (
    <div className="min-h-screen bg-ink-black px-4 md:px-8 pt-safe-top pb-24">
      <div className="max-w-5xl mx-auto">
        <div className="pt-12 pb-6">
          <Logo size={24} className="mb-2" />
          <h1 className="font-display text-3xl md:text-4xl text-cream">Studios</h1>
          <p className="text-cream-muted/80 text-xs md:text-sm font-mono mt-2">
            Where your artists work — {totalArtists} artist{totalArtists !== 1 ? 's' : ''} across {withArtists.length} studio{withArtists.length !== 1 ? 's' : ''}, sorted by distance from Milton Keynes.
          </p>
        </div>

        {withArtists.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {withArtists.map(({ studio, artists }) => (
              <StudioCard key={studio.id} studio={studio} artists={artists} />
            ))}
          </div>
        ) : (
          <p className="text-cream-muted/50 text-sm font-body py-8 text-center">
            No studios linked to your artists yet. Assign a studio to an artist in their detail view.
          </p>
        )}
      </div>
    </div>
  )
}
