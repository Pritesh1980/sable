import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import {
  useArtistStorage,
  buildArtists,
  applyImageTombstones,
  removedImageTombstones,
} from '../hooks/useArtistStorage'
import { backend } from '../backend'
import { clearBlobUrls, registerBlobUrl } from '../data/blobUrls'

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

function seedSession(email) {
  localStorage.setItem(
    'tattoo_local_session',
    JSON.stringify({ user: { id: `local-${email}`, email } })
  )
}

function clearStore(name, store) {
  return new Promise((res) => {
    const req = indexedDB.open(name)
    req.onsuccess = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(store)) return res()
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).clear()
      tx.oncomplete = () => res()
      tx.onerror = () => res()
      return undefined
    }
    req.onerror = () => res()
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(store)
  })
}

const renderSynced = () =>
  renderHook(() => ({ auth: useAuth(), store: useArtistStorage() }), { wrapper })

// #55 part 1: buildArtists's idbImages branch ignored the reconciled canonical
// a.images entirely whenever any IndexedDB cache existed, so a stale local
// cache could keep showing a photo another device had already removed.
describe('buildArtists (pure)', () => {
  beforeEach(() => clearBlobUrls())

  it('a stale IndexedDB cache does not resurrect a photo removed from canonical images', async () => {
    // X was migrated at some point (registered), same as any real image the
    // app has ever displayed — a plain "starts with data:" check can't tell
    // this apart from a genuinely un-migrated upload under the local backend,
    // which resolves every blob (migrated or not) to a data-URL.
    registerBlobUrl('k-x', 'data:image/jpeg;base64,X_STALE')
    const meta = [{ id: 'x', handle: 'x', images: [{ key: 'k-y' }] }] // canonical: only Y now
    const imageMap = { x: ['data:image/jpeg;base64,X_STALE', 'data:image/jpeg;base64,Y_CACHED'] }
    const built = await buildArtists(meta, imageMap, false)
    // Y's key won't resolve without a real blob store, so it may come back
    // empty — the point is X must be gone, not resurrected from the cache.
    expect(built[0].images).not.toContain('data:image/jpeg;base64,X_STALE')
  })

  it('still shows a legacy un-migrated local upload with no canonical ref yet', async () => {
    const meta = [{ id: 'x', handle: 'x', images: [] }]
    const imageMap = { x: ['data:image/jpeg;base64,UNMIGRATED'] }
    const built = await buildArtists(meta, imageMap, false)
    expect(built[0].images).toContain('data:image/jpeg;base64,UNMIGRATED')
  })
})

// #55 part 1, hook-level reproduction of the issue's exact scenario: device A
// caches [X, Y] locally; device B removes X and syncs [Y]; A reloads.
describe('a stale local image cache does not resurrect a remotely-removed photo', () => {
  beforeEach(async () => {
    localStorage.clear()
    clearBlobUrls()
    await clearStore('tattoo-images-v1', 'artist-images')
    await clearStore('tattoo-blobs-v1', 'blobs')
  })

  it('renders only the remote (post-removal) image set, not the stale local cache', async () => {
    seedSession('artist@studio.com')
    const key = 'user/local-artist@studio.com/artists/c1/y.jpg'
    await backend.blobs.upload('u', key, 'data:image/jpeg;base64,Y', 'image/jpeg')
    // Remote (device B's view, post-removal): only Y remains.
    await backend.store.upsert('artistsMeta', [
      { id: 'c1', handle: 'x', rank: 1, tags: [], images: [{ key }], updatedAt: '2026-06-01T00:00:00Z' },
    ])
    // X was migrated at some point (registered locally, same as any image
    // this device has ever actually displayed) — otherwise a plain "starts
    // with data:" check can't tell a stale-but-migrated image apart from a
    // genuinely un-migrated one, since the local backend resolves every blob
    // (migrated or not) to a data-URL.
    registerBlobUrl('user/local-artist@studio.com/artists/c1/x.jpg', 'data:image/jpeg;base64,X_STALE')
    // Local IndexedDB cache (device A's stale view): still has X too.
    const req = indexedDB.open('tattoo-images-v1', 1)
    await new Promise((resolve, reject) => {
      req.onupgradeneeded = (e) => e.target.result.createObjectStore('artist-images')
      req.onsuccess = (e) => {
        const tx = e.target.result.transaction('artist-images', 'readwrite')
        tx.objectStore('artist-images').put(['data:image/jpeg;base64,X_STALE', 'data:image/jpeg;base64,Y'], 'c1')
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      }
      req.onerror = () => reject(req.error)
    })

    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))
    await waitFor(() => expect(result.current.store[0][0].images).toContain('data:image/jpeg;base64,Y'))
    expect(result.current.store[0][0].images).not.toContain('data:image/jpeg;base64,X_STALE')
  })
})

// #55 part 2 (tombstones): a stale whole-record write with a newer unrelated
// field must not resurrect a photo that has a tombstone.
describe('removedImageTombstones (pure)', () => {
  it('records a tombstone for each canonical ref present before but not after', () => {
    const prev = ['data:should-not-appear', { key: 'k1' }, { key: 'k2' }]
    const next = [{ key: 'k1' }]
    const tombstones = removedImageTombstones(prev, next, '2026-07-01T00:00:00Z')
    expect(tombstones).toEqual([{ ref: { key: 'k2' }, removedAt: '2026-07-01T00:00:00Z' }])
  })

  it('produces nothing when nothing was removed', () => {
    expect(removedImageTombstones([{ key: 'k1' }], [{ key: 'k1' }], '2026-07-01T00:00:00Z')).toEqual([])
  })
})

