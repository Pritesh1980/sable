import { useMemo, useState } from 'react'
import { buildShowPlan } from '../data/showPlan'
import { buildShowRoute, formatRoute } from '../data/showRoute'
import { LineupRow } from './ConventionLineup'

// Not an alphabetical list — a verdict. Must see is your own gallery showing
// up in this line-up; From the field guide is a researched pick that ships
// with the app and is not in your gallery; Worth a look is a stablemate at a
// studio you already follow. Everyone else in the 466 stays in the plain A-Z index, one tap away
// on the All view, rather than crowding a page meant to be short.
function Section({ title, subtitle, picks, convention, attendingIds, onAddArtist, onToggleAttending }) {
  if (picks.length === 0) return null
  return (
    <section className="mt-4 first:mt-0">
      <h3 className="font-display text-cream text-base">{title}</h3>
      <p className="text-cream-muted/60 text-[0.6875rem] font-mono mt-0.5">{subtitle}</p>
      <ul className="mt-1.5">
        {picks.map((pick) => (
          <LineupRow
            key={pick.entry.handle || pick.entry.label}
            entry={pick.entry}
            convention={convention}
            attending={attendingIds.includes(pick.entry.savedArtistId)}
            onAddArtist={onAddArtist}
            onToggleAttending={onToggleAttending}
            footer={
              pick.reasons.length > 0 && (
                <p className="text-[0.6875rem] font-mono text-accent/70 pb-1">{pick.reasons.join(' · ')}</p>
              )
            }
          />
        ))}
      </ul>
    </section>
  )
}

const toggleClass = (on) =>
  `min-h-11 px-2.5 flex items-center text-[0.625rem] font-mono tracking-widest uppercase border rounded-xs transition-colors ${
    on
      ? 'border-accent bg-accent/10 text-accent'
      : 'border-ink-border text-cream-muted/60 hover:text-cream hover:border-cream-muted'
  }`

function CopyRoute({ text }) {
  const [state, setState] = useState('idle')
  const [fallback, setFallback] = useState('')
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      // No clipboard permission: show the text so it can be selected by hand.
      setFallback(text)
      setState('idle')
    }
  }
  return (
    <>
      <button onClick={copy} className={toggleClass(false)}>
        {state === 'copied' ? 'Copied ✓' : 'Copy route'}
      </button>
      {fallback && (
        <textarea
          readOnly
          aria-label="Route text"
          value={fallback}
          rows={8}
          onFocus={(e) => e.target.select()}
          className="mt-2 w-full bg-ink-black border border-ink-border focus:border-accent outline-hidden rounded-xs p-2 text-cream text-[0.6875rem] font-mono"
        />
      )}
    </>
  )
}

