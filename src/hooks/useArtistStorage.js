import { useState, useEffect } from 'react'
import { useAuth } from '../context/useAuth'
import { createCollectionStore } from '../sync/collectionStore'
import { useCollection } from '../sync/useCollection'
import { createArtistsPolicy, META_KEY } from '../data/artistsPolicy'

// Artists are a collection like any other (#112): the protocol runs in the sync
// engine, and everything artist-specific — owner seeding, tombstones, the legacy
// photo cache and its migration — is the policy in src/data/artistsPolicy.js.
// This hook only binds one store to React. The names below stay exported from
// here because components and specs import them from this path.
export {
  applyDefaults,
  applyImageTombstones,
  buildArtists,
  canonicalizeImages,
  displayFromCanonical,
  mergeStaticImages,
  removedImageTombstones,
  stripImages,
} from '../data/artistsPolicy'
export { displayCacheImages } from '../data/legacyArtistImages'

export function useArtistStorage() {
  const user = useAuth()?.user || null
  // Safe to read `user` for the first paint: AppShell mounts inside
  // ProtectedRoute, which holds a spinner until the session resolves, and the
  // shell is keyed by user.id, so a store never outlives its user (#28).
  const [store] = useState(() => {
    const { policy, codec } = createArtistsPolicy()
    return createCollectionStore({
      key: META_KEY,
      defaultValue: [],
      codec,
      policy,
      initialUser: user,
    })
  })

  useEffect(() => {
    void store.start(user)
    return () => store.stop()
  }, [store, user])

  return useCollection(store)
}
