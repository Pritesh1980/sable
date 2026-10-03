// Local RemoteStore — simulates a remote document store using a separate
// localStorage namespace (`tattoo_remote_<collection>`). Keeping it in its own
// namespace (rather than reusing the app's `tattoo_*` cache keys) lets the same
// contract tests run against it and faithfully exercises the sync/reconcile path
// offline.

import { createOwnerScope } from '../ownerScope'
import { randomId } from '../../data/randomId'

const PREFIX = 'tattoo_remote_'
const SESSION_KEY = 'tattoo_local_session'
const ANON_NAMESPACE = 'anon'

// Namespace by the signed-in user so two accounts sharing a browser under the
// local backend don't see each other's "remote" rows (#28). Falls back to a
// single fixed namespace when signed out, matching today's behavior exactly
// for the common no-auth dev/demo case.
export function currentUserNamespace() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    return session?.user?.id || ANON_NAMESPACE
  } catch {
    return ANON_NAMESPACE
  }
}

// #28 review (codex + agy): before namespacing, every collection lived under
// one global `tattoo_remote_<collection>` key. Reading only the new namespaced
// key would make an existing local/demo installation's data appear wiped —
// migrate it forward, once, on first read.
function migrateLegacy(collection, key) {
  const legacyKey = PREFIX + collection
  const legacy = localStorage.getItem(legacyKey)
  if (legacy === null) return null
  try {
    localStorage.setItem(key, legacy)
    localStorage.removeItem(legacyKey)
    return JSON.parse(legacy) || []
  } catch {
    return null
  }
}

function storageFailure() {
  return Object.assign(new Error('Local storage unavailable'), { code: 'storage_failed' })
}

function load(collection, key, allowLegacy, withMetadata = false) {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      const envelope = !allowLegacy && collection === 'concepts' && parsed?.version === 1 ? parsed : null
      const rows = envelope ? envelope.rows : parsed
      if (!allowLegacy && (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r) || !r.id))) {
        throw storageFailure()
      }
      return withMetadata ? { rows: rows || [], deletions: envelope?.deletions || {} } : rows || []
    }
    const rows = allowLegacy ? migrateLegacy(collection, key) || [] : []
    return withMetadata ? { rows, deletions: {} } : rows
  } catch {
    if (!allowLegacy) throw storageFailure()
    return []
  }
}

// Private local concepts alone carry edit intent. Unique generation keys avoid
// cross-tab read/modify/write races; these envelopes never enter public records.
const editPrefix = (ownerId) => `tattoo_private_concept_edit_${encodeURIComponent(ownerId)}_`
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const cleanRow = (row) => { const next = { ...row }; delete next.editGen; return next }

export function recordConceptEdits(ownerId, base, draft, { restore = true, at = new Date().toISOString() } = {}) {
  const before = new Map(base.map((r) => [r.id, r]))
  const after = new Map(draft.map((r) => [r.id, r]))
  const edits = []
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const old = before.get(id) ? cleanRow(before.get(id)) : null
    const next = after.get(id) ? cleanRow(after.get(id)) : null
    if (equal(old, next)) continue
    const key = `${editPrefix(ownerId)}${encodeURIComponent(id)}_${randomId()}`
    const edit = { key, ownerId, id, base: old, draft: next, restore, at, generation: after.get(id)?.editGen }
    localStorage.setItem(key, JSON.stringify(edit))
    edits.push(edit)
  }
  return edits
}

export function readConceptEdits(ownerId) {
  const edits = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key?.startsWith(editPrefix(ownerId))) {
      const edit = JSON.parse(localStorage.getItem(key))
      if (edit?.ownerId !== ownerId || edit.key !== key || !edit.id || !edit.at) throw storageFailure()
      edits.push(edit)
    }
  }
  return edits.sort((a, b) => a.at.localeCompare(b.at) || a.key.localeCompare(b.key))
}

export function confirmConceptEdits(edits) {
  for (const edit of edits) localStorage.removeItem(edit.key)
}

// Three-way field intent, not whole-row LWW. Genuine concurrent edits to one
// field retain the existing updatedAt policy: authoritative wins ties.
function mergeFields(base, draft, current, at, skip = []) {
  const result = { ...current }
  for (const field of new Set([...Object.keys(base || {}), ...Object.keys(draft || {})])) {
    if (['id', 'updatedAt', 'editGen', ...skip].includes(field) || equal(base?.[field], draft?.[field])) continue
    if (equal(current?.[field], base?.[field]) || at > (current?.updatedAt || '')) {
      if (field in draft) result[field] = draft[field]
      else delete result[field]
    }
  }
  return result
}

