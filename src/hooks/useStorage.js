import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { backend } from '../backend'
import { useAuth } from '../context/useAuth'
import { recordConceptEdits, readConceptEdits, resolveConceptEdits, confirmConceptEdits } from '../backend/local/localStore'
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
  writeGeneration,
  readGeneration,
  writeRowGenerations,
  hasDirtyRows,
  confirmRowGenerations,
  dropRowGenerations,
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
  const privateConcepts = collection === 'concepts' && backend.kind === 'local' && backend.capabilities.realAuth

  const valueRef = useRef(value)
  const syncedRef = useRef(null)
  const pushTimer = useRef(null)
  const flushRef = useRef(null)
  const editSeq = useRef(0)
  const privatePending = useRef([])
  const lastEditAt = useRef(0)
  const mounted = useRef(true)
  // This tab's own singleton edit stamp. The tattoo_stamp_ sidecar is shared
  // across tabs, so flushing under readStamp() could launder a stale map with
  // another tab's newer stamp; the flush must carry the stamp of the edit it
  // is actually pushing.
  const singletonStamp = useRef('')
  // Flushes are chained so two can never be in flight at once — with a real
  // async backend an older flush completing last would overwrite newer remote
  // rows and regress the synced baseline.
  const flushChain = useRef(Promise.resolve())

  const editPrivate = useCallback((updater, restore = true) => {
    const snapshot = backend.ownerScope.capture()
    if (snapshot.ownerId !== user?.id) throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
    const prev = valueRef.current
    const next = typeof updater === 'function' ? updater(prev) : updater
    lastEditAt.current = Math.max(Date.now(), lastEditAt.current + 1)
    const at = new Date(lastEditAt.current).toISOString()
    const stamped = stampChangedRows(prev, next, at)
    const edits = recordConceptEdits(snapshot.ownerId, codec.toCanonical(prev), codec.toCanonical(stamped), { restore, at })
    privatePending.current.push(...edits)
    localStorage.setItem(key, JSON.stringify(codec.toCanonical(stamped)))
    backend.ownerScope.assertCurrent(snapshot)
    writeRowGenerations(key, stamped.filter((r) => prev.find((p) => p.id === r.id) !== r))
    dropRowGenerations(key, prev.filter((r) => !stamped.some((nextRow) => nextRow.id === r.id)).map((r) => r.id))
    valueRef.current = stamped
    editSeq.current += 1
    setValue(stamped)
    return stamped
  }, [codec, key, user])

  const canonicalEdits = useCallback((edits) => edits.map((edit) => ({
    ...edit,
    base: edit.base && codec.toCanonical([edit.base])[0],
    draft: edit.draft && codec.toCanonical([edit.draft])[0],
  })), [codec])

  const publishPrivate = useCallback(async (rows, snapshot) => {
    // Display resolution itself can await I/O. Rebase, never replace, edits
    // arriving at either the canonical write or display-resolution boundary.
    for (let round = 0; round < 3; round += 1) {
      const seq = editSeq.current
      const rebased = resolveConceptEdits({ rows }, canonicalEdits(privatePending.current)).rows
      const display = await codec.toDisplay(rebased)
      backend.ownerScope.assertCurrent(snapshot)
      if (!mounted.current) throw Object.assign(new Error('Import interrupted'), { code: 'commit_conflict' })
      if (seq !== editSeq.current) continue
      valueRef.current = display
      setValue(display)
      return
    }
    throw Object.assign(new Error('Edits still arriving'), { code: 'commit_conflict' })
  }, [codec, canonicalEdits])

  const persistPrivate = useCallback(async (updater, expected) => {
    const snapshot = backend.ownerScope.capture()
    if (snapshot.ownerId !== user?.id) throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
    let valueToUpload = valueRef.current
    for (let round = 0; ; round += 1) {
      // A reload can have a different tab's cache but still have our durable
      // pending image draft. Upload both before canonicalizing the intent.
      await codec.ensureUploaded([...valueToUpload, ...privatePending.current.map((edit) => edit.draft).filter(Boolean)], { userId: snapshot.ownerId })
      backend.ownerScope.assertCurrent(snapshot)
      if (valueRef.current === valueToUpload) break
      if (round >= 2) throw Object.assign(new Error('Edits still arriving'), { code: 'commit_conflict' })
      valueToUpload = valueRef.current
    }
    let submitted = []
    let canonical
    const method = expected ? 'upsertChecked' : 'upsert'
    const rows = await backend.store[method](collection, [], {
      ownerId: snapshot.ownerId,
      resolveLatest(state) {
        backend.ownerScope.assertCurrent(snapshot)
        if (updater) {
          // Resolve same-tab pending intent onto the row loaded *under lock*.
          // The updater may only add to that authoritative destination.
          const latest = resolveConceptEdits(state, canonicalEdits(privatePending.current))
          if (!latest.rows.some((r) => r.id === expected.conceptId)
            || latest.deletions[JSON.stringify([expected.conceptId, expected.variantId])]?.deleted) {
            throw Object.assign(new Error('Destination deleted'), { code: 'commit_conflict' })
          }
          valueRef.current = latest.rows
          editPrivate(updater, false)
        }
        submitted = [...privatePending.current]
        const next = resolveConceptEdits(state, canonicalEdits(submitted))
        canonical = next.rows
        localStorage.setItem(key, JSON.stringify(canonical))
        return next
      },
    })
    backend.ownerScope.assertCurrent(snapshot)
    if (expected) requireReceipt(rows, expected)
    confirmConceptEdits(submitted)
    privatePending.current = privatePending.current.filter((e) => !submitted.includes(e))
    confirmRowGenerations(key, submitted.map((edit) => ({ id: edit.id, editGen: edit.generation })))
    syncedRef.current = rows
    await publishPrivate(rows, snapshot)
    return rows
  }, [collection, editPrivate, key, publishPrivate, canonicalEdits, codec, user])

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
    const initial = valueRef.current
    const seq = editSeq.current
    codec
      .toDisplay(initial)
      .then((display) => {
        if (!cancelled && valueRef.current === initial && editSeq.current === seq) setValue(display)
      })
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
        if (privateConcepts) {
          const snapshot = backend.ownerScope.capture()
          privatePending.current = readConceptEdits(snapshot.ownerId)
          // Rebase crash-recovery intent before the ordinary hydration path
          // can reconcile a stale whole cache row over a paid variant.
          const p = flushChain.current.then(() => {
            backend.ownerScope.assertCurrent(snapshot)
            return persistPrivate()
          })
          flushChain.current = p.catch(() => {})
          await p
          return
        }
        const remoteRows = await backend.store.list(collection)
        if (cancelled) return
        // Rows deleted locally but not yet remotely must not ride back in on
        // the pull; the remove is retried below instead. A pending delete for
        // an id present in the local cache was superseded by a re-add. Read
        // after the list await, not before: a delete made while the pull was
        // in flight must count too (#86 review).
        const localIds = new Set(
          (Array.isArray(valueRef.current) ? valueRef.current : [])
            .map((r) => (r && typeof r === 'object' ? r.id : undefined))
        )
        const allPending = readPendingDeletes(key)
        const superseded = allPending.filter((id) => localIds.has(id))
        if (superseded.length) clearPendingDeletes(key, superseded)
        const pendingDeletes = allPending.filter((id) => !localIds.has(id))
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
        // A dirty flag/row means an edit never fully reached the remote
        // (failed push, killed tab) — push the reconciled state up now.
        // Singletons still use the per-key flag; list collections use the
        // per-row generation sidecar instead (#84).
        const stillDirty = SINGLETON_COLLECTIONS.has(collection) ? isDirty(key) : hasDirtyRows(key)
        if (!cancelled && (moved > 0 || stillDirty)) {
          flushRef.current?.().catch((e) =>
            console.error(`[tattoo] sync push failed for ${collection}:`, e)
          )
        }
      } catch (e) {
        console.error(`[tattoo] sync pull failed for ${collection}:`, e)
      }
    })()
    return () => { cancelled = true }
  }, [user, collection, codec, key, privateConcepts, persistPrivate])

  const runFlush = useCallback(async (checkedSnapshot) => {
    if (!user || !collection) return
    if (privateConcepts) {
      return persistPrivate()
    }
    const isSingleton = SINGLETON_COLLECTIONS.has(collection)
    // Snapshot the shared, opaque edit generation before doing any async
    // work. It's a localStorage sidecar, so another tab editing the same key
    // mid-flush will have moved it by the time we check again (#35). Only
    // meaningful for singletons — list collections confirm per row instead
    // (#84), via confirmRowGenerations below.
    const genAtStart = isSingleton ? readGeneration(key) : null
    // Everything below (cache write, upsert, tombstone bookkeeping) works from
    // `next`, so it must not be a snapshot the user has moved past while the
    // upload was in flight (#86): a stale one re-upserts a row deleted in the
    // meantime, clears its tombstone as "re-added", and writes the stale value
    // over the local cache. Re-snapshot after each upload; if edits keep
    // arriving, stand down — each edit has already queued its own flush, and
    // tombstones and the offline cache were made durable at edit time.
    let next = valueRef.current
    for (let round = 0; ; round += 1) {
      await codec.ensureUploaded(next, { userId: user.id })
      if (checkedSnapshot) backend.ownerScope.assertCurrent(checkedSnapshot)
      if (valueRef.current === next) break
      if (round >= 2) return
      next = valueRef.current
    }
    // Kept un-stripped (still carries each row's editGen) so it can be handed
    // to confirmRowGenerations after a successful push — valueToRecords
    // strips editGen from what's actually sent to the remote store.
    const canonical = codec.toCanonical(next)
    try {
      localStorage.setItem(key, JSON.stringify(canonical))
    } catch (error) {
      if (checkedSnapshot) throw error
      // quota exceeded — silent fail
    }
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
    if (checkedSnapshot) backend.ownerScope.assertCurrent(checkedSnapshot)

    syncedRef.current = rows
    clearPendingDeletes(key, pendingDeletes)
    if (isSingleton) {
      // A newer edit may have arrived while the writes were in flight —
      // either this tab's own (editSeq) or another tab's on the same key
      // (the shared generation sidecar, #35) — so only clear dirty if
      // neither moved. Otherwise the edit that landed mid-flush is silently
      // marked "synced" without ever having been pushed.
      if (editSeq.current === seq && readGeneration(key) === genAtStart) clearDirty(key)
    } else {
      // Per row instead of per key (#84): each row in `canonical` carries the
      // editGen it had when *this tab* built this push. A row confirms only
      // if the shared sidecar's current value for it still matches — proof
      // this exact edit, not some other tab's, is what's now confirmed.
      confirmRowGenerations(key, canonical)
    }
  }, [user, collection, codec, key, privateConcepts, persistPrivate])

  const flush = useCallback(() => {
    const snapshot = backend.capabilities.realAuth ? backend.ownerScope.capture() : null
    const work = () => {
      if (snapshot) backend.ownerScope.assertCurrent(snapshot)
      return runFlush()
    }
    const p = flushChain.current.then(work, work)
    flushChain.current = p.then(() => {}, () => {})
    return p
  }, [runFlush])

  useEffect(() => { flushRef.current = flush }, [flush])

  const setValueAndSync = useCallback(
    (updater) => {
      if (privateConcepts) {
        const snapshot = backend.ownerScope.capture()
        editPrivate(updater)
        clearTimeout(pushTimer.current)
        pushTimer.current = setTimeout(() => {
          Promise.resolve().then(() => {
            backend.ownerScope.assertCurrent(snapshot)
            return flushRef.current?.()
          }).catch(() => {})
        }, 500)
        return
      }
      const at = nowStamp()
      const isSingleton = collection && SINGLETON_COLLECTIONS.has(collection)
      setValue((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater
        // Stamp what changed at edit time — the offline-cache effect persists
        // the stamp immediately, so the edit survives a reload and wins
        // last-write-wins against older remote rows even if no push succeeds.
        if (!collection || isSingleton) return next
        const stamped = stampChangedRows(prev, next, at)
        // Tombstones become durable at the edit, not at the flush 500ms later
        // — a tab closed inside the debounce window must not lose the delete.
        // (Idempotent, and a re-add supersedes them at flush/mount.)
        if (Array.isArray(prev)) {
          const liveIds = new Set(stamped.map((r) => r?.id))
          const removed = prev
            .map((r) => (r && typeof r === 'object' ? r.id : undefined))
            .filter((id) => id !== undefined && !liveIds.has(id))
          if (removed.length) {
            addPendingDeletes(key, removed)
            // A deleted row's tracked generation would otherwise linger
            // forever — nothing will ever push it again to confirm it (#84).
            dropRowGenerations(key, removed)
          }
        }
        // Durable at edit time, same reasoning as the tombstones above — a
        // tab closed inside the debounce window must not lose track of which
        // rows still need confirming (#84, replacing the per-key generation
        // for list collections; see confirmRowGenerations in dirty.js).
        // Only rows this edit actually touched: a confirmed row keeps its
        // stale editGen on the object forever (confirmRowGenerations clears
        // only the sidecar, never the row), so writing the full `stamped`
        // array here would re-broadcast that stale token on every later,
        // unrelated edit and clobber a newer generation another tab wrote
        // for that same row in the interim (#84 cross-model review).
        const prevById = new Map(
          Array.isArray(prev)
            ? prev.filter((r) => r && typeof r === 'object').map((r) => [r.id, r])
            : []
        )
        const changedRows = stamped.filter(
          (r) => r && typeof r === 'object' && prevById.get(r.id) !== r
        )
        writeRowGenerations(key, changedRows)
        return stamped
      })
      if (collection) {
        editSeq.current += 1
        if (isSingleton) {
          setDirty(key)
          // Opaque, collision-resistant, shared across tabs (unlike editSeq)
          // — lets a flush detect an edit that landed in *another* tab while
          // it was in flight (#35). Deliberately not writeStamp/readStamp:
          // that sidecar carries a real orderable timestamp consumed as
          // `updatedAt` for singleton LWW and can be persisted verbatim to
          // the backend, so it must not be reused as an opaque token here.
          writeGeneration(key)
          singletonStamp.current = at
          writeStamp(key, at)
        }
        // List collections: dirty/generation tracking already happened per
        // row, above, inside the setValue updater (writeRowGenerations).
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
    [user, collection, key, privateConcepts, editPrivate]
  )

  const commitChecked = useCallback((updater, expected) => {
    if (!user || collection !== 'concepts' || (backend.kind === 'local' && !backend.store.checkedSupported)) {
      return Promise.reject(Object.assign(new Error('Checked storage unavailable'), { code: 'commit_unavailable' }))
    }
    clearTimeout(pushTimer.current)
    let snapshot
    try { snapshot = backend.ownerScope.capture() } catch (error) { return Promise.reject(error) }
    const work = async () => {
      backend.ownerScope.assertCurrent(snapshot)
      if (!user || collection !== 'concepts' || (backend.kind === 'local' && !backend.store.checkedSupported)) {
        throw Object.assign(new Error('Checked storage unavailable'), { code: 'commit_unavailable' })
      }
      if (snapshot.ownerId !== expected.ownerId || user.id !== expected.ownerId) {
        throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
      }
      if (privateConcepts) await persistPrivate(updater, expected)
      else {
        // Supabase uses the existing rejecting writer, not another transaction
        // abstraction. The readback below proves presence, not cross-device
        // atomicity. Keep newer local generations queued during these awaits.
        const before = await backend.store.list(collection)
        backend.ownerScope.assertCurrent(snapshot)
        if (!before.some((row) => row.id === expected.conceptId)
          || !valueRef.current.some((row) => row.id === expected.conceptId)) {
          throw Object.assign(new Error('Destination deleted'), { code: 'commit_conflict' })
        }
        const next = stampChangedRows(valueRef.current, updater(valueRef.current), nowStamp())
        requireReceipt(codec.toCanonical(next), expected)
        valueRef.current = next
        setValue(next)
        writeRowGenerations(key, next)
        editSeq.current += 1
        localStorage.setItem(key, JSON.stringify(codec.toCanonical(next)))
        await runFlush(snapshot)
        backend.ownerScope.assertCurrent(snapshot)
        const canonical = await backend.store.list(collection)
        backend.ownerScope.assertCurrent(snapshot)
        requireReceipt(canonical, expected)
      }
      backend.ownerScope.assertCurrent(snapshot)
      requireReceipt(codec.toCanonical(valueRef.current), expected)
      return { ...expected, committed: true }
    }
    const p = flushChain.current.then(work, work)
    flushChain.current = p.catch(() => {})
    return p
  }, [user, collection, privateConcepts, persistPrivate, codec, key, runFlush])
  const checkedSupported = Boolean(user && collection === 'concepts'
    && (backend.kind !== 'local' || backend.store.checkedSupported))
  const checkedCommit = useMemo(() => {
    const commit = (updater, expected) => commitChecked(updater, expected)
    // Fresh wrapper, not a hook argument mutation. The locked callable API
    // includes this read-only capability; the wrapper is never mutated again.
    // eslint-disable-next-line react-hooks/immutability
    commit.supported = checkedSupported
    return commit
  }, [commitChecked, checkedSupported])

  // Cancel a pending push on unmount (the value is already in the localStorage cache).
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(pushTimer.current) }
  }, [])

  return [value, setValueAndSync, checkedCommit]
}

function requireReceipt(rows, { conceptId, variantId, imageKey }) {
  const variant = rows.find((r) => r.id === conceptId)?.variants?.find((v) => v.id === variantId)
  if (!variant || variant.imageUrl !== imageKey) throw Object.assign(new Error('Import unconfirmed'), { code: 'commit_conflict' })
}
