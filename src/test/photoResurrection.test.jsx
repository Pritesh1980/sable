import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { applyDefaults, applyImageTombstones, removedImageTombstones } from '../data/artistsPolicy'
import { backend } from '../backend'
import { clearBlobUrls } from '../data/blobUrls'
import { DEFAULT_ARTISTS } from '../data/artists'

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

// #55 review (codex + agy): a removed DEFAULT_ARTISTS curated static image was
// re-added on every load regardless of canonical removal or a tombstone.
// Removing a curated seed image was completely ineffective. Since #116 the
// starter photos join the stored rows through applyDefaults.
describe('curated starter photos and their tombstones', () => {
  it('does not re-add a curated DEFAULT_ARTISTS image that has a tombstone', () => {
    const staticPath = DEFAULT_ARTISTS[0].images[0]
    const stored = [{
      ...DEFAULT_ARTISTS[0],
      images: [],
      removedImages: [{ ref: staticPath, removedAt: '2026-07-01T00:00:00Z' }],
    }]
    const [out] = applyDefaults(stored)
    expect(out.images).not.toContain(staticPath)
    expect(out.images).toEqual(DEFAULT_ARTISTS[0].images.slice(1))
  })

  it('still shows curated DEFAULT_ARTISTS images that were never removed', () => {
    const [out] = applyDefaults([{ ...DEFAULT_ARTISTS[0], images: [] }])
    expect(out.images).toEqual(DEFAULT_ARTISTS[0].images)
  })
})

// Relay cache-safety cases now exercise the real staging/collection engine in
// relayPhotoStorage.test.jsx: mixed/foreign-owner bytes, offline reload, concurrent
// adds, owner transitions, failed persistence and ambiguous old cache entries.

// #55 part 2 (tombstones): a stale whole-record write with a newer unrelated
// field must not resurrect a photo that has a tombstone.
describe('removedImageTombstones (pure)', () => {
  it('records a tombstone for each canonical ref present before but not after', () => {
    const prev = ['data:should-not-appear', { key: 'user/u1/k1' }, { key: 'user/u1/k2' }]
    const next = [{ key: 'user/u1/k1' }]
    const tombstones = removedImageTombstones(prev, next, '2026-07-01T00:00:00Z')
    expect(tombstones).toEqual([{ ref: { key: 'user/u1/k2' }, removedAt: '2026-07-01T00:00:00Z' }])
  })

  it('produces nothing when nothing was removed', () => {
    expect(removedImageTombstones([{ key: 'user/u1/k1' }], [{ key: 'user/u1/k1' }], '2026-07-01T00:00:00Z')).toEqual([])
  })
})

describe('applyImageTombstones (pure, reconcile layer)', () => {
  it('keeps a photo removed on one device out of the winning record, even though the other device\'s newer unrelated edit would otherwise resurrect it', () => {
    // Device A: removed photo X, tombstoned it.
    const local = [{
      id: 'c1', notes: 'old note', images: [{ key: 'user/u1/k-y' }],
      removedImages: [{ ref: { key: 'user/u1/k-x' }, removedAt: '2026-07-01T00:00:00Z' }],
      updatedAt: '2026-07-01T00:00:00Z',
    }]
    // Device B: stale copy still has X, edited only notes — later timestamp,
    // legitimately wins the whole-record merge.
    const remote = [{
      id: 'c1', notes: 'new note', images: [{ key: 'user/u1/k-x' }, { key: 'user/u1/k-y' }],
      updatedAt: '2026-08-01T00:00:00Z',
    }]
    const merged = [remote[0]] // reconcileRecords would pick remote here (newer)

    const result = applyImageTombstones(merged, local, remote)
    expect(result[0].notes).toBe('new note') // the newer content still wins
    expect(result[0].images).toEqual([{ key: 'user/u1/k-y' }]) // X stays removed
  })

  it('unions tombstones from both sides, keeping the later removedAt for the same ref', () => {
    // k-x is tombstoned on both sides (local later); k-z only on the remote.
    const local = [{
      id: 'c1', images: [],
      removedImages: [{ ref: { key: 'user/u1/k-x' }, removedAt: '2026-07-15T00:00:00Z' }],
      updatedAt: '2026-07-01T00:00:00Z',
    }]
    const remote = [{
      id: 'c1', images: [],
      removedImages: [
        { ref: { key: 'user/u1/k-x' }, removedAt: '2026-07-01T00:00:00Z' },
        { ref: { key: 'user/u1/k-z' }, removedAt: '2026-07-02T00:00:00Z' },
      ],
      updatedAt: '2026-08-01T00:00:00Z',
    }]
    const merged = [remote[0]]

    const result = applyImageTombstones(merged, local, remote)
    expect(result[0].removedImages).toEqual([
      { ref: { key: 'user/u1/k-x' }, removedAt: '2026-07-15T00:00:00Z' },
      { ref: { key: 'user/u1/k-z' }, removedAt: '2026-07-02T00:00:00Z' },
    ])
  })

  it('leaves a record with no tombstones on either side untouched', () => {
    const record = { id: 'c1', images: [{ key: 'user/u1/k-y' }], updatedAt: '2026-08-01T00:00:00Z' }
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
            ? { ...a, images: a.images.filter((img) => img?.key !== keyX) }
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
    // cache alone. Device B's `notes` must win LWW, so its `updatedAt` has to
    // beat device A's — and A's remove-X write above is stamped with the real
    // wall clock. A hard-coded date can't stay ahead of "now" forever (a
    // literal 2026-09-01 started losing that race on 2026-09-01), so anchor it
    // a day into the future relative to the run.
    const deviceBUpdatedAt = new Date(Date.now() + 86_400_000).toISOString()
    await backend.store.upsert('artistsMeta', [
      {
        id: 'c1', handle: 'x', rank: 1, tags: [], notes: 'from device B',
        images: [{ key: keyX }, { key: keyY }], updatedAt: deviceBUpdatedAt,
      },
    ])

    const second = renderSynced()
    await waitFor(() => expect(second.result.current.store[0]).toHaveLength(1))
    await waitFor(() => expect(second.result.current.store[0][0].notes).toBe('from device B'))
    expect(second.result.current.store[0][0].images).not.toContainEqual({ key: keyX })
    expect(second.result.current.store[0][0].images).toContainEqual({ key: keyY })
  })
})

