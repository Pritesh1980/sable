import { useState } from 'react'
import { isDemoSession, DEMO_INTRO_KEY } from '../data/demoSeed'

// The demo is where the README badge and the Login page's "view the demo" link
// both land, and it drops the visitor straight onto a fully populated Wall —
// six invented artists, no explanation. This strip is the only place the
// proposition reaches someone who never read the README.
//
// Demo sessions only: a real account gets no product copy on its own wall. And
// dismissible, because it is an introduction rather than a banner — the whole
// point of the Wall is the work, so this gets out of the way and stays gone.
export default function DemoIntro() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DEMO_INTRO_KEY) === '1')

  // isDemoSession() re-reads storage rather than taking a prop: the Wall renders
  // before any auth context settles, and a wrong answer here would flash product
  // copy onto a real user's collection.
  if (dismissed || !isDemoSession()) return null

  function dismiss() {
    localStorage.setItem(DEMO_INTRO_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="border-b border-v2-hairline bg-v2-surface animate-slide-up">
      <div className="relative mx-auto max-w-3xl px-5 py-4 sm:px-8 sm:py-5">
        <button
          onClick={dismiss}
          aria-label="Dismiss introduction"
          title="Dismiss"
          className="absolute top-1 right-1 w-11 h-11 flex items-center justify-center text-v2-muted hover:text-v2-cream text-sm leading-none transition-colors"
        >
          ✕
        </button>
        {/* pr-8 keeps the copy clear of the dismiss control on a narrow phone,
            where the strip is at its tightest. */}
        <p className="font-v2-display text-v2-cream text-base sm:text-lg tracking-wide pr-8">
          Every tattoo artist you love, in one place.
        </p>
        {/* Kept to two lines on a phone: this strip sits above the masonry, and
            the work is what the demo is here to show. */}
        <p className="font-v2-ui text-v2-muted text-xs sm:text-sm mt-1.5 leading-relaxed pr-8">
          A demo collection of six invented artists — change anything you like, it stays
          in this browser.
        </p>
      </div>
    </div>
  )
}
