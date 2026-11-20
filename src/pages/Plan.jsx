import { useId, useState } from 'react'
import { Link } from 'react-router'
import { MapPin } from 'lucide-react'
import ArtistImage from '../components/ArtistImage'
import TagPill from '../components/TagPill'
import EmptyState from '../components/EmptyState'
import StartChecklist from '../components/StartChecklist'
import SampleArtistNotice from '../components/SampleArtistNotice'
import NearbySoon from '../components/NearbySoon'
import { readNearbyRadius } from '../data/nearbyRadius'
import { IDEA_STATUSES } from '../data/brief'
import { artistsForIdea } from '../data/planning'
import { nearbySoon, formatSpotDates, todayIso } from '../data/guestSpots'

// Plan (#220, group D) answers one question: which artist for which idea. It
// replaced Pipeline, which was built around a contact workflow (researching →
// contact next → contacted) the owner does not use. Each open idea sits beside
// up to three saved artists: the ones already linked to it, then the closest
// by shared styles, with rank breaking ties.

const rise = (step) => ({ animationDelay: `${step * 70}ms`, animationFillMode: 'both' })
const artistLabel = (artist) => artist.name || `@${artist.handle}`

function ArtistRow({ artist, linked, overlapTags, spot }) {
  const shared = overlapTags.length
  return (
    <li>
      <Link
        to={`/gallery?artist=${encodeURIComponent(artist.id)}${spot ? '#guest-spots' : ''}`}
        className="group flex items-center gap-3 min-h-14 py-2 pr-1 hover:bg-ink-muted/40 rounded-xs transition-colors"
      >
        <span className="w-10 h-12 shrink-0 overflow-hidden rounded-xs bg-ink-muted">
          <ArtistImage src={artist.images?.[0]} label={artistLabel(artist)} className="w-full h-full object-cover" monogramClassName="text-base" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg text-cream leading-tight truncate group-hover:text-accent transition-colors">
            {artistLabel(artist)}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 font-mono text-[0.6875rem] tracking-widest text-cream-muted mt-0.5">
            {linked && <span className="text-accent uppercase">Linked</span>}
            {shared > 0 && <span>{shared} shared {shared === 1 ? 'style' : 'styles'}</span>}
          </span>
          {spot && (
            <span className="flex items-center gap-1 font-mono text-[0.6875rem] text-accent/90 tracking-wide mt-0.5 truncate">
              <MapPin size={12} aria-hidden="true" className="shrink-0" />
              <span className="sr-only">Nearby soon: </span>
              {spot.city} · {formatSpotDates(spot)}
            </span>
          )}
        </span>
        {artist.rank != null && <span className="font-mono text-xs text-cream-muted/70 shrink-0">#{artist.rank}</span>}
      </Link>
    </li>
  )
}

function IdeaCard({ idea, artists, nearbyByArtist, step }) {
  const titleId = useId()
  const status = IDEA_STATUSES.find((s) => s.value === (idea.status || 'idea')) || IDEA_STATUSES[0]
  const rows = artistsForIdea(idea, artists)
  const hasTags = idea.tags?.length > 0
  const ideaLink = `/brief?idea=${encodeURIComponent(idea.id)}`
  const hintClass = 'font-body text-sm text-cream-muted leading-relaxed'

  return (
    <article
      aria-labelledby={titleId}
      className="border-t border-ink-border pt-5 pb-6 animate-slide-up motion-reduce:animate-none"
      style={rise(step)}
    >
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId} className="font-display text-2xl text-cream leading-tight min-w-0">
          <Link to={ideaLink} className="hover:text-accent transition-colors">{idea.title || 'Untitled idea'}</Link>
        </h2>
        <span className={`font-mono text-[0.6875rem] tracking-widest uppercase shrink-0 mt-2 ${status.color}`}>{status.label}</span>
      </div>
      {hasTags && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {idea.tags.map((tag) => <TagPill key={tag} tag={tag} active small />)}
        </div>
      )}

      {rows.length > 0 && (
        <ol aria-label={`Artists for ${idea.title || 'this idea'}`} className="mt-3 divide-y divide-ink-border/60">
          {rows.map((row) => <ArtistRow key={row.artist.id} {...row} spot={nearbyByArtist.get(row.artist.id)} />)}
        </ol>
      )}
      {!hasTags && rows.length === 0 && (
        <p className={`${hintClass} mt-3`}>
          <Link to={ideaLink} className="text-accent hover:text-cream underline underline-offset-4">Add styles to this idea</Link>
          {' '}to see which artists suit it.
        </p>
      )}
      {hasTags && rows.length === 0 && (
        <p className={`${hintClass} mt-3`}>None of your artists share these styles yet.</p>
      )}
    </article>
  )
}

export default function Plan({ artists = [], ideas = [], setArtists = () => {}, today = todayIso() }) {
  const [radiusMiles, setRadiusMiles] = useState(readNearbyRadius)
  const openIdeas = ideas.filter((idea) => (idea.status || 'idea') !== 'done')

  // The soonest nearby spot per artist, at the same radius the section below uses.
  const nearbyByArtist = new Map()
  for (const { artist, spot } of nearbySoon(artists, { today, radiusMiles })) {
    if (!nearbyByArtist.has(artist.id)) nearbyByArtist.set(artist.id, spot)
  }

  return (
    <main className="min-h-screen bg-ink-black pt-safe-top">
      <div className="max-w-3xl mx-auto px-4 md:px-8 pt-10 pb-24">
        <header className="animate-slide-up motion-reduce:animate-none" style={rise(0)}>
          <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Plan</h1>
          <p className="font-body text-sm text-cream-muted leading-relaxed mt-4 max-w-prose">
            Which artist for which idea. Each open idea sits beside the saved artists who suit it: the ones you linked, then the most shared styles, then your rank.
          </p>
        </header>

        {artists.length === 0 ? (
          <div className="mt-8">
            <StartChecklist ideas={ideas} setArtists={setArtists} />
          </div>
        ) : (
          <>
            <SampleArtistNotice artists={artists} setArtists={setArtists} className="mt-6" />
            <div className="mt-8">
              {openIdeas.length === 0 ? (
                <EmptyState
                  definition="An idea is a tattoo you want. Write one and give it styles, and Plan puts it beside the artists who suit it."
                  to="/brief?new=1"
                  cta="Write an idea"
                />
              ) : (
                openIdeas.map((idea, i) => (
                  <IdeaCard key={idea.id} idea={idea} artists={artists} nearbyByArtist={nearbyByArtist} step={i + 1} />
                ))
              )}
            </div>

            <section aria-labelledby="plan-nearby" className="mt-12">
              <h2 id="plan-nearby" className="font-display text-2xl text-cream leading-none border-b border-ink-border pb-2 mb-4">
                Nearby soon
              </h2>
              <NearbySoon artists={artists} today={today} radiusMiles={radiusMiles} onRadiusChange={setRadiusMiles} />
            </section>
          </>
        )}
      </div>
    </main>
  )
}
