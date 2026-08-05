import { useCallback, useEffect, useRef, useState } from 'react'
import { removeAt, restoreRemoval } from '../data/undoableRemoval'

export const UNDO_WINDOW_MS = 5000

/**
 * Removal you can take back. The removal applies immediately — the list is the
 * caller's, held in storage — and `pending` describes what is still recoverable
 * until the window closes.
 *
 * @param list      current list (kept in a ref, so callbacks stay stable)
 * @param onChange  called with the next list on remove and on undo
 * @param duration  how long undo stays on offer
 */
export function useUndoableRemoval(list, onChange, duration = UNDO_WINDOW_MS) {
  const [pending, setPending] = useState(null)
  const listRef = useRef(list)
  const onChangeRef = useRef(onChange)
  const timerRef = useRef(null)
  // Mirrors `pending` so `undo` can read it without a state updater. StrictMode
  // double-invokes updaters, so a side effect inside one restores twice.
  const pendingRef = useRef(null)

  // Track the live list and callback without making `remove`/`undo` change identity
  // every render — they are handed to buttons inside mapped rows. Written in an
  // effect, not during render: React may render without committing, and a ref
  // mutated on a discarded render would be wrong.
  useEffect(() => {
    listRef.current = list
    onChangeRef.current = onChange
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  const remove = useCallback((index) => {
    const { list: next, removal } = removeAt(listRef.current, index)
    if (!removal) return

    onChangeRef.current(next)
    clearTimer()
    pendingRef.current = removal
    setPending(removal)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      pendingRef.current = null
      setPending(null)
    }, duration)
  }, [clearTimer, duration])

  const undo = useCallback(() => {
    const current = pendingRef.current
    clearTimer()
    pendingRef.current = null
    setPending(null)
    if (current) onChangeRef.current(restoreRemoval(listRef.current, current))
  }, [clearTimer])

  const dismiss = useCallback(() => {
    clearTimer()
    pendingRef.current = null
    setPending(null)
  }, [clearTimer])

  return { pending, remove, undo, dismiss }
}
