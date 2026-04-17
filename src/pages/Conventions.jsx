import { CONVENTIONS, getConventionFavicon } from '../data/conventions'

function ConventionCard({ convention }) {
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
              <span className="text-[10px] font-mono text-accent tracking-widest uppercase shrink-0 mt-1">★ Popular</span>
            )}
          </div>
          <p className="text-cream-muted text-xs font-mono mt-0.5">{convention.location}</p>
          <p className="text-cream-muted/90 text-xs font-mono mt-0.5">{convention.dates}</p>
        </div>
      </div>
      <p className="text-cream-muted text-sm font-body leading-relaxed mt-2">{convention.summary}</p>
      <p className="text-[11px] font-mono text-cream-muted/70 tracking-widest uppercase mt-3 group-hover:text-accent transition-colors">
        Visit site →
      </p>
    </a>
  )
}

export default function Conventions() {
  const popular = CONVENTIONS.filter((c) => c.popular)
  const rest = CONVENTIONS.filter((c) => !c.popular)

  return (
    <div className="min-h-screen bg-ink-black px-4 pt-safe-top pb-24">
      <div className="pt-12 pb-6">
        <p className="font-mono text-[12px] text-accent tracking-[0.3em] uppercase mb-1">Tattoo</p>
        <h1 className="font-display text-3xl text-cream">Convention Radar</h1>
        <p className="text-cream-muted/80 text-xs font-mono mt-2">Popular UK tattoo conventions. Dates are 2026 editions.</p>
      </div>

      <section className="mb-8">
        <h2 className="text-[12px] font-mono text-accent tracking-widest uppercase mb-3">★ Highlights</h2>
        <div className="space-y-3">
          {popular.map((c) => (
            <ConventionCard key={c.id} convention={c} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[12px] font-mono text-cream-muted tracking-widest uppercase mb-3">More shows</h2>
        <div className="space-y-3">
          {rest.map((c) => (
            <ConventionCard key={c.id} convention={c} />
          ))}
        </div>
      </section>
    </div>
  )
}
