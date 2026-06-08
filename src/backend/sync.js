// Sync glue: maps localStorage keys → remote collections, stamps records with
// updatedAt, reconciles local cache vs remote by last-write-wins (LWW), and
// wraps/unwraps the one "singleton" collection (conventionOverrides is a map,
// not a list of records).
//
// LWW is sufficient at 2-user, single-writer-per-record scale — no CRDTs, no
// merge UI. The documented trade-off: a concurrent edit to the same record can
// be silently dropped, and an offline delete can be resurrected by a stale
// remote row (deletes go through RemoteStore.remove, which we treat as the
// authority while online).

export const KEY_TO_COLLECTION = {
  tattoo_artists_meta: 'artistsMeta',
  tattoo_ideas: 'ideas',
  tattoo_concepts: 'concepts',
  tattoo_boards: 'boards',
  tattoo_convention_attending: 'conventionOverrides',
}

// Collections stored as a single map document rather than an array of records.
export const SINGLETON_COLLECTIONS = new Set(['conventionOverrides'])
export const SINGLETON_ID = 'singleton'

export function collectionFor(key) {
  return KEY_TO_COLLECTION[key] || null
}

export function nowStamp() {
  return new Date().toISOString()
}

function isLater(a, b) {
  // Strictly-later local rows override remote; ties resolve to remote (the row
  // already persisted), keeping reconcile deterministic.
  return String(a?.updatedAt || '') > String(b?.updatedAt || '')
}

// Merge two record lists keyed by id, last-write-wins on updatedAt.
// `remoteRows` is the base; a local row replaces it only if strictly newer.
export function reconcileRecords(localRows = [], remoteRows = []) {
  const byId = new Map()
  for (const r of remoteRows) byId.set(r.id, r)
  for (const r of localRows) {
    const existing = byId.get(r.id)
    if (!existing || isLater(r, existing)) byId.set(r.id, r)
  }
  return Array.from(byId.values())
}

// Turn a useStorage value into stamped records ready for upsert.
// For singleton collections the whole map becomes one record's `data`.
export function valueToRecords(collection, value, at = nowStamp()) {
  if (SINGLETON_COLLECTIONS.has(collection)) {
    return [{ id: SINGLETON_ID, updatedAt: at, data: value ?? {} }]
  }
  return (value || []).map((row) => ({ ...row, updatedAt: at }))
}

// Inverse of valueToRecords: turn stored records back into a useStorage value.
export function recordsToValue(collection, rows = []) {
  if (SINGLETON_COLLECTIONS.has(collection)) {
    const doc = rows.find((r) => r.id === SINGLETON_ID) || rows[0]
    return doc?.data ?? {}
  }
  return rows
}

// Reconcile a local useStorage value against remote records, returning the
// merged useStorage value. Singletons reconcile by their single doc's stamp.
export function reconcileValue(collection, localValue, remoteRows = [], localAt) {
  if (SINGLETON_COLLECTIONS.has(collection)) {
    const remoteDoc = remoteRows.find((r) => r.id === SINGLETON_ID) || remoteRows[0]
    const localDoc = { id: SINGLETON_ID, updatedAt: localAt || '', data: localValue ?? {} }
    const winner = remoteDoc && !isLater(localDoc, remoteDoc) ? remoteDoc : localDoc
    return winner.data ?? {}
  }
  const localRows = (localValue || []).map((row) => ({
    ...row,
    updatedAt: row.updatedAt || localAt || '',
  }))
  return reconcileRecords(localRows, remoteRows)
}