// The picks you set out to see, in the order you would reach them from the
// doors. Pickups are hints under a stop, not rows of their own: they are in
// the ranked view already, and here they only say "while you are there".
function RouteView({ route, title, convention, attendingIds, onAddArtist, onToggleAttending }) {
  const row = ({ pick }, footer) => (
    <LineupRow
      key={pick.entry.handle || pick.entry.label}
      entry={pick.entry}
      convention={convention}
      attending={attendingIds.includes(pick.entry.savedArtistId)}
      onAddArtist={onAddArtist}
      onToggleAttending={onToggleAttending}
      footer={footer}
    />
  )
  return (
    <div className="mt-3">
      <p className="text-cream-muted/70 text-[0.6875rem] font-mono">
        Ordered across the floor from the entrance, based on the show&rsquo;s published plan.
      </p>
      <div className="mt-1.5">
        <CopyRoute text={formatRoute(route, { title })} />
      </div>
      {route.stops.length === 0 ? (
        <p className="text-cream-muted/60 text-xs font-mono mt-3">None of your picks are on the floor plan.</p>
      ) : (
        <ol aria-label="Route" className="mt-1.5">
          {route.stops.map((stop, i) => row(stop, (
            <div className="pb-1 text-[0.6875rem] font-mono">
              <p className="text-accent/70">
                {/* The row truncates its note on a narrow phone, and the booth
                    is the one thing a walking order is for, so repeat it here. */}
                {[`Stop ${i + 1}`, `Booth ${stop.booth}`, ...stop.pick.reasons].join(' · ')}
              </p>
              {stop.nearby.map((n) => (
                <p key={n.pick.entry.handle || n.pick.entry.label} className="text-cream-muted/70">
                  Close by: {n.pick.entry.label}, Booth {n.booth}
                </p>
              ))}
            </div>
          )))}
        </ol>
      )}
      {route.elsewhere.length > 0 && (
        <section className="mt-4">
          <h3 className="font-display text-cream text-base">Elsewhere in the hall</h3>
          <p className="text-cream-muted/60 text-[0.6875rem] font-mono mt-0.5">
            Not on the floor plan: ask at the door or look for them on the day
          </p>
          <ul className="mt-1.5">
            {route.elsewhere.map((e) => row(e, e.pick.reasons.length > 0 && (
              <p className="text-[0.6875rem] font-mono text-accent/70 pb-1">{e.pick.reasons.join(' · ')}</p>
            )))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default function ShowPlanView({
  convention,
  entries = [],
  artists = [],
  studios = [],
  attendingIds = [],
  curated = {},
  floorplan = null,
  onAddArtist = () => {},
  onToggleAttending = () => {},
}) {
  const [order, setOrder] = useState('ranked')
  const plan = useMemo(
    () => buildShowPlan(entries, { artists, studios, attendingIds, curated }),
    [entries, artists, studios, attendingIds, curated]
  )
  const route = useMemo(() => (floorplan ? buildShowRoute(plan, floorplan) : null), [plan, floorplan])

  if (
    plan.mustSee.length === 0 &&
    plan.fieldGuide.length === 0 &&
    plan.suggested.length === 0 &&
    plan.wildcards.length === 0 &&
    plan.missing.length === 0
  ) {
    return (
      <p className="text-cream-muted/60 text-xs font-mono mt-3">
        No picks yet — nobody in this line-up is in your gallery, or at a studio you follow.
      </p>
    )
  }

  const orderToggle = route && (
    // Set apart by a rule, so it does not read as more of the view chips above.
    <div role="group" aria-label="Order" className="flex flex-wrap gap-1.5 mb-3 pt-2 border-t border-ink-border/40">
      <button onClick={() => setOrder('ranked')} aria-pressed={order === 'ranked'} className={toggleClass(order === 'ranked')}>
        Ranked
      </button>
      <button onClick={() => setOrder('route')} aria-pressed={order === 'route'} className={toggleClass(order === 'route')}>
        Walking order
      </button>
    </div>
  )

  if (route && order === 'route') {
    return (
      <div className="mt-2">
        {orderToggle}
        <RouteView
          route={route}
          title={convention?.label || convention?.name || ''}
          convention={convention}
          attendingIds={attendingIds}
          onAddArtist={onAddArtist}
          onToggleAttending={onToggleAttending}
        />
      </div>
    )
  }

  return (
    <div className="mt-2">
      {orderToggle}
      <Section
        title="Must see"
        subtitle="Already in your gallery, and at this show"
        picks={plan.mustSee}
        convention={convention}
        attendingIds={attendingIds}
        onAddArtist={onAddArtist}
        onToggleAttending={onToggleAttending}
      />
      {/* The curated list ships to every user, so it never claims to be the
          user's own gallery (#160). */}
      <Section
        title="From the field guide"
        subtitle="Researched before the show; not in your gallery yet"
        picks={plan.fieldGuide}
        convention={convention}
        attendingIds={attendingIds}
        onAddArtist={onAddArtist}
        onToggleAttending={onToggleAttending}
      />
      <Section
        title="Wildcards"
        subtitle="Suggested from your taste, not yet judged — go and decide"
        picks={plan.wildcards}
        convention={convention}
        attendingIds={attendingIds}
        onAddArtist={onAddArtist}
        onToggleAttending={onToggleAttending}
      />
      <Section
        title="Worth a look"
        subtitle="A stablemate at a studio you already follow"
        picks={plan.suggested}
        convention={convention}
        attendingIds={attendingIds}
        onAddArtist={onAddArtist}
        onToggleAttending={onToggleAttending}
      />

      {plan.missing.length > 0 && (
        <section className="mt-4">
          <h3 className="font-display text-cream text-base">Not in the line-up</h3>
          <p className="text-cream-muted/60 text-[0.6875rem] font-mono mt-0.5">
            In the field guide, but this line-up doesn&rsquo;t list them — check with the show
          </p>
          <ul className="mt-1.5">
            {plan.missing.map((m) => (
              <li key={m.handle} className="py-1 border-b border-ink-border/40 last:border-b-0">
                <a
                  href={`https://instagram.com/${m.handle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-cream text-sm font-body hover:text-accent transition-colors"
                >
                  @{m.handle}
                </a>
                {m.why && (
                  <p className="text-[0.6875rem] font-mono text-cream-muted/60">{m.why}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
