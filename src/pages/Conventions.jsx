import { CONVENTIONS, getConventionFavicon } from '../data/conventions'
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
      <div className={`${size} shrink-0 bg-ink-muted rounded-sm flex items-center justify-center`}>
        <span className="font-display text-cream-muted/40">{convention.name[0]}</span>
      </div>
    )
  }
  return (
    <div className={`${size} shrink-0 bg-ink-muted rounded-sm overflow-hidden flex items-center justify-center`}>
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

function HeroCard({ convention }) {
  return (
    <a
      href={convention.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-gradient-to-br from-accent/10 to-ink-card border border-accent/40 rounded-sm p-6 transition-colors hover:border-accent/70 animate-slide-up"
    >
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
      <p className="text-xs font-mono text-accent tracking-widest uppercase mt-4 group-hover:underline">More info →</p>
    </a>
  )
}

function ConventionCard({ convention }) {
  return (
    <a
      href={convention.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex flex-col bg-ink-card border rounded-sm p-5 transition-colors animate-slide-up ${
        convention.popular
          ? 'border-accent/30 hover:border-accent/60'
          : 'border-ink-border hover:border-cream-muted/50'
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

      <p className="text-[0.6875rem] font-mono text-cream-muted/70 tracking-widest uppercase mt-4 group-hover:text-accent transition-colors">
        More info →
      </p>
    </a>
  )
}

export default function Conventions() {
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

        {local.map((c) => <HeroCard key={c.id} convention={c} />)}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
          {rest.map((c) => <ConventionCard key={c.id} convention={c} />)}
        </div>
      </div>
    </div>
  )
}
