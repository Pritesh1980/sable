// Local RemoteStore — simulates a remote document store using a separate
// localStorage namespace (`tattoo_remote_<collection>`). Keeping it in its own
// namespace (rather than reusing the app's `tattoo_*` cache keys) lets the same
// contract tests run against it and faithfully exercises the sync/reconcile path
// offline.

const PREFIX = 'tattoo_remote_'
const SESSION_KEY = 'tattoo_local_session'
const ANON_NAMESPACE = 'anon'

// Namespace by the signed-in user so two accounts sharing a browser under the
// local backend don't see each other's "remote" rows (#28). Falls back to a
// single fixed namespace when signed out, matching today's behavior exactly
// for the common no-auth dev/demo case.
function currentUserNamespace() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY))
    return session?.user?.id || ANON_NAMESPACE
  } catch {
    return ANON_NAMESPACE
  }
}

function storageKey(collection) {
  return `${PREFIX}${currentUserNamespace()}_${collection}`
}

function load(collection) {
  try {
    return JSON.parse(localStorage.getItem(storageKey(collection))) || []
  } catch {
    return []
  }
}

function save(collection, rows) {
  try {
    localStorage.setItem(storageKey(collection), JSON.stringify(rows))
  } catch (e) {
    console.error('[tattoo] local store save failed:', e)
  }
}

export function createLocalStore() {
  return {
    async list(collection) {
      return load(collection)
    },
    async upsert(collection, rows = []) {
      const byId = new Map(load(collection).map((r) => [r.id, r]))
      for (const r of rows) byId.set(r.id, r)
      const next = Array.from(byId.values())
      save(collection, next)
      return next
    },
    async remove(collection, ids = []) {
      const idSet = new Set(ids)
      save(collection, load(collection).filter((r) => !idSet.has(r.id)))
    },
    async pull(collection, since) {
      const rows = load(collection)
      if (!since) return rows
      return rows.filter((r) => String(r.updatedAt || '') > String(since))
    },
  }
}
