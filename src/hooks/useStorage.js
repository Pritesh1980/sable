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

// Identity codec: in-memory value === stored value (collections without images).
const ID_CODEC = {
  toCanonical: (v) => v,
  toDisplay: async (v) => v,
  ensureUploaded: async () => 0,
}

// Local-first-with-sync. Public API ([value, setValue]) and the synchronous
// localStorage read are unchanged, so App.jsx call sites stay byte-for-byte the
// same. When signed in and the key maps to a synced collection, the hook also:
//   - pulls + reconciles (last-write-wins) once per (user, collection),
//   - debounces a fire-and-forget push of user edits to remote,
//   - removes records the user deleted so they don't resurrect on the next pull.
//
// An optional `codec` lets image-bearing collections keep displayable URLs in
// memory (so every consumer is unchanged) while persisting/syncing small
// canonical { key } refs and uploading inline data-URLs to blob storage at the
// persist boundary. Outside an AuthProvider (most unit tests) `user` is null and
// the hook behaves exactly as the original localStorage-only version.
export function useStorage(key, defaultValue, codecArg) {
  const codec = codecArg || ID_CODEC
  const hasCodec = Boolean(codecArg)

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

  const valueRef = useRef(value)
  const syncedRef = useRef(null)
  const pushTimer = useRef(null)
  const flushRef = useRef(null)

  // Offline cache (canonical form). Also keep valueRef current so the debounced
  // flush reads the latest committed value.
  useEffect(() => {
    valueRef.current = value
    try {
      localStorage.setItem(key, JSON.stringify(codec.toCanonical(value)))
    } catch {
      // quota exceeded — silent fail
    }
  }, [key, value, codec])

  // Resolve cached canonical refs (e.g. image keys) to displayable form on mount.
  useEffect(() => {
    if (!hasCodec) return undefined
    let cancelled = false
    codec
      .toDisplay(valueRef.current)
      .then((display) => { if (!cancelled) setValue(display) })
      .catch((e) => console.error(`[tattoo] toDisplay failed for ${key}:`, e))
    return () => { cancelled = true }
  }, [hasCodec, codec, key])

  // Pull + reconcile once the user/collection is known. Hydration never triggers
  // a push, so it can't clobber newer remote data. If the local cache still holds
  // inline data-URLs (un-migrated), upload them and push the now-keyed version.
  useEffect(() => {
    if (!user || !collection) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const remoteRows = await backend.store.list(collection)
        if (cancelled) return
        const merged = reconcileValue(collection, valueRef.current, remoteRows)
        syncedRef.current = merged
        const display = await codec.toDisplay(merged)
        if (cancelled) return
        valueRef.current = display
        setValue(display)

        const moved = await codec.ensureUploaded(display, { userId: user.id })
        if (!cancelled && moved > 0) flushRef.current?.()
      } catch (e) {
        console.error(`[tattoo] sync pull failed for ${collection}:`, e)
      }
    })()
    return () => { cancelled = true }
  }, [user, collection, codec])

  const flush = useCallback(async () => {
    if (!user || !collection) return
    const next = valueRef.current
    await codec.ensureUploaded(next, { userId: user.id })
    const canonical = codec.toCanonical(next)
    try {
      localStorage.setItem(key, JSON.stringify(canonical))
    } catch {
      // quota exceeded — silent fail
    }
    const at = nowStamp()
    const rows = valueToRecords(collection, canonical, at)
    const prevSynced = syncedRef.current
    syncedRef.current = rows

    const tasks = [backend.store.upsert(collection, rows)]
    if (!SINGLETON_COLLECTIONS.has(collection) && Array.isArray(prevSynced)) {
      const liveIds = new Set(rows.map((r) => r.id))
      const removed = prevSynced.map((r) => r.id).filter((id) => !liveIds.has(id))
      if (removed.length) tasks.push(backend.store.remove(collection, removed))
    }
    await Promise.all(tasks)
  }, [user, collection, codec, key])

  useEffect(() => { flushRef.current = flush }, [flush])

  const setValueAndSync = useCallback(
    (updater) => {
      setValue((prev) => (typeof updater === 'function' ? updater(prev) : updater))
      if (user && collection) {
        clearTimeout(pushTimer.current)
        pushTimer.current = setTimeout(() => {
          flushRef.current?.().catch((e) =>
            console.error(`[tattoo] sync push failed for ${collection}:`, e)
          )
        }, 500)
      }
    },
    [user, collection]
  )

  // Cancel a pending push on unmount (the value is already in the localStorage cache).
  useEffect(() => () => clearTimeout(pushTimer.current), [])

  return [value, setValueAndSync]
}
