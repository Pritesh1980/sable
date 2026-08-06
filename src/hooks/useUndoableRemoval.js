import { useCallback, useEffect, useId, useRef } from 'react'
import { removeAt, removeItem, restoreRemoval } from '../data/undoableRemoval'
import { useUndo } from '../context/useUndo'

const defaultBatchMessage = (n) => (n === 1 ? 'Removed' : `${n} items removed`)
const defaultConfirmMessage = (n) => (n === 1 ? 'Restored' : `${n} items restored`)

/**
 * Removal you can take back. The removal applies immediately — the list is the
 * caller's, held in storage — and the way back is published to the app-level
 * UndoProvider rather than kept here, so it survives this component unmounting
 * (a table row collapsing, a modal closing). See #53.
 *
 * Consecutive removals accumulate into one batch while the offer is live, so
 * pruning several photos in a row stays recoverable as a whole (#59).
 *
 * @param list      current list, used only to work out *what* is being removed
 * @param onChange  called with an updater — `(currentList) => nextList` — never a
 *                  plain array. A durable offer outlives this component, so its
 *                  refs stop updating; composing against the caller's current
 *                  list is what stops undo writing back over a change that
 *                  landed in between (a sync, an import).
 * @param options.message  toast text for a single removal
 * @param options.batchMessage  `(count) => string` once more than one is pending
 * @param options.confirmMessage  `(count) => string` shown after restoring
 * @param options.durable  true when the removal is already persisted, so the
 *                         offer should outlive this component; false when it
 *                         only edited draft state discarded on close.
 */
export function useUndoableRemoval(list, onChange, options = {}) {
  const {
    message = 'Removed',
    batchMessage = defaultBatchMessage,
    confirmMessage = defaultConfirmMessage,
    durable = false,
    isTargetVisible,
  } = options

  const { offer, promote, withdraw } = useUndo()
  const listRef = useRef(list)
  const onChangeRef = useRef(onChange)
  // Removals still inside the live window, oldest first.
  const batchRef = useRef([])
  // Stable per hook instance: what the host groups consecutive removals by.
  const batchKey = useId()
  // Where restores are written. Rebound by `commit` when another surface takes
  // ownership of the removal (saving a draft hands it to the saved record).
  const sinkRef = useRef(null)
  // Whether the place a restore lands is on screen. Confirming something the
  // user can already see is noise; confirming a restore into a collapsed row or
  // a closed composer is the whole point (#61).
  const visibleRef = useRef(isTargetVisible)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Written in an effect, not during render: React may render without
  // committing, and a ref mutated on a discarded render would be wrong. Event
  // handlers always run after effects have flushed, so reads stay current.
  useEffect(() => {
    listRef.current = list
    onChangeRef.current = onChange
    visibleRef.current = isTargetVisible
  })

  const remove = useCallback((index) => {
    const { removal } = removeAt(listRef.current, index)
    if (!removal) return

    const write = (updater) => (sinkRef.current || onChangeRef.current)(updater)
    write((current) => removeItem(current, removal.item))

    const batch = [...batchRef.current, removal]
    batchRef.current = batch
    const count = batch.length

    offer({
      durable,
      batchKey,
      message: count === 1 ? message : batchMessage(count),
      actionLabel: count === 1 ? 'Undo' : 'Undo all',
      confirmMessage: confirmMessage(count),
      // Unmounted means the surface is definitely gone; otherwise ask it.
      shouldConfirm: () => !mountedRef.current || !(visibleRef.current?.() ?? true),
      // Newest first, so each restore lands against the list the next expects.
      onUndo: () => write((current) => batch.reduceRight((acc, r) => restoreRemoval(acc, r), current)),
      onSettled: () => { batchRef.current = [] },
    })
  }, [offer, message, batchMessage, confirmMessage, durable, batchKey])

  /**
   * Hand the live offer to whoever owns the data now, and make it durable. Used
   * when saving commits a draft removal for real: the composer is about to
   * close, but the removal has become permanent, so undo has to outlive it and
   * write somewhere that still exists.
   */
  const commit = useCallback((sink) => {
    if (sink) sinkRef.current = sink
    promote()
  }, [promote])

  /**
   * Withdraw the live offer. For when the thing it would restore into is gone —
   * deleting the artist whose photo is pending — where leaving Undo up would
   * promise a restore that quietly does nothing.
   */
  const dismiss = useCallback(() => {
    batchRef.current = []
    withdraw()
  }, [withdraw])

  return { remove, commit, dismiss }
}
