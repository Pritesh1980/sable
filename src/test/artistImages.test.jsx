import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { backend } from '../backend'
import { clearBlobUrls } from '../data/blobUrls'
import { resolveImage } from '../data/imageResolver'

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

describe('artist image blob pipeline', () => {
  beforeEach(async () => {
    localStorage.clear()
    clearBlobUrls()
    await clearStore('tattoo-blobs-v1', 'blobs')
  })

  it('resolves a remote {key} image to a displayable URL on a fresh device', async () => {
    const key = 'user/local-artist@studio.com/artists/c1/x.jpg'
    // The remote row must be written under the same signed-in identity that
    // will later read it back (#28 namespaces the local backend's simulated
    // remote per user, matching how Supabase's RLS already scopes writes).
    seedSession('artist@studio.com')
    await backend.blobs.upload('u', key, 'data:image/jpeg;base64,REMOTE', 'image/jpeg')
    await backend.store.upsert('artistsMeta', [
      { id: 'c1', handle: 'x', rank: 1, tags: [], images: [{ key }], updatedAt: '2026-06-01T00:00:00Z' },
    ])

    const { result } = renderSynced()
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))
    // State holds the ref (#116); it resolves to the photo's bytes.
    await waitFor(() => expect(result.current.store[0][0].images[0]).toEqual({ key }))
    expect(await resolveImage(result.current.store[0][0].images[0])).toBe('data:image/jpeg;base64,REMOTE')
  })

})
