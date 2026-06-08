// Local RemoteStore — simulates a remote document store using a separate
// localStorage namespace (`tattoo_remote_<collection>`). Keeping it in its own
// namespace (rather than reusing the app's `tattoo_*` cache keys) lets the same
// contract tests run against it and faithfully exercises the sync/reconcile path
// offline.

const PREFIX = 'tattoo_remote_'

function load(collection) {
  try {
    return JSON.parse(localStorage.getItem(PREFIX + collection)) || []
  } catch {
    return []
  }
}

function save(collection, rows) {
  try {
    localStorage.setItem(PREFIX + collection, JSON.stringify(rows))
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
