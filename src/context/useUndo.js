import { useCallback, useContext, useEffect, useRef } from 'react'
import { UndoContext } from './undo-context'

let nextOfferId = 0

/**
 * Publish an undo offer to the app-level host.
 *
 *   const { offer } = useUndo()
 *   offer({ message: 'Photo removed', onUndo, durable: true })
 *
 * `durable` says whether the offer should outlive this component. True when the
 * removal has already been persisted (the way back must survive the row
 * collapsing); false when it only edited local draft state that is discarded on
 * close, where a leftover Undo button would silently do nothing.
 *
 * Outside a provider this is a no-op, so components stay unit-testable on their
 * own — the removal itself still happens, it just isn't offered back.
 */
export function useUndo() {
  const ctx = useContext(UndoContext)
  // The last offer this particular consumer made, so unmount only withdraws its
  // own — never a newer offer from somewhere else.
  const lastOfferRef = useRef(null)

  const offer = useCallback(({ message, onUndo, durable = false }) => {
    if (!ctx) return
    const id = ++nextOfferId
    lastOfferRef.current = { id, durable }
    ctx.offerUndo({ id, message, onUndo })
  }, [ctx])

  const dismissOffer = ctx?.dismissOffer
  useEffect(() => () => {
    const last = lastOfferRef.current
    if (last && !last.durable) dismissOffer?.(last.id)
  }, [dismissOffer])

  return { offer, pending: ctx?.pending ?? null }
}
