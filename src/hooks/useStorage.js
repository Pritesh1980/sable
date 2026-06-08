import { useState, useEffect, useRef, useCallback } from 'react'
import { backend } from '../backend'
import { useAuth } from '../context/useAuth'
import {
  collectionFor,
  reconcileValue,
  valueToRecords,
  nowStamp,
  SINGLETON_COLLECTIONS,
} from '../backend/sync'

// Local-first-with-sync. Public API ([value, setValue]) and the synchronous
// localStorage read are unchanged, so App.jsx call sites stay byte-for-byte the
// same. When signed in and the key maps to a synced collection, the hook also:
//   - pulls + reconciles (last-write-wins) once per (user, collection),
//   - debounces a fire-and-forget push of user edits to remote,
//   - removes records the user deleted so they don't resurrect on the next pull.
// Outside an AuthProvider (most unit tests) `user` is null and the hook behaves
// exactly as the original localStorage-only version.
export function useStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const auth = useAuth()
  const user = auth?.user || null
  const collection = collectionFor(key)

  // Latest value (so the debounced flush reads the most recent state) and the
  // value last known to be in sync with remote (to diff deletions against).
  const valueRef = useRef(value)
  const syncedRef = useRef(null)
  const pushTimer = useRef(null)

  // Offline cache — unchanged from the original hook. Also keep valueRef current
  // so the debounced flush reads the latest committed value.
  useEffect(() => {
    valueRef.current = value
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // quota exceeded — silent fail
    }
  }, [key, value])

  // Pull + reconcile once the user/collection is known. The merged result does
  // not trigger a push (only setValue does), so hydration can't clobber remote.
  useEffect(() => {
    if (!user || !collection) return undefined
    let cancelled = false
    backend.store
      .list(collection)
      .then((remoteRows) => {
        if (cancelled) return
        setValue((local) => {
          const merged = reconcileValue(collection, local, remoteRows)
          syncedRef.current = merged
          return merged
        })
      })
      .catch((e) => console.error(`[tattoo] sync pull failed for ${collection}:`, e))
    return () => { cancelled = true }
  }, [user, collection])

  const flush = useCallback(() => {
    if (!user || !collection) return
    const next = valueRef.current
    const at = nowStamp()
    const rows = valueToRecords(collection, next, at)
    const prevSynced = syncedRef.current
    syncedRef.current = next

    const tasks = [backend.store.upsert(collection, rows)]
    if (!SINGLETON_COLLECTIONS.has(collection) && Array.isArray(prevSynced)) {
      const liveIds = new Set(rows.map((r) => r.id))
      const removed = prevSynced.map((r) => r.id).filter((id) => !liveIds.has(id))
      if (removed.length) tasks.push(backend.store.remove(collection, removed))
    }
    Promise.all(tasks).catch((e) =>
      console.error(`[tattoo] sync push failed for ${collection}:`, e)
    )
  }, [user, collection])

  const setValueAndSync = useCallback(
    (updater) => {
      setValue((prev) => (typeof updater === 'function' ? updater(prev) : updater))
      if (user && collection) {
        clearTimeout(pushTimer.current)
        pushTimer.current = setTimeout(flush, 500)
      }
    },
    [user, collection, flush]
  )

  // Cancel a pending push on unmount (the value is already in the localStorage cache).
  useEffect(() => () => clearTimeout(pushTimer.current), [])

  return [value, setValueAndSync]
}
