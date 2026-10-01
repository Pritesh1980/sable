// The local-first sync engine (#109, #111): one framework-free store per stored
// collection, so the protocol lives in one tested place instead of inside a
// React hook. `useCollection` binds a store to React; `useStorage` creates one
// per component and starts it with the signed-in user.
//
//   getSnapshot() / subscribe(fn)  the useSyncExternalStore contract
//   set(updater)                   an edit: stamped, made durable and cached
//                                  before it returns; signed in, it schedules
//                                  a debounced push
//   start(user) → Promise          mount-time hydration, plus the first pull
//                                  when signed in to a synced collection
//   stop()                         discards whatever the last start had in
//                                  flight, cancels the pending push, and
//                                  parks edits until the next start
//   flush() → Promise              a push, chained behind any in flight
//
// Lifecycle contract. Creating a store is side-effect free — it only reads the
// offline cache — because StrictMode runs lazy initialisers twice in
// development. start/stop are re-entrant: each start opens an epoch, and a
// hydration or pull result from an older epoch is discarded (what the hook's
// per-effect `cancelled` flags used to do). A start's work is deferred a
// microtask, so StrictMode's start → stop → start in one tick touches the codec
// and the remote once. A flush already in flight is not cancelled by stop: its
// tombstones and generations are only cleared once its writes land.
//
// A collection with no backend collection (collectionFor(key) === null) is
// device-local: edits are persisted and nothing else.

import { backend as appBackend } from '../backend'
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

export const PUSH_DEBOUNCE_MS = 500

// Identity codec: the in-memory value is the stored value (collections without
// images). An image codec keeps displayable URLs in memory while the cache and
// the remote get canonical { key } refs (src/data/imageCodec.js):
//   toCanonical(value)            display → canonical, for storage
//   toDisplay(value) → Promise    canonical → display
//   ensureUploaded(value, ctx)    upload inline data-URLs, resolve to the count moved
const ID_CODEC = {
  toCanonical: (v) => v,
  toDisplay: async (v) => v,
  ensureUploaded: async () => 0,
}

const noop = () => {}

