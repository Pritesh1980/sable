import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { useStorage } from '../hooks/useStorage'
import { ideasCodec, conceptsCodec } from '../data/imageCodec'
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
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(store)
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
  })
}

const render = (key, def, codec) =>
  renderHook(() => ({ auth: useAuth(), store: useStorage(key, def, codec) }), { wrapper })

describe('idea/concept image migration to blobs', () => {
  beforeEach(async () => {
    localStorage.clear()
    clearBlobUrls()
    await clearStore('tattoo-blobs-v1', 'blobs')
  })

  it('migrates an inline idea image to a blob key, keeping the display URL in memory', async () => {
    localStorage.setItem(
      'tattoo_ideas',
      JSON.stringify([{ id: 'i1', title: 'Koi', images: [{ url: 'data:image/jpeg;base64,IDEA', note: 'n' }] }])
    )
    seedSession('owner@example.com')

    const { result } = render('tattoo_ideas', [], ideasCodec)
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    // Remote stores a small { key } ref, not base64.
    await waitFor(async () => {
      const rows = await backend.store.list('ideas')
      expect(rows[0]?.images?.[0]?.key).toBeTruthy()
      expect(rows[0]?.images?.[0]?.url).toBeUndefined()
    })
    const rows = await backend.store.list('ideas')
    const key = rows[0].images[0].key
    expect(await backend.blobs.getUrl(key)).toBe('data:image/jpeg;base64,IDEA')

    // In memory the idea still exposes a displayable URL (consumers unchanged).
    expect(result.current.store[0][0].images[0].url).toBe('data:image/jpeg;base64,IDEA')
  })

  it('migrates concept top-level and variant images to blob keys', async () => {
    localStorage.setItem(
      'tattoo_concepts',
      JSON.stringify([
        {
          id: 'c1',
          prompt: 'p',
          imageUrl: 'data:image/png;base64,TOP',
          variants: [{ id: 'v1', imageUrl: 'data:image/png;base64,VAR' }],
        },
      ])
    )
    seedSession('owner@example.com')

    const { result } = render('tattoo_concepts', [], conceptsCodec)
    await waitFor(() => expect(result.current.auth.user).toBeTruthy())

    await waitFor(async () => {
      const rows = await backend.store.list('concepts')
      expect(rows[0]?.imageUrl).toBeTruthy()
      expect(rows[0]?.imageUrl.startsWith('data:')).toBe(false)
      expect(rows[0]?.variants?.[0]?.imageUrl.startsWith('data:')).toBe(false)
    })

    // In memory both resolve back to displayable data-URLs.
    expect(result.current.store[0][0].imageUrl).toBe('data:image/png;base64,TOP')
    expect(result.current.store[0][0].variants[0].imageUrl).toBe('data:image/png;base64,VAR')
  })

  it('resolves a remote idea {key} image on a fresh device', async () => {
    const key = 'user/local-artist@studio.com/ideas/i9/x.jpg'
    await backend.blobs.upload('u', key, 'data:image/jpeg;base64,CLOUD', 'image/jpeg')
    await backend.store.upsert('ideas', [
      { id: 'i9', title: 'Synced', images: [{ key }], updatedAt: '2026-06-01T00:00:00Z' },
    ])
    seedSession('artist@studio.com')

    const { result } = render('tattoo_ideas', [], ideasCodec)
    await waitFor(() =>
      expect(result.current.store[0].find((i) => i.id === 'i9')?.images?.[0]?.url).toBe(
        'data:image/jpeg;base64,CLOUD'
      )
    )
  })
})
