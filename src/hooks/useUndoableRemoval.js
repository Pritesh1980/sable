import { useCallback, useEffect, useRef } from 'react'
import { removeAt, restoreRemoval } from '../data/undoableRemoval'
import { useUndo } from '../context/useUndo'

/**
 * Removal you can take back. The removal applies immediately — the list is the
 * caller's, held in storage — and the way back is published to the app-level
 * UndoProvider rather than kept here, so it survives this component unmounting
 * (a table row collapsing, a modal closing). See #53.
 *
 * @param list      current list (kept in a ref, so `remove` stays stable)
 * @param onChange  called with the next list on remove and on undo
 * @param options.message  what the toast says
 * @param options.durable  true when the removal is already persisted, so the
 *                         offer should outlive this component; false when it
 *                         only edited draft state discarded on close, where a
 *                         leftover Undo button would do nothing.
 */
export function useUndoableRemoval(list, onChange, { message = 'Removed', durable = false } = {}) {
  const { offer } = useUndo()
  const listRef = useRef(list)
  const onChangeRef = useRef(onChange)

  // Written in an effect, not during render: React may render without
  // committing, and a ref mutated on a discarded render would be wrong. Event
  // handlers always run after effects have flushed, so reads stay current.
  useEffect(() => {
    listRef.current = list
    onChangeRef.current = onChange
  })

  const remove = useCallback((index) => {
    const { list: next, removal } = removeAt(listRef.current, index)
    if (!removal) return

    onChangeRef.current(next)
    offer({
      message,
      durable,
      // Reads the list at undo time, so an edit landing in between is kept.
      // restoreRemoval is idempotent and anchors to neighbours, so this is safe
      // even if the list moved on.
      onUndo: () => onChangeRef.current(restoreRemoval(listRef.current, removal)),
    })
  }, [offer, message, durable])

  return { remove }
}
