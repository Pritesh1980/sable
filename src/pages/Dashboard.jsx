import { Link } from 'react-router-dom'
import Logo from '../components/Logo'
import TagPill from '../components/TagPill'
import { IDEA_STATUSES } from '../data/brief'
import { ARTIST_STATUSES, buildDashboardSummary, matchArtistsForIdea, normalizeArtistStatus } from '../data/planning'

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

export default function Dashboard({ artists, ideas, boards }) {
  const summary = buildDashboardSummary({ artists, ideas, boards })
  const ideaMatches = summary.activeIdeas
    .map((idea) => ({ idea, matches: matchArtistsForIdea(idea, artists).slice(0, 3) }))
    .filter(({ matches }) => matches.length > 0)

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-10 pb-6">
        <Logo size={28} className="mb-3" />
        <p className="font-mono text-xs text-accent tracking-[0.4em] uppercase mb-2">Planning</p>
        <h1 className="font-display text-5xl text-cream leading-none tracking-tight">Dashboard</h1>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6">
        <Link to="/brief" className="bg-ink-card border border-ink-border rounded-sm p-4">
          <p className="font-display text-3xl text-cream leading-none">{summary.activeIdeas.length}</p>
          <p className="font-mono text-[0.6875rem] text-cream-muted tracking-widest uppercase mt-2">Active ideas</p>
        </Link>
        <Link to="/brief" className="bg-ink-card border border-ink-border rounded-sm p-4">
          <p className="font-display text-3xl text-cream leading-none">{summary.exportReadyIdeas.length}</p>
          <p className="font-mono text-[0.6875rem] text-cream-muted tracking-widest uppercase mt-2">Briefs ready</p>
        </Link>
        <Link to="/gallery" className="bg-ink-card border border-ink-border rounded-sm p-4">
          <p className="font-display text-3xl text-cream leading-none">{summary.nextArtists.length}</p>
          <p className="font-mono text-[0.6875rem] text-cream-muted tracking-widest uppercase mt-2">Contact next</p>
        </Link>
        <Link to="/boards" className="bg-ink-card border border-ink-border rounded-sm p-4">
          <p className="font-display text-3xl text-cream leading-none">{summary.openBoards.length}</p>
          <p className="font-mono text-[0.6875rem] text-cream-muted tracking-widest uppercase mt-2">Live boards</p>
        </Link>
      </div>

      <Panel title="Next artists" action={<Link to="/manage" className="text-xs font-mono text-accent tracking-widest uppercase">Manage</Link>}>
        {summary.nextArtists.length > 0 ? (
          <div className="space-y-2">
            {summary.nextArtists.slice(0, 4).map((artist) => (
              <Link
                key={artist.id}
                to="/gallery"
                className="flex items-center justify-between gap-3 bg-ink-card border border-accent/25 rounded-sm px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="font-display text-cream text-lg leading-tight truncate">{artistLabel(artist)}</p>
                  <p className="font-mono text-[0.6875rem] text-cream-muted tracking-widest">@{artist.handle}</p>
                </div>
                <span className="font-mono text-xs text-accent shrink-0">#{artist.rank}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-cream-muted/90 text-sm font-body">No artists marked contact next yet.</p>
        )}
      </Panel>

      <Panel title="Idea matches" action={<Link to="/brief" className="text-xs font-mono text-accent tracking-widest uppercase">Brief</Link>}>
        {ideaMatches.length > 0 ? (
          <div className="space-y-3">
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
                    {matches.map(({ artist, overlapTags }) => (
                      <div key={artist.id} className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-cream-muted truncate">{artistLabel(artist)}</span>
                        <span className="font-mono text-[0.6875rem] text-accent shrink-0">{overlapTags.length} tag match</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-cream-muted/90 text-sm font-body">Add style tags to ideas to see artist matches.</p>
        )}
      </Panel>

      <Panel title="Top ranked">
        <div className="space-y-2">
          {summary.topArtists.map((artist) => (
            <Link key={artist.id} to="/gallery" className="flex items-center justify-between gap-3 py-2">
              <span className="font-body text-cream-muted truncate">{artistLabel(artist)}</span>
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