describe('applyImageTombstones (pure, reconcile layer)', () => {
  it('keeps a photo removed on one device out of the winning record, even though the other device\'s newer unrelated edit would otherwise resurrect it', () => {
    // Device A: removed photo X, tombstoned it.
    const local = [{
      id: 'c1', notes: 'old note', images: [{ key: 'k-y' }],
      removedImages: [{ ref: { key: 'k-x' }, removedAt: '2026-07-01T00:00:00Z' }],
      updatedAt: '2026-07-01T00:00:00Z',
    }]
    // Device B: stale copy still has X, edited only notes — later timestamp,
    // legitimately wins the whole-record merge.
    const remote = [{
      id: 'c1', notes: 'new note', images: [{ key: 'k-x' }, { key: 'k-y' }],
      updatedAt: '2026-08-01T00:00:00Z',
    }]
    const merged = [remote[0]] // reconcileRecords would pick remote here (newer)

    const result = applyImageTombstones(merged, local, remote)
    expect(result[0].notes).toBe('new note') // the newer content still wins
    expect(result[0].images).toEqual([{ key: 'k-y' }]) // X stays removed
  })

  it('unions tombstones from both sides, keeping the later removedAt for the same ref', () => {
    const local = [{
      id: 'c1', images: [],
      removedImages: [{ ref: { key: 'k-x' }, removedAt: '2026-07-01T00:00:00Z' }],
      updatedAt: '2026-07-01T00:00:00Z',
    }]
    const remote = [{
      id: 'c1', images: [],
      removedImages: [{ ref: { key: 'k-x' }, removedAt: '2026-07-15T00:00:00Z' }],
      updatedAt: '2026-08-01T00:00:00Z',
    }]
    const merged = [remote[0]]

    const result = applyImageTombstones(merged, local, remote)
    expect(result[0].removedImages).toEqual([{ ref: { key: 'k-x' }, removedAt: '2026-07-15T00:00:00Z' }])
  })

  it('leaves a record with no tombstones on either side untouched', () => {
    const record = { id: 'c1', images: [{ key: 'k-y' }], updatedAt: '2026-08-01T00:00:00Z' }
    const result = applyImageTombstones([record], [], [record])
    expect(result[0]).toBe(record)
  })
})

// End-to-end wiring check (not just the pure helpers): a removal made through
// the real hook must survive a reload even after a stale device's later,
// unrelated whole-record write blindly overwrites the remote row — including
// wiping the tombstone this device had already pushed there. Only this
// device's own local cache can recover it (#55).
describe('end-to-end: a removed photo survives a stale whole-record write from another device (#55)', () => {
  beforeEach(async () => {
    localStorage.clear()
    clearBlobUrls()
    await clearStore('tattoo-images-v1', 'artist-images')
    await clearStore('tattoo-blobs-v1', 'blobs')
  })

  it('keeps the photo removed after reload', async () => {
    seedSession('artist@studio.com')
    const keyX = 'user/local-artist@studio.com/artists/c1/x.jpg'
    const keyY = 'user/local-artist@studio.com/artists/c1/y.jpg'
    await backend.blobs.upload('u', keyX, 'data:image/jpeg;base64,X', 'image/jpeg')
    await backend.blobs.upload('u', keyY, 'data:image/jpeg;base64,Y', 'image/jpeg')
    await backend.store.upsert('artistsMeta', [
      { id: 'c1', handle: 'x', rank: 1, tags: [], images: [{ key: keyX }, { key: keyY }], updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const first = renderSynced()
    await waitFor(() => expect(first.result.current.store[0]).toHaveLength(1))
    await waitFor(() => expect(first.result.current.store[0][0].images).toHaveLength(2))

    // Remove X on this device.
    act(() => {
      first.result.current.store[1]((prev) =>
        prev.map((a) =>
          a.id === 'c1'
            ? { ...a, images: a.images.filter((img) => img !== 'data:image/jpeg;base64,X') }
            : a
        )
      )
    })
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      expect(rows.find((r) => r.id === 'c1')?.images).toHaveLength(1)
    })
    first.unmount()

    // A stale device B pushes a newer whole-record write with both photos —
    // a blind upsert (today's actual backend semantics) wipes our pushed
    // tombstone server-side too, so recovery must come from A's own local
    // cache alone.
    await backend.store.upsert('artistsMeta', [
      {
        id: 'c1', handle: 'x', rank: 1, tags: [], notes: 'from device B',
        images: [{ key: keyX }, { key: keyY }], updatedAt: '2026-09-01T00:00:00Z',
      },
    ])

    const second = renderSynced()
    await waitFor(() => expect(second.result.current.store[0]).toHaveLength(1))
    await waitFor(() => expect(second.result.current.store[0][0].notes).toBe('from device B'))
    expect(second.result.current.store[0][0].images).not.toContain('data:image/jpeg;base64,X')
    expect(second.result.current.store[0][0].images).toContain('data:image/jpeg;base64,Y')
  })
})
