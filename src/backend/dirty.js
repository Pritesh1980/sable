// Durable dirty-state sidecars for the local-first sync path (#31). Three
// small localStorage records per synced key, all outliving a reload:
//   tattoo_dirty_<key>          — '1' while a user edit has not fully synced
//   tattoo_pending_delete_<key> — ids removed locally but not yet remotely
//   tattoo_stamp_<key>          — updatedAt for singleton (map) collections,
//                                 which have no per-row stamp to carry one
// The hooks set them at edit time (before any remote write is attempted) and
// clear them only after the corresponding remote write succeeds, so a failed
// or interrupted push is always visible to the next flush or mount.

import { nowStamp } from './sync'

const DIRTY_PREFIX = 'tattoo_dirty_'
const PENDING_DELETE_PREFIX = 'tattoo_pending_delete_'
const STAMP_PREFIX = 'tattoo_stamp_'

// Stamp rows the edit actually touched (new id, or a new object for an id —
// the React-updater idiom guarantees changed rows are fresh references) so the
// stamp lands in the offline cache immediately and wins last-write-wins
// reconciliation against older remote rows after a reload. Untouched rows keep
// their existing stamp: restamping them would make every flush look newer than
// a genuine concurrent edit from another device.
export function stampChangedRows(prevRows, nextRows, at = nowStamp()) {
  if (!Array.isArray(nextRows)) return nextRows
  const prevById = new Map(
    (Array.isArray(prevRows) ? prevRows : [])
      .filter((r) => r && typeof r === 'object')
      .map((r) => [r.id, r])
  )
  return nextRows.map((row) => {
    if (!row || typeof row !== 'object' || row.id === undefined) return row
    return prevById.get(row.id) === row ? row : { ...row, updatedAt: at }
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

// Sign-out purge: sidecars describe the signed-out user's unsynced state and
// must never leak into the next account on a shared device.
export function purgeDirtySidecars(storage = localStorage) {
  const doomed = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (
      k &&
      (k.startsWith(DIRTY_PREFIX) ||
        k.startsWith(PENDING_DELETE_PREFIX) ||
        k.startsWith(STAMP_PREFIX))
    ) {
      doomed.push(k)
    }
  }
  doomed.forEach((k) => storage.removeItem(k))
}
