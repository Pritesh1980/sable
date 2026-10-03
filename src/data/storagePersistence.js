// Persistence is only a best-effort browser eviction hint, never a backup.
export async function getStoragePersistence(storage = globalThis.navigator?.storage, { request = false } = {}) {
  if (!storage?.persisted || !storage?.persist) return 'unavailable'
  try {
    if (await storage.persisted()) return 'granted'
    return request && await storage.persist() ? 'granted' : 'denied'
  } catch {
    return 'unavailable'
  }
}
