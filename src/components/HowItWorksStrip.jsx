import { useState } from 'react'
import { Link } from 'react-router-dom'

// Device-local on purpose: dismissing the guide on your Mac shouldn't dismiss
// it on your phone, and it must never enter the synced collections.
const GUIDE_KEY = 'tattoo_guide_dismissed'

const STEPS = [
  { n: 1, label: 'Curate your artists', to: '/gallery?mode=manage' },
  { n: 2, label: 'Rank & shortlist', to: '/gallery' },
  { n: 3, label: 'Match ideas & contact', to: '/brief' },
]

export default function HowItWorksStrip() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(GUIDE_KEY) === '1')

  if (dismissed) return null

  function dismiss() {
    localStorage.setItem(GUIDE_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="relative bg-ink-card border border-ink-border rounded-sm p-4 mb-6 animate-slide-up">
      <button
        onClick={dismiss}
        aria-label="Dismiss guide"
        title="Dismiss"
        className="absolute top-2.5 right-3 text-cream-muted/60 hover:text-cream text-xs"
      >
        ✕
      </button>
      <p className="font-mono text-[0.625rem] text-cream-muted tracking-widest uppercase mb-3">How Sable works</p>
      <div className="flex gap-3">
        {STEPS.map(({ n, label, to }) => (
          <Link key={n} to={to} className="flex-1 group">
            <p className="font-mono text-[0.6875rem] text-accent">{n}</p>
            <p className="font-body text-cream text-sm leading-snug mt-0.5 group-hover:text-accent transition-colors">{label}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
