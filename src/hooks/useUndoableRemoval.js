import { useCallback, useEffect, useRef } from 'react'
import { removeAt, removeItem, restoreRemoval } from '../data/undoableRemoval'
import { useUndo } from '../context/useUndo'

/**
 * Removal you can take back. The removal applies immediately — the list is the
 * caller's, held in storage — and the way back is published to the app-level
 * UndoProvider rather than kept here, so it survives this component unmounting
 * (a table row collapsing, a modal closing). See #53.
 *
 * @param list      current list, used only to work out *what* is being removed
 * @param onChange  called with an updater — `(currentList) => nextList` — never a
 *                  plain array. A durable offer outlives this component, so its
 *                  refs stop updating; composing against the caller's current
 *                  list is what stops undo writing back over a change that
 *                  landed in between (a sync, an import).
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
    // Which item, and what sat either side — read while still mounted.
    const { removal } = removeAt(listRef.current, index)
    if (!removal) return

    // Both sides compose against the caller's current list rather than a captured
    // copy, so neither the removal nor the restore can clobber a concurrent edit.
    onChangeRef.current((current) => removeItem(current, removal.item))
    offer({
      message,
      durable,
      onUndo: () => onChangeRef.current((current) => restoreRemoval(current, removal)),
    })
  }, [offer, message, durable])

  return { remove }
}
