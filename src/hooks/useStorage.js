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
import {
  stampChangedRows,
  setDirty,
  isDirty,
  clearDirty,
  readPendingDeletes,
  addPendingDeletes,
  clearPendingDeletes,
  writeStamp,
  readStamp,
} from '../backend/dirty'

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
  const editSeq = useRef(0)
  // This tab's own singleton edit stamp. The tattoo_stamp_ sidecar is shared
  // across tabs, so flushing under readStamp() could launder a stale map with
  // another tab's newer stamp; the flush must carry the stamp of the edit it
  // is actually pushing.
  const singletonStamp = useRef('')
  // Flushes are chained so two can never be in flight at once — with a real
  // async backend an older flush completing last would overwrite newer remote
  // rows and regress the synced baseline.
  const flushChain = useRef(Promise.resolve())

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
        // Rows deleted locally but not yet remotely must not ride back in on
        // the pull; the remove is retried below instead. A pending delete for
        // an id present in the local cache was superseded by a re-add.
        const localIds = new Set(
          (Array.isArray(valueRef.current) ? valueRef.current : [])
            .map((r) => (r && typeof r === 'object' ? r.id : undefined))
        )
        const allPending = readPendingDeletes(key)
        const superseded = allPending.filter((id) => localIds.has(id))
        if (superseded.length) clearPendingDeletes(key, superseded)
        const pendingDeletes = allPending.filter((id) => !localIds.has(id))
        const remoteRows = await backend.store.list(collection)
        if (cancelled) return
        const usableRemote = pendingDeletes.length
          ? remoteRows.filter((r) => !pendingDeletes.includes(r.id))
          : remoteRows
        const reconciled = reconcileValue(collection, valueRef.current, usableRemote, readStamp(key))
        // Rows that predate edit-time stamping get one now, once — otherwise
        // every flush would fallback-restamp them, outranking other devices.
        const merged = Array.isArray(reconciled)
          ? reconciled.map((r) =>
              r && typeof r === 'object' && !r.updatedAt ? { ...r, updatedAt: nowStamp() } : r
            )
          : reconciled
        syncedRef.current = merged
        const display = await codec.toDisplay(merged)
        if (cancelled) return
        valueRef.current = display
        setValue(display)

        if (pendingDeletes.length) {
          backend.store
            .remove(collection, pendingDeletes)
            .then(() => clearPendingDeletes(key, pendingDeletes))
            .catch((e) => console.error(`[tattoo] retry delete failed for ${collection}:`, e))
        }
        const moved = await codec.ensureUploaded(display, { userId: user.id })
        // A dirty flag means an edit never fully reached the remote (failed
        // push, killed tab) — push the reconciled state up now.
        if (!cancelled && (moved > 0 || isDirty(key))) {
          flushRef.current?.().catch((e) =>
            console.error(`[tattoo] sync push failed for ${collection}:`, e)
          )
        }
      } catch (e) {
        console.error(`[tattoo] sync pull failed for ${collection}:`, e)
      }
    })()
    return () => { cancelled = true }
  }, [user, collection, codec, key])

  const runFlush = useCallback(async () => {
    if (!user || !collection) return
    const next = valueRef.current
    await codec.ensureUploaded(next, { userId: user.id })
    const canonical = codec.toCanonical(next)
    try {
      localStorage.setItem(key, JSON.stringify(canonical))
    } catch {
      // quota exceeded — silent fail
    }
    const isSingleton = SINGLETON_COLLECTIONS.has(collection)
    const rows = valueToRecords(
      collection,
      canonical,
      isSingleton ? singletonStamp.current || readStamp(key) || nowStamp() : nowStamp()
    )
    const seq = editSeq.current

    // Record deletions durably BEFORE attempting them, and retry any that a
    // previous flush failed to land; syncedRef advances only on success, so a
    // failed write stays visible to the next flush or mount.
    let pendingDeletes = []
    if (!isSingleton) {
      const prevSynced = syncedRef.current
      const liveIds = new Set(rows.map((r) => r.id))
      const removed = Array.isArray(prevSynced)
        ? prevSynced.map((r) => r.id).filter((id) => !liveIds.has(id))
        : []
      const allPending = addPendingDeletes(key, removed)
      // A pending delete whose id is live again was superseded by a re-add —
      // drop it, or the late remove could destroy the recreated row.
      const superseded = allPending.filter((id) => liveIds.has(id))
      if (superseded.length) clearPendingDeletes(key, superseded)
      pendingDeletes = allPending.filter((id) => !liveIds.has(id))
    }

    const tasks = [backend.store.upsert(collection, rows)]
    if (pendingDeletes.length) tasks.push(backend.store.remove(collection, pendingDeletes))
    await Promise.all(tasks)

    syncedRef.current = rows
    clearPendingDeletes(key, pendingDeletes)
    // A newer edit may have arrived while the writes were in flight; its own
    // flush is already scheduled, so only that flush may clear the flag.
    if (editSeq.current === seq) clearDirty(key)
  }, [user, collection, codec, key])

  const flush = useCallback(() => {
    const p = flushChain.current.then(runFlush, runFlush)
    flushChain.current = p.then(() => {}, () => {})
    return p
  }, [runFlush])

  useEffect(() => { flushRef.current = flush }, [flush])

  const setValueAndSync = useCallback(
    (updater) => {
      const at = nowStamp()
      setValue((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        // Stamp what changed at edit time — the offline-cache effect persists
        // the stamp immediately, so the edit survives a reload and wins
        // last-write-wins against older remote rows even if no push succeeds.
        if (!collection || SINGLETON_COLLECTIONS.has(collection)) return next
        const stamped = stampChangedRows(prev, next, at)
        // Tombstones become durable at the edit, not at the flush 500ms later
        // — a tab closed inside the debounce window must not lose the delete.
        // (Idempotent, and a re-add supersedes them at flush/mount.)
        if (Array.isArray(prev)) {
          const liveIds = new Set(stamped.map((r) => r?.id))
          const removed = prev
            .map((r) => (r && typeof r === 'object' ? r.id : undefined))
            .filter((id) => id !== undefined && !liveIds.has(id))
          if (removed.length) addPendingDeletes(key, removed)
        }
        return stamped
      })
      if (collection) {
        editSeq.current += 1
        setDirty(key)
        if (SINGLETON_COLLECTIONS.has(collection)) {
          singletonStamp.current = at
          writeStamp(key, at)
        }
      }
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
