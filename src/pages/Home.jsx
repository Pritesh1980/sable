import { Link } from 'react-router'
import { ArrowRight, Plus } from 'lucide-react'
import { LogoMark } from '../components/Logo'
import ArtistImage from '../components/ArtistImage'
import RefImage from '../components/RefImage'
import DemoIntro from '../components/DemoIntro'
import { nextStep, topArtists, homeIdeas } from '../data/homeNext'
import { useAuth } from '../context/useAuth'
import { backend } from '../backend'
import { OWNER_SEED_ENABLED } from '../backend/owner'
import { isDemoSession, canOfferDemo } from '../data/demoSeed'

// Home is a start page (#220): what Sable is, the artists and ideas that
// matter most, and one thing to do next. The wall it used to be now lives in
// Artists. Themed colours on purpose, so it follows the light and dark setting.

const artistLabel = (artist) => artist.name || `@${artist.handle}`
const conceptImage = (concept) =>
  concept.variants?.find((v) => v.isBest && v.imageUrl)?.imageUrl || concept.imageUrl || concept.variants?.find((v) => v.imageUrl)?.imageUrl || null

const rise = (step) => ({ animationDelay: `${step * 70}ms`, animationFillMode: 'both' })

function Section({ id, title, count, action, step, children }) {
  return (
    <section aria-labelledby={id} className="mt-12 animate-slide-up motion-reduce:animate-none" style={rise(step)}>
      <div className="flex items-end justify-between gap-4 border-b border-ink-border pb-2 mb-4">
        <h2 id={id} className="font-display text-2xl text-cream leading-none">
          {title}
          {count > 0 && <span className="font-mono text-xs text-cream-muted/70 tracking-widest ml-3 align-middle">{count}</span>}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

const actionClass = 'inline-flex items-center gap-1.5 min-h-11 font-mono text-xs text-accent hover:text-cream tracking-widest uppercase transition-colors shrink-0'

// An empty row says what the thing is before asking for one (#220, group C).
function Empty({ definition, to, cta, children }) {
  return (
    <div className="border border-dashed border-ink-border rounded-xs px-5 py-6">
      <p className="font-body text-sm text-cream-muted leading-relaxed max-w-prose">{definition}</p>
      <Link
        to={to}
        className="inline-flex items-center gap-2 min-h-11 mt-4 px-4 border border-accent/50 hover:border-accent text-accent hover:text-cream font-mono text-xs tracking-widest uppercase rounded-xs transition-colors"
      >
        <Plus size={14} aria-hidden="true" />
        {cta}
      </Link>
      {children}
    </div>
  )
}

function DemoOffer() {
  const { signOut } = useAuth() || {}
  const offered = canOfferDemo({
    offlineAuth: backend.capabilities.offlineAuth,
    ownerSeedEnabled: OWNER_SEED_ENABLED,
    demoActive: isDemoSession(),
  })
  if (!offered) return null
  // Sign-out first is required: maybeSeedDemo refuses to write over a session.
  // So is the full page load: seeding runs at boot in main.jsx, before render.
  return (
    <button
      onClick={async () => {
        await signOut?.()
        window.location.href = `${import.meta.env.BASE_URL}?demo=1`
      }}
      className="block min-h-11 mt-2 font-mono text-[0.6875rem] text-cream-muted hover:text-accent tracking-widest uppercase transition-colors"
    >
      Or view the demo →
    </button>
  )
}

export default function Home({ artists = [], ideas = [], concepts = [] }) {
  const top = topArtists(artists, 6)
  const next = nextStep({ artists, ideas, concepts })
  const shownIdeas = homeIdeas(ideas, 3)
  const shownConcepts = concepts.slice(0, 4)

  return (
    <main className="min-h-screen bg-ink-black pt-safe-top">
      <DemoIntro />
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-10 pb-16">
        <header className="animate-slide-up motion-reduce:animate-none" style={rise(0)}>
          <h1 className="flex items-center gap-3 font-display text-5xl md:text-6xl text-cream leading-none tracking-tight">
            <LogoMark size={36} className="text-accent shrink-0" />
            Sable
          </h1>
          <p className="font-display text-xl md:text-2xl text-cream/90 leading-snug mt-5 max-w-xl">
            Every tattoo artist you love, in one place.
          </p>
          <p className="font-body text-sm text-cream-muted leading-relaxed mt-2 max-w-xl">
            Save their work, keep your own ideas beside it, and work out who should do which piece.
          </p>
        </header>

        <Link
          to={next.to}
          className="group flex items-center justify-between gap-4 mt-8 pl-4 pr-3 py-3 min-h-16 bg-ink-card border border-ink-border border-l-2 border-l-accent hover:border-accent/60 hover:border-l-accent rounded-xs transition-colors animate-slide-up motion-reduce:animate-none"
          style={rise(1)}
        >
          <span className="min-w-0">
            <span className="block font-mono text-[0.6875rem] text-accent tracking-[0.3em] uppercase">Next</span>
            <span className="block font-display text-lg text-cream leading-tight mt-1">{next.label}</span>
            {next.detail && <span className="block font-body text-xs text-cream-muted mt-0.5">{next.detail}</span>}
          </span>
          <ArrowRight size={20} aria-hidden="true" className="shrink-0 text-cream-muted group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
        </Link>

        <Section
          id="home-artists"
          title="Top artists"
          count={artists.length}
          step={2}
          action={artists.length > 0 && (
            <Link to="/gallery" className={actionClass}>See all {artists.length}<ArrowRight size={14} aria-hidden="true" /></Link>
          )}
        >
          {artists.length === 0 ? (
            <Empty
              definition="Save the tattooists whose work you would wear. Each one keeps their photos, styles and where they work, and you put them in order as your taste settles."
              to="/gallery?add=1"
              cta="Add an artist"
            >
              <DemoOffer />
            </Empty>
          ) : (
            // The first tile is your number one and takes a 2x2 block; a phone
            // shows six tiles (1 + 2 + 3), a laptop five (1 + 4).
            <ol className="grid grid-cols-3 md:grid-cols-4 gap-1.5">
              {top.map((artist, i) => (
                <li
                  key={artist.id}
                  className={i === 0 ? 'col-span-2 row-span-2' : i === 5 ? 'md:hidden' : ''}
                >
                  <Link
                    to={`/gallery?artist=${encodeURIComponent(artist.id)}`}
                    className="group relative block h-full aspect-[4/5] overflow-hidden rounded-xs bg-ink-card focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ArtistImage
                      src={artist.images?.[0]}
                      label={artistLabel(artist)}
                      alt=""
                      loading={i === 0 ? 'eager' : 'lazy'}
                      sizes={i === 0 ? '(max-width: 768px) 66vw, 500px' : '(max-width: 768px) 33vw, 250px'}
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 motion-reduce:transition-none"
                      fallbackClassName="w-full h-full"
                    />
                    <span className="absolute inset-x-0 bottom-0 flex items-baseline gap-2 px-2.5 pt-8 pb-2 bg-gradient-to-t from-black/85 to-transparent">
                      <span className="font-mono text-[0.625rem] text-white/60 tabular-nums" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
                      <span className={`font-display text-white leading-tight truncate ${i === 0 ? 'text-lg' : 'text-xs md:text-sm'}`}>{artistLabel(artist)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Section>

        <Section
          id="home-ideas"
          title="Ideas"
          count={ideas.length}
          step={3}
          action={ideas.length > 0 && (
            <Link to="/brief?new=1" className={actionClass}><Plus size={14} aria-hidden="true" />New idea</Link>
          )}
        >
          {ideas.length === 0 ? (
            <Empty
              definition="An idea is a tattoo you want: a title, where on the body it goes, the styles it suits and any reference photos. Sable then suggests which of your artists fit it."
              to="/brief?new=1"
              cta="Write your first idea"
            />
          ) : (
            <>
              <ul className="grid gap-1.5 sm:grid-cols-3">
                {shownIdeas.map((idea) => (
                  <li key={idea.id}>
                    <Link
                      to={`/brief?idea=${encodeURIComponent(idea.id)}`}
                      className="group flex items-center gap-3 p-2 min-h-16 bg-ink-card border border-ink-border hover:border-accent/50 rounded-xs transition-colors"
                    >
                      <span className="w-12 h-12 shrink-0 overflow-hidden rounded-xs bg-ink-muted flex items-center justify-center text-cream-muted" aria-hidden="true">
                        <RefImage src={idea.images?.[0]} alt="" className="w-full h-full object-cover" fallback="◇" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-display text-base text-cream leading-tight truncate group-hover:text-accent transition-colors">{idea.title || 'Untitled idea'}</span>
                        <span className="block font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase mt-1">
                          {idea.status === 'done' ? 'Done' : idea.status === 'booked' ? 'Booked' : idea.linkedArtists?.length > 0 ? `${idea.linkedArtists.length} ${idea.linkedArtists.length === 1 ? 'artist' : 'artists'}` : 'No artist yet'}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {ideas.length > shownIdeas.length && (
                <Link to="/brief" className={`${actionClass} mt-2`}>All {ideas.length} ideas<ArrowRight size={14} aria-hidden="true" /></Link>
              )}
            </>
          )}
        </Section>

        <Section
          id="home-concepts"
          title="AI concepts"
          count={concepts.length}
          step={4}
          action={concepts.length > 0 && (
            <Link to="/concepts?new=1" className={actionClass}><Plus size={14} aria-hidden="true" />New concept</Link>
          )}
        >
          {concepts.length === 0 ? (
            <Empty
              definition="A concept is a picture of an idea, drawn by AI from your description. It is a sketch to show an artist what you mean, not a finished design."
              to="/concepts?new=1"
              cta="Make your first concept"
            />
          ) : (
            <>
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {shownConcepts.map((concept) => (
                  <li key={concept.id}>
                    <Link
                      to={`/concepts?concept=${encodeURIComponent(concept.id)}`}
                      aria-label={concept.prompt || 'Concept'}
                      className="group relative block aspect-square overflow-hidden rounded-xs bg-ink-card border border-ink-border hover:border-accent/50 transition-colors"
                    >
                      <RefImage
                        src={conceptImage(concept)}
                        alt=""
                        className="w-full h-full object-cover"
                        fallback={<span className="absolute inset-0 p-3 font-body text-xs text-cream-muted leading-snug line-clamp-5">{concept.prompt}</span>}
                      />
                    </Link>
                  </li>
                ))}
              </ul>
              {concepts.length > shownConcepts.length && (
                <Link to="/concepts" className={`${actionClass} mt-2`}>All {concepts.length} concepts<ArrowRight size={14} aria-hidden="true" /></Link>
              )}
            </>
          )}
        </Section>
      </div>
    </main>
  )
}
