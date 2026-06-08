import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { DEFAULT_ARTISTS } from '../data/artists'
import { backend } from '../backend'
import { clearBlobUrls } from '../data/blobUrls'

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

function idbPut(name, store, key, value) {
  return new Promise((res, rej) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(store)
    req.onsuccess = (e) => {
      const tx = e.target.result.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    }
    req.onerror = () => rej(req.error)
  })
}

const renderSynced = () =>
  renderHook(() => ({ auth: useAuth(), store: useArtistStorage() }), { wrapper })

describe('artist image blob pipeline', () => {
  beforeEach(async () => {
    localStorage.clear()
    clearBlobUrls()
    await clearStore('tattoo-images-v1', 'artist-images')
    await clearStore('tattoo-blobs-v1', 'blobs')
  })

  it('resolves a remote {key} image to a displayable URL on a fresh device', async () => {
    const key = 'user/local-artist@studio.com/artists/c1/x.jpg'
    await backend.blobs.upload('u', key, 'data:image/jpeg;base64,REMOTE', 'image/jpeg')
    await backend.store.upsert('artistsMeta', [
      { id: 'c1', handle: 'x', rank: 1, tags: [], images: [{ key }], updatedAt: '2026-06-01T00:00:00Z' },
    ])
    seedSession('artist@studio.com')

    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))
    await waitFor(() =>
      expect(result.current.store[0][0].images[0]).toBe('data:image/jpeg;base64,REMOTE')
    )
  })

  it('migrates a legacy IndexedDB data-URL to a blob key in the remote metadata', async () => {
    const artistId = DEFAULT_ARTISTS[0].id
    await idbPut('tattoo-images-v1', 'artist-images', artistId, ['data:image/jpeg;base64,LEGACY'])
    seedSession('me@pritesh.net')

    const { result } = renderSynced()
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    await waitFor(() => expect(localStorage.getItem('tattoo_img_migrated_v1')).toBe('1'))

    await waitFor(async () => {
      const rows = await backend.store.list('artistsMeta')
      const migrated = rows.find((r) => r.id === artistId)
      expect(migrated?.images?.some((img) => img && img.key)).toBe(true)
    })
  })
})
