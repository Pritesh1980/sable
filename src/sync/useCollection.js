import { useSyncExternalStore } from 'react'

// Binds a collection store (src/sync/collectionStore.js) to React. The setter
// is the store's own `set`, so it is stable for the store's whole life — it
// never changes across renders or sign-in.
export function useCollection(store) {
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return [value, store.set]
}
