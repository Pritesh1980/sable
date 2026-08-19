// Durable dirty-state sidecars for the local-first sync path (#31). Small
// localStorage records per synced key, all outliving a reload:
//   tattoo_dirty_<key>          — '1' while a singleton edit has not fully
//                                 synced (list collections use rowgen below)
//   tattoo_pending_delete_<key> — ids removed locally but not yet remotely
//   tattoo_stamp_<key>          — updatedAt for singleton (map) collections,
//                                 which have no per-row stamp to carry one
//   tattoo_gen_<key>            — opaque cross-tab edit generation for
//                                 singletons (#35) — there's exactly one
//                                 editable unit (the whole document), so a
//                                 per-key token is already correct there
//   tattoo_rowgen_<key>         — { [rowId]: token }, the same idea scoped
//                                 per row for list collections (#84) — see
//                                 the block comment above confirmRowGenerations
// The hooks set them at edit time (before any remote write is attempted) and
// clear them only after the corresponding remote write succeeds, so a failed
// or interrupted push is always visible to the next flush or mount.

import { nowStamp } from './sync'

const DIRTY_PREFIX = 'tattoo_dirty_'
const PENDING_DELETE_PREFIX = 'tattoo_pending_delete_'
const STAMP_PREFIX = 'tattoo_stamp_'
const GENERATION_PREFIX = 'tattoo_gen_'
const ROWGEN_PREFIX = 'tattoo_rowgen_'

