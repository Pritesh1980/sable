import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { UndoContext } from './undo-context'
import UndoToast from '../components/UndoToast'

export const UNDO_WINDOW_MS = 5000
// Long enough to read, short enough not to linger over the work.
export const CONFIRM_MS = 2500

/**
 * Holds the one pending undo offer for the whole app and renders the single
 * toast. Lives above the routes so an offer outlives the surface that made it —
 * a table row collapsing, a modal closing, a navigation — which is the whole
 * point: the removal has already been persisted, so the way back must not
 * disappear with the button that triggered it.
 *
 * One offer at a time by design. Two toasts stacked at identical fixed
 * coordinates made the older one's Undo unreachable. Consecutive removals from
 * the same source instead *merge* into that one offer (see `batchKey`), so
 * pruning several photos in a row stays recoverable as a batch rather than
 * silently committing all but the last.
 */
export function UndoProvider({ children, undoWindowMs = UNDO_WINDOW_MS, confirmMs = CONFIRM_MS }) {
  const [pending, setPending] = useState(null)
  const [confirmation, setConfirmation] = useState(null)
  const timerRef = useRef(null)
  const confirmTimerRef = useRef(null)
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

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
  }, [])

  const offerUndo = useCallback((offer) => {
    const current = pendingRef.current
    // Same source, still inside the window: this extends the existing offer
    // rather than replacing it, so nothing is silently committed.
    const merging = !!current && current.batchKey != null && current.batchKey === offer.batchKey
    if (current && !merging) current.onSettled?.()

    clearTimer()
    setConfirmation(null)
    pendingRef.current = offer
    setPending(offer)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      const expired = pendingRef.current
      pendingRef.current = null
      setPending(null)
      expired?.onSettled?.()
    }, undoWindowMs)
  }, [clearTimer, undoWindowMs])

  const undoNow = useCallback(() => {
    const current = pendingRef.current
    clear()
    if (!current) return
    current.onUndo?.()
    current.onSettled?.()
    // Restoring into a collapsed row or a closed modal changes nothing on
    // screen, so say what happened rather than just vanishing.
    if (current.confirmMessage) {
      setConfirmation(current.confirmMessage)
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null
        setConfirmation(null)
      }, confirmMs)
    }
  }, [clear, confirmMs])

  // Used when a non-durable owner unmounts: withdraw only if the visible offer is
  // still theirs, so a newer offer from elsewhere is left alone.
  const dismissOffer = useCallback((id) => {
    const current = pendingRef.current
    if (current?.id !== id) return
    clear()
    current.onSettled?.()
  }, [clear])

  // Marks the live offer durable in place — used when an action commits the
  // removal for real (saving a draft), so the way back should now outlive the
  // surface that offered it.
  const promoteOffer = useCallback((id) => {
    const current = pendingRef.current
    if (current?.id !== id) return
    const promoted = { ...current, durable: true }
    pendingRef.current = promoted
    setPending(promoted)
  }, [])

  const value = useMemo(
    () => ({ pending, offerUndo, undoNow, dismissOffer, promoteOffer }),
    [pending, offerUndo, undoNow, dismissOffer, promoteOffer]
  )

  const visible = pending || confirmation

  return (
    <UndoContext.Provider value={value}>
      {children}
      <UndoToast
        show={!!visible}
        message={pending?.message ?? confirmation ?? ''}
        actionLabel={pending?.actionLabel}
        onUndo={pending ? undoNow : undefined}
      />
    </UndoContext.Provider>
  )
}
