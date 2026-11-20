import { Link } from 'react-router'
import { Check, Plus } from 'lucide-react'
import { SampleArtistButton } from './SampleArtistNotice'

// Plan with nobody saved (#220, groups C and D): three steps, one at a time,
// instead of seven panels of zeros. Only the current step has a button.
export default function StartChecklist({ ideas = [], setArtists }) {
  const steps = [
    { title: 'Add an artist', detail: 'Save a tattooist whose work you would wear. One photo is enough to start.', done: false },
    { title: 'Put them in order', detail: 'Rank your artists. When two suit an idea equally, the higher one comes first.', done: false },
    { title: 'Write an idea', detail: 'A tattoo you want. Plan puts it beside the artists who suit it.', done: ideas.length > 0 },
  ]
  const current = steps.findIndex((s) => !s.done)

  return (
    <ol aria-label="Getting started" className="border-t border-ink-border">
      {steps.map((step, i) => {
        const isCurrent = i === current
        return (
          <li
            key={step.title}
            aria-current={isCurrent ? 'step' : undefined}
            className={`flex gap-4 border-b border-ink-border py-5 ${isCurrent ? '' : 'opacity-60'}`}
          >
            <span
              aria-hidden="true"
              className={`flex items-center justify-center w-8 h-8 shrink-0 rounded-full border font-mono text-xs ${
                isCurrent ? 'border-accent text-accent' : 'border-ink-border text-cream-muted'
              }`}
            >
              {step.done ? <Check size={14} /> : i + 1}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-xl text-cream leading-tight">
                {step.title}
                {step.done && <span className="font-mono text-[0.6875rem] text-cream-muted tracking-widest uppercase ml-3 align-middle">Done</span>}
              </h2>
              <p className="font-body text-sm text-cream-muted leading-relaxed mt-1 max-w-prose">{step.detail}</p>
              {isCurrent && i === 0 && (
                <>
                  <Link
                    to="/gallery?add=1"
                    className="inline-flex items-center gap-2 min-h-11 mt-4 px-4 border border-accent/50 hover:border-accent text-accent hover:text-cream font-mono text-xs tracking-widest uppercase rounded-xs transition-colors"
                  >
                    <Plus size={14} aria-hidden="true" />
                    Add an artist
                  </Link>
                  <SampleArtistButton setArtists={setArtists} />
                </>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