function randomToken() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Stamp rows the edit actually touched (new id, or a new object for an id —
// the React-updater idiom guarantees changed rows are fresh references) so the
// stamp lands in the offline cache immediately and wins last-write-wins
// reconciliation against older remote rows after a reload. Untouched rows keep
// their existing stamp: restamping them would make every flush look newer than
// a genuine concurrent edit from another device. Also stamps a fresh, opaque
// editGen on the same changed rows — the per-row counterpart of writeGeneration
// below, consumed by confirmRowGenerations (#84).
export function stampChangedRows(prevRows, nextRows, at = nowStamp()) {
  if (!Array.isArray(nextRows)) return nextRows
  const prevById = new Map(
    (Array.isArray(prevRows) ? prevRows : [])
      .filter((r) => r && typeof r === 'object')
      .map((r) => [r.id, r])
  )
  return nextRows.map((row) => {
    if (!row || typeof row !== 'object' || row.id === undefined) return row
    return prevById.get(row.id) === row ? row : { ...row, updatedAt: at, editGen: randomToken() }
  })
}

export function setDirty(key) {
  try { localStorage.setItem(DIRTY_PREFIX + key, '1') } catch { /* quota — sidecar only */ }
}

export function isDirty(key) {
  try { return localStorage.getItem(DIRTY_PREFIX + key) === '1' } catch { return false }
}

export function clearDirty(key) {
  try { localStorage.removeItem(DIRTY_PREFIX + key) } catch { /* ignore */ }
}

export function readPendingDeletes(key) {
  try {
    const ids = JSON.parse(localStorage.getItem(PENDING_DELETE_PREFIX + key))
    return Array.isArray(ids) ? ids : []
  } catch {
    return []
  }
}

export function addPendingDeletes(key, ids = []) {
  const merged = [...new Set([...readPendingDeletes(key), ...ids])]
  if (ids.length) {
    try { localStorage.setItem(PENDING_DELETE_PREFIX + key, JSON.stringify(merged)) } catch { /* ignore */ }
  }
  return merged
}

export function clearPendingDeletes(key, ids = []) {
  const rest = readPendingDeletes(key).filter((id) => !ids.includes(id))
  try {
    if (rest.length) localStorage.setItem(PENDING_DELETE_PREFIX + key, JSON.stringify(rest))
    else localStorage.removeItem(PENDING_DELETE_PREFIX + key)
  } catch { /* ignore */ }
  return rest
}

export function writeStamp(key, at = nowStamp()) {
  try { localStorage.setItem(STAMP_PREFIX + key, at) } catch { /* ignore */ }
}

export function readStamp(key) {
  try { return localStorage.getItem(STAMP_PREFIX + key) || '' } catch { return '' }
}

// A collision-resistant, opaque cross-tab edit marker — deliberately separate
// from writeStamp/readStamp above, which carry a real, orderable timestamp
// consumed as `updatedAt` for singleton LWW reconciliation (and, via
// valueToRecords, can be persisted verbatim to the backend). Two tabs editing
// within the same millisecond must never produce equal generations, or a
// flush could wrongly conclude "nothing changed since I started" and clear
// dirty for an edit it never actually confirmed was pushed (#35 review,
// codex + agy) — and a compound/non-timestamp value must never leak into a
// stored `updatedAt` column. Singleton collections only — see #84 below for
// list collections, where a single per-key token isn't enough.
export function writeGeneration(key) {
  try { localStorage.setItem(GENERATION_PREFIX + key, randomToken()) } catch { /* ignore */ }
}

export function readGeneration(key) {
  try { return localStorage.getItem(GENERATION_PREFIX + key) || '' } catch { return '' }
}

function readRowGenerationsRaw(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(ROWGEN_PREFIX + key))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeRowGenerationsRaw(key, map) {
  try {
    if (Object.keys(map).length) localStorage.setItem(ROWGEN_PREFIX + key, JSON.stringify(map))
    else localStorage.removeItem(ROWGEN_PREFIX + key)
  } catch { /* ignore */ }
}

export function readRowGenerations(key) {
  return readRowGenerationsRaw(key)
}

// Track each row's own editGen (stamped by stampChangedRows) in the shared,
// cross-tab-visible sidecar. Rows with no editGen (never edited by this tab —
// e.g. pulled straight from remote) are skipped: this is purely a record of
// "which rows has *someone* edited that isn't confirmed pushed yet."
export function writeRowGenerations(key, rows = []) {
  const withGen = rows.filter((r) => r && typeof r === 'object' && r.editGen)
  if (!withGen.length) return
  const map = readRowGenerationsRaw(key)
  for (const r of withGen) map[r.id] = r.editGen
  writeRowGenerationsRaw(key, map)
}

// The per-key isDirty's list-collection counterpart: true iff *some* row has
// an edit not yet confirmed pushed by anyone.
export function hasDirtyRows(key) {
  return Object.keys(readRowGenerationsRaw(key)).length > 0
}

// Called after a successful push with the rows that push actually sent. #84:
// #35's per-key generation closed the previous bug (any concurrent edit could
// clear another tab's dirty flag) but not a narrower one — it's wrong when
// another tab's edit already landed, and is already reflected in the
// generation value this tab's flush would have snapshotted at start, before
// this tab's own flush even began. A single token per *key* can't represent
// "N independent, individually-unconfirmed edits from N different rows." A
// naive per-row fix — snapshot the shared map at flush start, compare after —
// has the same bug at row granularity: "unchanged since I started" doesn't
// prove *this* push confirmed the row, only that nothing *else* touched it
// meanwhile either. A tab that never edited a row would still see its
// generation as "unchanged" across an unrelated flush and wrongly clear it.
// The fix: only ever compare against a row's *own* editGen, sourced from this
// tab's own in-memory copy of that specific row — never read the shared
// sidecar to decide what to compare against, only to confirm nothing raced
// past what this row itself already claims. A row with no editGen is one
// this tab never edited; skip it outright — confirming it isn't this tab's
// call to make, regardless of what the shared sidecar says.
export function confirmRowGenerations(key, pushedRows = []) {
  const map = readRowGenerationsRaw(key)
  let changed = false
  for (const row of pushedRows) {
    if (!row || typeof row !== 'object' || !row.editGen) continue
    if (map[row.id] === row.editGen) {
      delete map[row.id]
      changed = true
    }
  }
  if (changed) writeRowGenerationsRaw(key, map)
}

// A deleted row's tracked generation (if any) is now orphaned — nothing will
// ever push it again to trigger confirmation, so it would otherwise linger
// forever and keep hasDirtyRows true with no way to resolve it. Call
// alongside addPendingDeletes for the same ids.
export function dropRowGenerations(key, ids = []) {
  if (!ids.length) return
  const map = readRowGenerationsRaw(key)
  let changed = false
  for (const id of ids) {
    if (id in map) {
      delete map[id]
      changed = true
    }
  }
  if (changed) writeRowGenerationsRaw(key, map)
}

// Sign-out purge: sidecars describe the signed-out user's unsynced state and
// must never leak into the next account on a shared device.
export function purgeDirtySidecars(storage = localStorage) {
  const doomed = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (
      k &&
      (k.startsWith(DIRTY_PREFIX) ||
        k.startsWith(GENERATION_PREFIX) ||
        k.startsWith(ROWGEN_PREFIX) ||
        k.startsWith(PENDING_DELETE_PREFIX) ||
        k.startsWith(STAMP_PREFIX))
    ) {
      doomed.push(k)
    }
  }
  doomed.forEach((k) => storage.removeItem(k))
}
