import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UndoContext } from './undo-context'
import UndoToast from '../components/UndoToast'

export const UNDO_WINDOW_MS = 5000

/**
 * Holds the one pending undo offer for the whole app and renders the single
 * toast. Lives above the routes so an offer outlives the surface that made it —
 * a table row collapsing, a modal closing, a navigation — which is the whole
 * point: the removal has already been persisted, so the way back must not
 * disappear with the button that triggered it.
 *
 * One offer at a time by design. Two toasts stacked at identical fixed
 * coordinates made the older one's Undo unreachable, which is worse than
 * honestly committing it.
 */
export function UndoProvider({ children, undoWindowMs = UNDO_WINDOW_MS }) {
  const [pending, setPending] = useState(null)
  const timerRef = useRef(null)
  // Mirrors `pending` so callbacks never read it through a state updater —
  // StrictMode double-invokes updaters, which would fire side effects twice.
  const pendingRef = useRef(null)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const clear = useCallback(() => {
    clearTimer()
    pendingRef.current = null
    setPending(null)
  }, [clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  const offerUndo = useCallback((offer) => {
    clearTimer()
    // Replacing an offer commits the previous one — it is already persisted.
    pendingRef.current = offer
    setPending(offer)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      pendingRef.current = null
      setPending(null)
    }, undoWindowMs)
  }, [clearTimer, undoWindowMs])

  const undoNow = useCallback(() => {
    const current = pendingRef.current
    clear()
    current?.onUndo?.()
  }, [clear])

  // Used when a non-durable owner unmounts: withdraw only if the visible offer is
  // still theirs, so a newer offer from elsewhere is left alone.
  const dismissOffer = useCallback((id) => {
    if (pendingRef.current?.id !== id) return
    clear()
  }, [clear])

  const value = useMemo(
    () => ({ pending, offerUndo, undoNow, dismissOffer }),
    [pending, offerUndo, undoNow, dismissOffer]
  )

  return (
    <UndoContext.Provider value={value}>
      {children}
      <UndoToast
        show={!!pending}
        message={pending?.message ?? ''}
        onUndo={undoNow}
      />
    </UndoContext.Provider>
  )
}
