import { useEffect, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { createCollectionStore } from '../sync/collectionStore'
import { useCollection } from '../sync/useCollection'

// Local-first-with-sync storage behind a [value, setValue] pair, so App.jsx and
// pages read and write it like useState. The protocol itself — edit-time
// stamping and tombstones, the first pull, debounced chained pushes — lives in
// the collection store (src/sync/collectionStore.js); this hook only creates
// one store per component and runs it for the signed-in user. Outside an
// AuthProvider (most unit tests) `user` is null and the store only persists.
//
// An optional `codec` lets image-bearing collections keep displayable URLs in
// memory while persisting and syncing small canonical { key } refs (see
// src/data/imageCodec.js). `key` and `codec` are read once, like useState's
// initial value; every call site passes literals and module-level codecs.
// Stores are per signed-in user: App.jsx remounts the shell on an identity
// change rather than handing one store a different user.
export function useStorage(key, defaultValue, codec) {
  const auth = useAuth()
  const user = auth?.user || null
  const [store] = useState(() => createCollectionStore({ key, defaultValue, codec }))

  useEffect(() => {
    store.start(user)
    return () => store.stop()
  }, [store, user])

  return useCollection(store)
}
