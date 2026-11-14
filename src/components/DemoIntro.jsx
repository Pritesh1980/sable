import { useState } from 'react'
import { isDemoSession, DEMO_INTRO_KEY } from '../data/demoSeed'

// The demo is where the README badge and the Login page's "view the demo" link
// both land. Home says what Sable is (#220); this strip, above it, only says
// that the six artists are invented and where edits go.
//
// Demo sessions only, and dismissible: it is a note, not a banner.
export default function DemoIntro() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DEMO_INTRO_KEY) === '1')

  // isDemoSession() re-reads storage rather than taking a prop: Home renders
  // before any auth context settles, and a wrong answer here would flash demo
  // copy onto a real user's collection.
  if (dismissed || !isDemoSession()) return null

  function dismiss() {
    localStorage.setItem(DEMO_INTRO_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="border-b border-ink-border bg-ink-card animate-slide-up">
      <div className="relative mx-auto max-w-3xl px-5 py-4 sm:px-8 sm:py-5">
        <button
          onClick={dismiss}
          aria-label="Dismiss introduction"
          title="Dismiss"
          className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center text-cream-muted hover:text-cream text-sm leading-none transition-colors"
        >
          ✕
        </button>
        {/* pr-8 keeps the copy clear of the dismiss control on a narrow phone,
            where the strip is at its tightest. */}
        <p className="font-display text-cream text-base sm:text-lg pr-8">
          You are looking at the demo.
        </p>
        {/* Kept to two lines on a phone. */}
        <p className="font-body text-cream-muted text-xs sm:text-sm mt-1.5 leading-relaxed pr-8">
          Six invented artists with AI-generated imagery. Edits stay in this browser;
          demo updates reset artists and ideas.
        </p>
      </div>
    </div>
  )
}
