// Local RemoteStore — simulates a remote document store using a separate
// localStorage namespace (`tattoo_remote_<collection>`). Keeping it in its own
// namespace (rather than reusing the app's `tattoo_*` cache keys) lets the same
// contract tests run against it and faithfully exercises the sync/reconcile path
// offline.

import { createOwnerScope } from '../ownerScope'

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

function load(collection, key, allowLegacy) {
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const rows = JSON.parse(raw)
      if (!allowLegacy && (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== 'object' || Array.isArray(r) || !r.id))) {
        throw storageFailure()
      }
      return rows || []
    }
    return allowLegacy ? migrateLegacy(collection, key) || [] : []
  } catch {
    if (!allowLegacy) throw storageFailure()
    return []
  }
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
  function write(operation, rows) {
    scope.assertCurrent(operation.snapshot)
    save(operation.key, rows, allowLegacy)
    scope.assertCurrent(operation.snapshot)
  }
  return {
    async list(collection) {
      return read(collection, capture(collection))
    },
    async upsert(collection, rows = []) {
      const operation = capture(collection)
      const byId = new Map(read(collection, operation).map((r) => [r.id, r]))
      for (const r of rows) byId.set(r.id, r)
      const next = Array.from(byId.values())
      write(operation, next)
      return next
    },
    async remove(collection, ids = []) {
      const operation = capture(collection)
      const idSet = new Set(ids)
      write(operation, read(collection, operation).filter((r) => !idSet.has(r.id)))
    },
    async pull(collection, since) {
      const rows = read(collection, capture(collection))
      if (!since) return rows
      return rows.filter((r) => String(r.updatedAt || '') > String(since))
    },
  }
}
