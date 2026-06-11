import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import TagPill from '../components/TagPill'
import HowItWorksStrip from '../components/HowItWorksStrip'
import { IDEA_STATUSES } from '../data/brief'
import { ARTIST_STATUSES, buildDashboardSummary, buildMatchRationale, buildPipelineSummary, matchArtistsForIdea, normalizeArtistStatus } from '../data/planning'

const STATUS_DOTS = {
  idea: 'bg-cream-muted/40',
  booked: 'bg-accent',
  done: 'bg-green-400',
}

function artistLabel(artist) {
  return artist?.name || `@${artist?.handle}`
}

function artistStatusLabel(status) {
  return ARTIST_STATUSES.find((s) => s.value === normalizeArtistStatus(status))?.label
}

function Panel({ title, action, children }) {
  return (
    <section className="border-t border-ink-border py-5">
      <div className="flex items-center justify-between gap-4 mb-4">
        <h2 className="font-mono text-xs text-cream-muted tracking-widest uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export default function Dashboard({ artists, ideas, boards, mergedConventions = [] }) {
  const summary = buildDashboardSummary({ artists, ideas, boards })
  const { stages, parked, contacted } = buildPipelineSummary(artists)
  const pipelineEmpty = artists.length === 0
  const ideaMatches = summary.activeIdeas
    .map((idea) => ({ idea, matches: matchArtistsForIdea(idea, artists).slice(0, 3) }))
    .filter(({ matches }) => matches.length > 0)

  return (
    <div className="min-h-screen bg-ink-black max-w-5xl mx-auto px-4 md:px-8 pt-safe-top pb-24">
      <div className="pt-10 pb-6">
        <Logo size={28} className="mb-3" />
        <p className="font-mono text-xs text-accent tracking-[0.4em] uppercase mb-2">What's next</p>
        <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Home</h1>
      </div>

      <HowItWorksStrip />

      {/* Shortlist pipeline — the artist-first loop at a glance */}
      <div className="mb-2">
        <p className="font-mono text-xs text-cream-muted tracking-widest uppercase mb-3">Shortlist pipeline</p>
        {pipelineEmpty ? (
          <div className="bg-ink-card border border-ink-border rounded-sm p-6 text-center">
            <p className="text-cream-muted/90 text-sm font-body mb-2">No artists in your collection yet.</p>
            <Link
              to="/gallery?mode=manage"
              className="text-accent hover:text-accent-hover font-body text-sm underline underline-offset-4"
            >
              Add artists to start your shortlist
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {stages.map(({ status, label, count, artists: stageArtists }) => (
                <Link
                  key={status}
                  to="/gallery"
                  className={`rounded-sm p-3 border transition-colors ${
                    status === 'contact-next'
                      ? 'bg-accent/10 border-accent/40'
                      : 'bg-ink-card border-ink-border hover:border-cream-muted/40'
                  }`}
                >
                  <p className="font-display text-2xl text-cream leading-none">{count}</p>
                  <p className="font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase mt-1.5">{label}</p>
                  <p className={`font-mono text-[0.6875rem] mt-2 leading-relaxed truncate ${status === 'contact-next' ? 'text-cream' : 'text-cream-muted/80'}`}>
                    {stageArtists.length > 0
                      ? stageArtists.slice(0, 3).map((a) => artistLabel(a)).join(' · ')
                      : '—'}
                  </p>
                </Link>
              ))}
            </div>
            {(parked > 0 || contacted > 0) && (
              <p className="font-mono text-[0.625rem] text-cream-muted/70 tracking-widest uppercase text-right mt-2">
                {contacted > 0 && <>contacted: {contacted}</>}
                {contacted > 0 && parked > 0 && ' · '}
                {parked > 0 && <>parked (maybe / pass): {parked}</>}
              </p>
            )}
          </>
        )}
      </div>

      {/* Ideas at a glance */}
      <div className="grid grid-cols-3 gap-2 mb-6 mt-4">
        <Link to="/brief" className="bg-ink-card border border-ink-border rounded-sm p-3">
          <p className="font-display text-2xl text-cream leading-none">{summary.activeIdeas.length}</p>
          <p className="font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase mt-1.5">Active ideas</p>
        </Link>
        <Link to="/brief" className="bg-ink-card border border-ink-border rounded-sm p-3">
          <p className="font-display text-2xl text-cream leading-none">{summary.exportReadyIdeas.length}</p>
          <p className="font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase mt-1.5">Briefs ready</p>
        </Link>
        <Link to="/brief?tab=boards" className="bg-ink-card border border-ink-border rounded-sm p-3">
          <p className="font-display text-2xl text-cream leading-none">{summary.openBoards.length}</p>
          <p className="font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase mt-1.5">Live boards</p>
        </Link>
      </div>

      <Panel title="Contact next" action={<Link to="/gallery?mode=manage" className="text-xs font-mono text-accent tracking-widest uppercase">Manage</Link>}>
        {summary.nextArtists.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {summary.nextArtists.slice(0, 4).map((artist) => {
              const conventions = mergedConventions.filter((c) => c.attendingArtistIds.includes(artist.id))
              return (
                <Link
                  key={artist.id}
                  to="/gallery"
                  className="flex items-center gap-3 bg-ink-card border border-accent/25 rounded-sm px-3 py-3"
                >
                  {artist.images?.[0] && (
                    <img src={artist.images[0]} alt="" className="w-10 h-12 rounded-sm object-cover shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-cream text-lg leading-tight truncate">{artistLabel(artist)}</p>
                    <p className="font-mono text-[0.6875rem] text-cream-muted tracking-widest">@{artist.handle}</p>
                    {conventions.length > 0 && (
                      <p className="font-mono text-[0.625rem] text-accent/70 tracking-widest mt-1 truncate">
                        ◎ {conventions.map((c) => c.name).join(' · ')}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-xs text-accent shrink-0">#{artist.rank}</span>
                </Link>
              )
            })}
          </div>
        ) : (
          <p className="text-cream-muted/90 text-sm font-body">No artists marked contact next yet.</p>
        )}
      </Panel>

      <Panel title="Idea matches" action={<Link to="/brief" className="text-xs font-mono text-accent tracking-widest uppercase">Ideas</Link>}>
        {ideaMatches.length > 0 ? (
          <div className="grid lg:grid-cols-2 gap-3">
            {ideaMatches.slice(0, 4).map(({ idea, matches }) => {
              const status = IDEA_STATUSES.find((s) => s.value === (idea.status || 'idea'))
              return (
                <div key={idea.id} className="bg-ink-card border border-ink-border rounded-sm p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="font-display text-cream text-xl leading-tight">{idea.title || 'Untitled idea'}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {idea.tags?.map((tag) => <TagPill key={tag} tag={tag} active small />)}
                      </div>
                    </div>
                    <span className={`flex items-center gap-1.5 text-[0.6875rem] font-mono tracking-widest uppercase shrink-0 ${status?.color || 'text-cream-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOTS[status?.value] || STATUS_DOTS.idea}`} />
                      {status?.label || 'Idea'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {matches.map(({ artist, overlapTags, status }) => {
                      const rationale = buildMatchRationale(idea, { artist, overlapTags, status })
                      return (
                        <div key={artist.id} className="text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-cream-muted truncate">{artistLabel(artist)}</span>
                            <span className="font-mono text-[0.6875rem] text-accent shrink-0">{overlapTags.length} tag match</span>
                          </div>
                          {rationale && (
                            <p className="text-cream-muted/70 text-xs leading-snug mt-0.5 line-clamp-2">{rationale}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-cream-muted/90 text-sm font-body">
            <Link to="/brief" className="text-accent hover:text-accent-hover underline underline-offset-4">Tag an idea</Link>
            {' '}with styles to see matching artists here.
          </p>
        )}
      </Panel>

      <Panel title="Top ranked">
        <div className="space-y-2">
          {summary.topArtists.map((artist) => (
            <Link key={artist.id} to="/gallery" className="flex items-center gap-2.5 py-1.5">
              {artist.images?.[0] && (
                <img src={artist.images[0]} alt="" className="w-7 h-7 rounded-sm object-cover shrink-0" />
              )}
              <span className="font-body text-cream-muted truncate flex-1">{artistLabel(artist)}</span>
              <span className="font-mono text-[0.6875rem] text-cream-muted/70 shrink-0">
                #{artist.rank} · {artistStatusLabel(artist.status)}
              </span>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  )
}
