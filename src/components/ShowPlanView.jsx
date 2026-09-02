import { useMemo } from 'react'
import { buildShowPlan } from '../data/showPlan'
import { LineupRow } from './ConventionLineup'

// Not an alphabetical list — a verdict. Must see is your own gallery showing
// up in this line-up; Worth a look is a stablemate at a studio you already
// follow. Everyone else in the 466 stays in the plain A-Z index, one tap away
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

export default function ShowPlanView({
  convention,
  entries = [],
  artists = [],
  studios = [],
  attendingIds = [],
  onAddArtist = () => {},
  onToggleAttending = () => {},
}) {
  const plan = useMemo(
    () => buildShowPlan(entries, { artists, studios, attendingIds }),
    [entries, artists, studios, attendingIds]
  )

  if (plan.mustSee.length === 0 && plan.suggested.length === 0) {
    return (
      <p className="text-cream-muted/60 text-xs font-mono mt-3">
        No picks yet — nobody in this line-up is in your gallery, or at a studio you follow.
      </p>
    )
  }

  return (
    <div className="mt-2">
      <Section
        title="Must see"
        subtitle="Already in your gallery, and at this show"
        picks={plan.mustSee}
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
    </div>
  )
}
