import { useCallback, useContext, useEffect, useRef } from 'react'
import { UndoContext } from './undo-context'

let nextOfferId = 0

/**
 * Publish an undo offer to the app-level host.
 *
 *   const { offer, promote } = useUndo()
 *   offer({ message: 'Photo removed', onUndo, durable: true, batchKey: 'artist-3' })
 *
 * `durable` says whether the offer should outlive this component. True when the
 * removal has already been persisted (the way back must survive the row
 * collapsing); false when it only edited local draft state that is discarded on
 * close, where a leftover Undo button would silently do nothing.
 *
 * `promote()` flips a live offer to durable — for when an action commits the
 * removal after the fact, such as saving a draft.
 *
 * `batchKey` groups consecutive removals from the same source into one offer.
 *
 * Outside a provider this is a no-op, so components stay unit-testable on their
 * own — the removal itself still happens, it just isn't offered back.
 */
export function useUndo() {
  const ctx = useContext(UndoContext)
  // The last offer this particular consumer made, so unmount only withdraws its
  // own — never a newer offer from somewhere else.
  const lastOfferRef = useRef(null)

  const offer = useCallback(({ durable = false, ...details }) => {
    if (!ctx) return
    const id = ++nextOfferId
    // Durability is tracked here rather than on the offer: it decides whether
    // *this* consumer withdraws the offer when it unmounts.
    lastOfferRef.current = { id, durable }
    ctx.offerUndo({ id, ...details })
  }, [ctx])

  const promote = useCallback(() => {
    const last = lastOfferRef.current
    if (!ctx || !last) return
    lastOfferRef.current = { ...last, durable: true }
    ctx.promoteOffer(last.id)
  }, [ctx])

  const dismissOffer = ctx?.dismissOffer

  // Withdraw this consumer's own offer — for when whatever it would restore into
  // has gone away, so leaving Undo up would promise something it cannot deliver.
  const withdraw = useCallback(() => {
    const last = lastOfferRef.current
    if (last) dismissOffer?.(last.id)
  }, [dismissOffer])

  useEffect(() => () => {
    const last = lastOfferRef.current
    if (last && !last.durable) dismissOffer?.(last.id)
  }, [dismissOffer])

  return { offer, promote, withdraw, pending: ctx?.pending ?? null }
}
