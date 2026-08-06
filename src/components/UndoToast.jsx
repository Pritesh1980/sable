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
  // Whether focus was inside the toast at the moment its action went away.
  const heldFocusRef = useRef(false)

  // The action is removed on undo and on expiry. If it held focus at that
  // moment, focus would fall to <body> — outside whatever dialog the user was
  // working in, and stuck there until the next Tab (#60).
  useEffect(() => {
    if (!show || !hasAction) return undefined

    // Follow focus while the action exists rather than sampling once on mount:
    // at mount nothing is focused yet, and the element to come back to is
    // whatever the user was on immediately before reaching for Undo.
    const isOurs = (el) => !!el?.closest?.('[data-undo-toast]')
    const track = (el) => {
      heldFocusRef.current = isOurs(el)
      if (el && el !== document.body && !isOurs(el)) returnToRef.current = el
    }
    track(document.activeElement)
    const onFocusIn = (e) => track(e.target)
    document.addEventListener('focusin', onFocusIn)

    return () => {
      document.removeEventListener('focusin', onFocusIn)
      // Only step in if the disappearing button really did hold focus. Focus
      // resting on <body> is not proof of that — the user may simply have
      // clicked empty space, and grabbing it back would be the focus-stealing
      // this component exists not to do.
      if (!heldFocusRef.current) return
      heldFocusRef.current = false
      const now = document.activeElement
      if (now && now !== document.body) return

      // Prefer the topmost open dialog when the remembered control sits behind
      // it — restoring there would fight the trap.
      const dialogs = document.querySelectorAll('[aria-modal="true"]')
      const top = dialogs[dialogs.length - 1]
      const target = returnToRef.current
      const targetUsable = target?.isConnected && typeof target.focus === 'function'
        && (!top || top.contains(target))

      if (targetUsable) {
        target.focus()
        // `.focus()` is a no-op on a disabled or hidden control, so check it
        // actually took before giving up on the fallback.
        if (document.activeElement === target) return
      }
      top?.focus?.()
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