// #55 review (codex + agy): a tombstone was never cleared once created, so
// even a deliberate, intentional re-add of the exact same photo would be
// silently stripped right back out the next time reconciliation ran.
describe('re-adding a tombstoned photo clears its tombstone (#55)', () => {
  beforeEach(async () => {
    localStorage.clear()
    clearBlobUrls()
    await clearStore('tattoo-blobs-v1', 'blobs')
  })

  it('does not re-strip a photo the user intentionally re-added after removing it', async () => {
    seedSession('artist@studio.com')
    const key = 'user/local-artist@studio.com/artists/c1/x.jpg'
    await backend.blobs.upload('u', key, 'data:image/jpeg;base64,X', 'image/jpeg')
    await backend.store.upsert('artistsMeta', [
      { id: 'c1', handle: 'x', rank: 1, tags: [], images: [{ key }], updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const first = renderSynced()
    await waitFor(() => expect(first.result.current.store[0]).toHaveLength(1))
    await waitFor(() => expect(first.result.current.store[0][0].images).toContainEqual({ key }))

    // Remove it — a tombstone is recorded.
    act(() => {
      first.result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'c1' ? { ...a, images: [] } : a))
      )
    })
    await waitFor(() => {
      const meta = JSON.parse(localStorage.getItem('tattoo_artists_meta'))
      expect(meta[0].removedImages).toHaveLength(1)
    })

    // The user changes their mind and adds the exact same photo back (as undo
    // does: the ref itself).
    act(() => {
      first.result.current.store[1]((prev) =>
        prev.map((a) => (a.id === 'c1' ? { ...a, images: [{ key }] } : a))
      )
    })
    await waitFor(() => {
      const meta = JSON.parse(localStorage.getItem('tattoo_artists_meta'))
      expect(meta[0].removedImages).toEqual([])
    })
    expect(first.result.current.store[0][0].images).toContainEqual({ key })

    // Reload — reconciliation must not strip the re-added photo back out.
    // The seed row already had { key } from the start, so checking for its
    // presence alone would trivially pass before the debounced flush (500ms)
    // ever lands — wait for updatedAt to actually move past the seed value,
    // proving a real push happened.
    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      const row = rows.find((r) => r.id === 'c1')
      expect(row?.updatedAt).not.toBe('2026-06-01T00:00:00Z')
      expect(row?.images).toEqual(expect.arrayContaining([{ key }]))
    }, { timeout: 3000 })
    first.unmount()

    // The cached row already holds the photo from the first paint (#116), so
    // wait for the pull's reconciliation to have run before asserting.
    const list = vi.spyOn(backend.store, 'list')
    const second = renderSynced()
    await waitFor(() => expect(second.result.current.store[0]).toHaveLength(1))
    await waitFor(() => expect(list).toHaveBeenCalled())
    await act(async () => {
      await list.mock.results[0].value
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(second.result.current.store[0][0].images).toContainEqual({ key })
    list.mockRestore()
  })
})
