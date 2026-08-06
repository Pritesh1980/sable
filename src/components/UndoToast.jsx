import { useEffect, useRef } from 'react'

/**
 * Transient "…removed — Undo" bar. Sits above the fixed bottom nav (z-50) and its
 * safe-area inset, so it never hides behind the nav on an iPhone.
 *
 * Deliberately not focus-stealing: removal is something the user just did, so the
 * offer is announced politely rather than interrupting what they are doing. It
 * does hand focus *back*, though — see below.
 */
export default function UndoToast({ message, show, onUndo, actionLabel }) {
  const label = actionLabel || 'Undo'
  const hasAction = !!onUndo
  // Whatever had focus when the action appeared, so it can be returned when the
  // action goes away.
  const returnToRef = useRef(null)

  // The action is removed on undo and on expiry. If it held focus at that
  // moment, focus would fall to <body> — outside whatever dialog the user was
  // working in, and stuck there until the next Tab (#60).
  useEffect(() => {
    if (!show || !hasAction) return undefined

    // Follow focus while the action exists rather than sampling once on mount:
    // at mount nothing is focused yet, and the element to come back to is
    // whatever the user was on immediately before reaching for Undo.
    const remember = (el) => {
      if (el && el !== document.body && !el.closest?.('[data-undo-toast]')) returnToRef.current = el
    }
    remember(document.activeElement)
    const onFocusIn = (e) => remember(e.target)
    document.addEventListener('focusin', onFocusIn)

    return () => {
      document.removeEventListener('focusin', onFocusIn)
      // Only step in if the disappearing button really did hold focus.
      const now = document.activeElement
      if (now && now !== document.body) return
      const target = returnToRef.current
      if (target?.isConnected && typeof target.focus === 'function') {
        target.focus()
        return
      }
      // The surface it came from has gone too; fall back to whatever modal is
      // open so focus stays inside the trap rather than on <body>.
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      dialogs[dialogs.length - 1]?.focus?.()
    }
  }, [show, hasAction])

  if (!show) return null

  return (
    <div
      role="status"
      aria-live="polite"
      // Modal focus traps look for this so Undo stays reachable by keyboard
      // while a dialog is open — it paints above them but lives outside (#58).
      data-undo-toast=""
      className="fixed left-1/2 -translate-x-1/2 z-[60] bottom-[calc(env(safe-area-inset-bottom,0px)+4.5rem)] w-[min(24rem,calc(100vw-2rem))] flex items-center justify-between gap-3 pl-4 pr-1.5 py-1.5 bg-ink-dark/95 backdrop-blur-xs border border-ink-border rounded-xs shadow-lg"
    >
      <span className="font-body text-sm text-cream">{message}</span>
      {/* No action when this is a confirmation of what just happened — there is
          nothing left to undo, so an inert button would be a lie. */}
      {hasAction && (
        <button
          onClick={onUndo}
          className="shrink-0 min-h-11 min-w-11 px-3 font-mono text-xs uppercase tracking-widest text-accent rounded-xs outline-hidden focus-visible:ring-2 focus-visible:ring-accent hover:bg-accent/10 transition-colors"
        >
          {label}
        </button>
      )}
    </div>
  )
}
