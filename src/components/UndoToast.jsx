/**
 * Transient "…removed — Undo" bar. Sits above the fixed bottom nav (z-50) and its
 * safe-area inset, so it never hides behind the nav on an iPhone.
 *
 * Deliberately not focus-stealing: removal is something the user just did, so the
 * offer is announced politely rather than interrupting what they are doing.
 */
export default function UndoToast({ message, show, onUndo, actionLabel }) {
  const label = actionLabel || 'Undo'
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
      {onUndo && (
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