function readCache(key, defaultValue) {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

function writeCache(key, canonical) {
  try {
    localStorage.setItem(key, JSON.stringify(canonical))
  } catch {
    // quota exceeded — silent fail
  }
}

const rowIds = (rows) =>
  (Array.isArray(rows) ? rows : []).map((r) => (r && typeof r === 'object' ? r.id : undefined))

export function createCollectionStore({
  key,
  defaultValue,
  codec: codecArg,
  collection = collectionFor(key),
  backend = appBackend,
}) {
  const codec = codecArg || ID_CODEC
  const isSingleton = Boolean(collection) && SINGLETON_COLLECTIONS.has(collection)
  const listeners = new Set()

  let value = readCache(key, defaultValue)
  let epoch = 0
  let user = null // the live start's user; null when stopped or signed out
  let stopped = false
  let parked = [] // edits made while stopped: replayed by the next start, else dropped
  // Set once a hydration or a pull has put display values in memory, so
  // mount-time hydration runs at most once: it expects canonical input, and on a
  // display value toDisplay can lose a concept's unresolvedImageKey.
  let hydrated = !codecArg
  let synced = null // the rows last known to match the remote
  let pushTimer = null
  // Flushes are chained so two can never be in flight at once — with a real
  // async backend an older flush completing last would overwrite newer remote
  // rows and regress the synced baseline.
  let flushChain = Promise.resolve()
  let editSeq = 0
  // This store's own singleton edit stamp. The tattoo_stamp_ sidecar is shared
  // across tabs, so flushing under readStamp() could launder a stale map with
  // another tab's newer stamp; the flush must carry the stamp of the edit it is
  // actually pushing.
  let singletonStamp = ''

  const getSnapshot = () => value

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function emit() {
    listeners.forEach((listener) => listener())
  }

  // A hydration or pull result replaces the value and is cached, canonical.
  function replace(next) {
    value = next
    hydrated = true
    writeCache(key, codec.toCanonical(next))
    emit()
  }

  // List collections: everything below is durable before the edit returns, so
  // a tab closed inside the debounce window loses nothing (#31, #84).
  function trackListEdit(prev, next, at) {
    // Stamp what changed, so the edit survives a reload and wins last-write-wins
    // against older remote rows even if no push ever succeeds.
    const stamped = stampChangedRows(prev, next, at)
    // Tombstones at the edit, not at the flush 500ms later. Idempotent, and a
    // re-add supersedes them at flush or pull.
    if (Array.isArray(prev)) {
      const liveIds = new Set(stamped.map((r) => r?.id))
      const removed = rowIds(prev).filter((id) => id !== undefined && !liveIds.has(id))
      if (removed.length) {
        addPendingDeletes(key, removed)
        // A deleted row's tracked generation would otherwise linger forever —
        // nothing will ever push it again to confirm it (#84).
        dropRowGenerations(key, removed)
      }
    }
    // Generations only for rows this edit touched: a confirmed row keeps its
    // stale editGen on the object forever (confirmRowGenerations clears only the
    // sidecar), so writing every row would re-broadcast that stale token on each
    // unrelated edit and clobber a newer generation another tab wrote for the
    // same row (#84 cross-model review).
    const prevById = new Map(
      Array.isArray(prev)
        ? prev.filter((r) => r && typeof r === 'object').map((r) => [r.id, r])
        : []
    )
    writeRowGenerations(
      key,
      stamped.filter((r) => r && typeof r === 'object' && prevById.get(r.id) !== r)
    )
    return stamped
  }

  // An edit while stopped is parked, matching what React does with a state
  // update: applied if the owner comes back (StrictMode's dev remount re-runs
  // child effects before the parent's, so a child can write between stop and
  // start), dropped if it has really unmounted — so a slow callback finishing
  // after sign-out never writes into the cache the next account reads. Before
  // the first start, edits apply at once: a child's mount effect runs first.
  function set(updater) {
    if (stopped) parked.push(updater)
    else applyEdit(updater)
  }

  function applyEdit(updater) {
    const at = nowStamp()
    const prev = value
    const next = typeof updater === 'function' ? updater(prev) : updater
    value = collection && !isSingleton ? trackListEdit(prev, next, at) : next
    if (collection) {
      editSeq += 1
      if (isSingleton) {
        setDirty(key)
        // Opaque, collision-resistant and shared across tabs (unlike editSeq):
        // lets a flush detect an edit that landed in another tab while it was
        // in flight (#35). Not writeStamp/readStamp — that sidecar carries a
        // real orderable timestamp that becomes the singleton's `updatedAt`.
        writeGeneration(key)
        singletonStamp = at
        writeStamp(key, at)
      }
    }
    // The offline cache is written here, at edit time — not after React commits.
    writeCache(key, codec.toCanonical(value))
    emit()
    if (user && collection) {
      clearTimeout(pushTimer)
      pushTimer = setTimeout(() => {
        flush().catch((e) => console.error(`[tattoo] sync push failed for ${collection}:`, e))
      }, PUSH_DEBOUNCE_MS)
    }
  }

  async function runFlush(flushUser) {
    if (!flushUser || !collection) return
    // Snapshot the shared, opaque edit generation before any async work. Another
    // tab editing the same key mid-flush moves it (#35). Singletons only — list
    // collections confirm per row instead (#84).
    const genAtStart = isSingleton ? readGeneration(key) : null
    // Everything below (cache write, upsert, tombstone bookkeeping) works from
    // `next`, so it must not be a snapshot the user has moved past while the
    // upload was in flight (#86): a stale one re-upserts a row deleted in the
    // meantime and writes the stale value over the cache. Re-snapshot after each
    // upload; if edits keep arriving, stand down — each edit queued its own
    // flush, and tombstones and the cache were made durable at edit time.
    let next = value
    for (let round = 0; ; round += 1) {
      await codec.ensureUploaded(next, { userId: flushUser.id })
      if (value === next) break
      if (round >= 2) return
      next = value
    }
    // Kept un-stripped (rows still carry their editGen) for
    // confirmRowGenerations below; valueToRecords strips editGen from what is
    // actually sent.
    const canonical = codec.toCanonical(next)
    writeCache(key, canonical)
    const rows = valueToRecords(
      collection,
      canonical,
      isSingleton ? singletonStamp || readStamp(key) || nowStamp() : nowStamp()
    )
    const seq = editSeq

    // Record deletions durably BEFORE attempting them, and retry any a previous
    // flush failed to land; `synced` advances only on success, so a failed write
    // stays visible to the next flush or pull.
    let pendingDeletes = []
    if (!isSingleton) {
      const liveIds = new Set(rows.map((r) => r.id))
      const removed = Array.isArray(synced)
        ? synced.map((r) => r.id).filter((id) => !liveIds.has(id))
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

    synced = rows
    clearPendingDeletes(key, pendingDeletes)
    if (isSingleton) {
      // A newer edit may have landed while the writes were in flight — this
      // store's own (editSeq) or another tab's (the shared generation, #35) —
      // so clear dirty only if neither moved.
      if (editSeq === seq && readGeneration(key) === genAtStart) clearDirty(key)
    } else {
      // Per row (#84): each row carries the editGen it had when this push was
      // built, and confirms only if the shared sidecar still holds exactly that.
      confirmRowGenerations(key, canonical)
    }
  }

  function flush() {
    const flushUser = user
    const run = () => runFlush(flushUser)
    const p = flushChain.then(run, run)
    flushChain = p.then(noop, noop)
    return p
  }

  // Resolve cached canonical refs to displayable values. Independent of the
  // first pull, so local photos show even while list() hangs offline. Dropped
  // when its epoch has ended, or when an edit or the pull replaced the value
  // while it resolved — a late hydration must never undo either.
  async function hydrate(live) {
    const from = value
    try {
      const display = await codec.toDisplay(from)
      if (live() && value === from) replace(display)
    } catch (e) {
      console.error(`[tattoo] toDisplay failed for ${key}:`, e)
    }
  }

  // Pull + reconcile. Never pushes unless an edit is still unconfirmed or the
  // codec moved images, so it can't clobber newer remote data.
  async function pull(pullUser, live) {
    try {
      const remoteRows = await backend.store.list(collection)
      if (!live()) return
      // Rows deleted locally but not yet remotely must not ride back in on the
      // pull; the remove is retried below instead. A pending delete for an id
      // present in the local value was superseded by a re-add. Read after the
      // list await, not before: a delete made while the pull was in flight must
      // count too (#86 review).
      const localIds = new Set(rowIds(value))
      const allPending = readPendingDeletes(key)
      const superseded = allPending.filter((id) => localIds.has(id))
      if (superseded.length) clearPendingDeletes(key, superseded)
      const pendingDeletes = allPending.filter((id) => !localIds.has(id))
      const usableRemote = pendingDeletes.length
        ? remoteRows.filter((r) => !pendingDeletes.includes(r.id))
        : remoteRows
      const reconciled = reconcileValue(collection, value, usableRemote, readStamp(key))
      // Rows that predate edit-time stamping get one now, once — otherwise every
      // flush would fallback-restamp them, outranking other devices.
      const merged = Array.isArray(reconciled)
        ? reconciled.map((r) =>
            r && typeof r === 'object' && !r.updatedAt ? { ...r, updatedAt: nowStamp() } : r
          )
        : reconciled
      synced = merged
      const display = await codec.toDisplay(merged)
      if (!live()) return
      replace(display)

      const retried = pendingDeletes.length
        ? backend.store
            .remove(collection, pendingDeletes)
            .then(() => clearPendingDeletes(key, pendingDeletes))
            .catch((e) => console.error(`[tattoo] retry delete failed for ${collection}:`, e))
        : null
      const moved = await codec.ensureUploaded(display, { userId: pullUser.id })
      // A dirty flag or row means an edit never fully reached the remote (failed
      // push, killed tab) — push the reconciled state now. Singletons use the
      // per-key flag; list collections the per-row generations (#84).
      const stillDirty = isSingleton ? isDirty(key) : hasDirtyRows(key)
      if (live() && (moved > 0 || stillDirty)) {
        await flush().catch((e) => console.error(`[tattoo] sync push failed for ${collection}:`, e))
      }
      await retried
    } catch (e) {
      console.error(`[tattoo] sync pull failed for ${collection}:`, e)
    }
  }

  function start(nextUser) {
    epoch += 1
    const mine = epoch
    const live = () => epoch === mine
    const startUser = nextUser || null
    user = startUser
    stopped = false
    const replay = parked
    parked = []
    replay.forEach(applyEdit)
    return Promise.resolve().then(() => {
      if (!live()) return undefined
      const work = []
      if (!hydrated) work.push(hydrate(live))
      if (startUser && collection) work.push(pull(startUser, live))
      return Promise.all(work).then(noop)
    })
  }

  function stop() {
    epoch += 1
    user = null
    stopped = true
    // The edit is already in the cache, its tombstones and generations in the
    // sidecars; the next start's pull pushes whatever is still unconfirmed.
    clearTimeout(pushTimer)
    pushTimer = null
  }

  return { getSnapshot, subscribe, set, start, stop, flush }
}