export function resolveConceptEdits({ rows, deletions = {} }, edits) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const markers = { ...deletions }
  const markerKey = (...ids) => JSON.stringify(ids)
  function permitted(key, old, next, edit) {
    const marker = markers[key]
    if (old && !next) {
      if (!marker || edit.at > marker.at) markers[key] = { at: edit.at, deleted: true }
      return !markers[key]?.deleted
    }
    if (!old && next && edit.restore && (!marker || edit.at > marker.at)) {
      markers[key] = { at: edit.at, deleted: false }
    }
    return !markers[key]?.deleted
  }
  for (const edit of edits) {
    const { id, base, draft, at } = edit
    const current = byId.get(id)
    if (!permitted(markerKey(id), base, draft, edit)) { byId.delete(id); continue }
    if (!draft) continue
    // Missing authoritative rows are not recreated from an old base.
    if (!current && base) continue
    const merged = current ? mergeFields(base, draft, current, at, ['variants']) : { ...draft }
    const oldVariants = new Map((base?.variants || []).map((v) => [v.id, v]))
    const draftVariants = new Map((draft.variants || []).map((v) => [v.id, v]))
    const variants = new Map((current?.variants || []).map((v) => [v.id, v]))
    for (const variantId of new Set([...oldVariants.keys(), ...draftVariants.keys()])) {
      const old = oldVariants.get(variantId); const next = draftVariants.get(variantId)
      if (!permitted(markerKey(id, variantId), old, next, edit)) { variants.delete(variantId); continue }
      if (!next) continue
      const saved = variants.get(variantId)
      if (!saved && old) continue
      if (!saved) variants.set(variantId, { ...next, isBest: false })
      else if (old) variants.set(variantId, mergeFields(old, next, { ...saved, updatedAt: current?.updatedAt }, at, ['isBest']))
      // Duplicate imports (no base variant) never replace saved annotations.
    }
    const best = (list) => (list || []).find((v) => v.isBest)?.id || null
    const oldBest = best(base?.variants); const nextBest = best(draft.variants); const savedBest = best(current?.variants)
    const selected = oldBest !== nextBest && (oldBest === savedBest || at > (current?.updatedAt || '')) ? nextBest : savedBest
    if (draft.variants || current?.variants) merged.variants = [...variants.values()].map((v) => {
      const variant = { ...v, isBest: v.id === selected }; delete variant.updatedAt; return variant
    })
    merged.updatedAt = at > (current?.updatedAt || '') ? at : current.updatedAt
    byId.set(id, cleanRow(merged))
  }
  return { rows: [...byId.values()], deletions: markers }
}

function save(key, rows, allowLegacy) {
  try {
    localStorage.setItem(key, JSON.stringify(rows))
  } catch (e) {
    if (!allowLegacy) throw storageFailure()
    console.error('[tattoo] local store save failed:', e)
  }
}

export function createLocalStore({ ownerScope, allowLegacy = !ownerScope } = {}) {
  const scope = ownerScope || createOwnerScope({
    privateMode: !allowLegacy,
    getOwnerId: allowLegacy ? currentUserNamespace : () => null,
  })
  function capture(collection) {
    const snapshot = scope.capture()
    return { snapshot, key: `${PREFIX}${snapshot.ownerId}_${collection}` }
  }
  function read(collection, operation) {
    const rows = load(collection, operation.key, allowLegacy)
    scope.assertCurrent(operation.snapshot)
    return rows
  }
  function write(operation, rows, checked = false) {
    scope.assertCurrent(operation.snapshot)
    save(operation.key, rows, allowLegacy && !checked)
    scope.assertCurrent(operation.snapshot)
  }
  async function locked(collection, operation, checked, work) {
    const locks = globalThis.navigator?.locks
    if (checked && !locks?.request) throw Object.assign(new Error('Checked storage unavailable'), { code: 'commit_unavailable' })
    const run = () => { scope.assertCurrent(operation.snapshot); return work() }
    return locks?.request ? locks.request(`sable:${operation.snapshot.ownerId}:${collection}`, run) : run()
  }
  async function upsert(collection, rows, options = {}, checked = false) {
    const operation = capture(collection)
    if (options.ownerId && options.ownerId !== operation.snapshot.ownerId) throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
    return locked(collection, operation, checked, () => {
      const privateConcepts = !allowLegacy && collection === 'concepts'
      const state = privateConcepts ? load(collection, operation.key, false, true) : { rows: read(collection, operation), deletions: {} }
      let next
      if (privateConcepts && options.resolveLatest) next = options.resolveLatest(state)
      else {
        const byId = new Map(state.rows.map((r) => [r.id, r]))
        for (const row of rows) if (!state.deletions[JSON.stringify([row.id])]?.deleted) byId.set(row.id, row)
        next = { ...state, rows: [...byId.values()] }
      }
      write(operation, privateConcepts ? { version: 1, ...next } : next.rows, checked)
      // Readback is inside the same lock, never a second best-effort writer.
      return checked || privateConcepts ? read(collection, operation) : next.rows
    })
  }
  return {
    get checkedSupported() { return Boolean(globalThis.navigator?.locks?.request) },
    async list(collection) {
      return read(collection, capture(collection))
    },
    upsert: (collection, rows = [], options) => upsert(collection, rows, options),
    upsertChecked: (collection, rows = [], options) => upsert(collection, rows, options, true),
    async remove(collection, ids = []) {
      const operation = capture(collection)
      return locked(collection, operation, false, () => {
        const idSet = new Set(ids)
        if (!allowLegacy && collection === 'concepts') {
          const state = load(collection, operation.key, false, true)
          for (const id of ids) state.deletions[JSON.stringify([id])] = { at: new Date().toISOString(), deleted: true }
          write(operation, { version: 1, ...state, rows: state.rows.filter((r) => !idSet.has(r.id)) })
        } else write(operation, read(collection, operation).filter((r) => !idSet.has(r.id)))
      })
    },
    async pull(collection, since) {
      const rows = read(collection, capture(collection))
      if (!since) return rows
      return rows.filter((r) => String(r.updatedAt || '') > String(since))
    },
  }
}
