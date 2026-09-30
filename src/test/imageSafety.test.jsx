import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage, canonicalizeImages } from '../hooks/useArtistStorage'
import { uploadInlineImages } from '../hooks/useImageUpload'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'
import { clearBlobUrls, keyForUrl, registerBlobUrl, resolveBlobKey } from '../data/blobUrls'
import { backend } from '../backend'

// #110. Four ways real photo data could be damaged on the Supabase backend.

const KEY = 'user/u1/artists/zoia/own-photo.jpg'
const STAMP = '2026-09-01T10:00:00.000Z'
const firstId = DEFAULT_ARTISTS[0].id
const secondId = DEFAULT_ARTISTS[1].id

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))
const cachedRow = (id) => JSON.parse(localStorage.getItem('tattoo_artists_meta')).find((a) => a.id === id)
const stateRow = (result, id) => result.current[0].find((a) => a.id === id)

function seedReturningUser({ migrated = true } = {}) {
  const rows = DEFAULT_ARTISTS.map((a) => ({ ...a, images: [], notes: '', updatedAt: STAMP }))
  rows[0].images = [{ key: KEY }]
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
  localStorage.setItem('tattoo_artists_meta', JSON.stringify(rows))
  localStorage.setItem('tattoo_remote_artistsMeta', JSON.stringify(rows))
  if (migrated) localStorage.setItem('tattoo_img_migrated_v1', '1')
}

function deleteDb(name) {
  return new Promise((res) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => res()
  })
}

function idbPut(name, store, key, value) {
  return new Promise((res, rej) => {
    const req = indexedDB.open(name, 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(store)
    req.onsuccess = (e) => {
      const db = e.target.result
      const tx = db.transaction(store, 'readwrite')
      tx.objectStore(store).put(value, key)
      tx.oncomplete = () => { db.close(); res() }
      tx.onerror = () => rej(tx.error)
    }
    req.onerror = () => rej(req.error)
  })
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb('tattoo-images-v1')
  await deleteDb('tattoo-blobs-v1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  delete backend.blobs.urlTtlMs
})

describe('an expired signed URL is never saved in place of its key (#110, bug 1)', () => {
  it('a URL superseded by a refresh still maps back to its key', () => {
    registerBlobUrl(KEY, 'https://signed.example/old')
    registerBlobUrl(KEY, 'https://signed.example/new')

    expect(keyForUrl('https://signed.example/old')).toBe(KEY)
    expect(canonicalizeImages(['https://signed.example/old'])).toEqual([{ key: KEY }])
  })

  it('after a TTL refresh, an unrelated edit still caches the photo as { key }', async () => {
    seedReturningUser()
    backend.blobs.urlTtlMs = 3600_000
    let n = 0
    vi.spyOn(backend.blobs, 'getUrl').mockImplementation(async (key) => `https://signed.example/${key}?v=${++n}`)

    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(stateRow(result, firstId)?.images[0]).toMatch(/^https:\/\/signed\.example\//))
    const shown = stateRow(result, firstId).images[0]

    // An hour later the photo's <img> errors and ArtistImage asks for a fresh
    // URL (#82) — state still holds `shown`.
    const now = Date.now()
    vi.spyOn(Date, 'now').mockReturnValue(now + 3600_000)
    const fresh = await resolveBlobKey(KEY)
    expect(fresh).not.toBe(shown)

    act(() => result.current[1]((prev) => prev.map((a) => (a.id === secondId ? { ...a, notes: 'unrelated' } : a))))

    expect(cachedRow(secondId).notes).toBe('unrelated')
    expect(cachedRow(firstId).images[0]).toEqual({ key: KEY })
    expect(JSON.stringify(cachedRow(firstId).images)).not.toContain('signed.example')
  })
})

describe('inline screenshots get uploaded (#110, bug 2)', () => {
  const A = 'data:image/jpeg;base64,c2hvdEE='
  const B = 'data:image/jpeg;base64,c2hvdEI='

  it('uploads bare and { url } data URLs, registering each under a per-artist key', async () => {
    const moved = await uploadInlineImages([A, { url: B, addedAt: STAMP }, { key: KEY }, 'images/demo/x.webp'], {
      userId: 'u1', scope: 'artists', id: 'new.artist',
    })

    expect(moved).toBe(2)
    expect(keyForUrl(A)).toMatch(/^user\/u1\/artists\/new\.artist\//)
    expect(keyForUrl(B)).toMatch(/^user\/u1\/artists\/new\.artist\//)
  })

  it('skips images that are already uploaded, and does nothing without a user', async () => {
    registerBlobUrl(KEY, A)
    const upload = vi.spyOn(backend.blobs, 'upload')

    expect(await uploadInlineImages([A], { userId: 'u1', scope: 'artists', id: 'a' })).toBe(0)
    expect(await uploadInlineImages([B], { userId: undefined, scope: 'artists', id: 'a' })).toBe(0)
    expect(upload).not.toHaveBeenCalled()
  })

  it('once uploaded, a quick-added artist reaches the remote with { key }, not a dropped photo', async () => {
    seedReturningUser()
    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(stateRow(result, firstId)?.images.length).toBeGreaterThan(0))

    const artist = { id: 'new.artist', handle: 'new.artist', name: '', tags: [], images: [A], rank: 99, status: 'researching', notes: '' }
    act(() => result.current[1]((prev) => [...prev, artist]))
    expect(await uploadInlineImages(artist.images, { userId: 'u1', scope: 'artists', id: artist.id })).toBe(1)
    act(() => result.current[1]((prev) => prev.map((a) => (a.id === artist.id ? { ...a } : a))))

    await waitFor(async () => {
      const remote = (await backend.store.list('artistsMeta')).find((r) => r.id === 'new.artist')
      expect(remote?.images).toEqual([{ key: expect.stringMatching(/^user\/u1\/artists\/new\.artist\//) }])
    }, { timeout: 3000 })
  })
})

describe('the legacy image migration uploads image bytes (#110, bug 4)', () => {
  it('sends a JPEG Blob, not the data-URL text', async () => {
    seedReturningUser({ migrated: false })
    await idbPut('tattoo-images-v1', 'artist-images', secondId, ['data:image/jpeg;base64,bGVnYWN5'])
    const upload = vi.spyOn(backend.blobs, 'upload')

    renderHook(() => useArtistStorage(), { wrapper })

    await waitFor(() => expect(upload).toHaveBeenCalled())
    const body = upload.mock.calls[0][2]
    expect(body).toBeInstanceOf(Blob)
    expect(body.type).toBe('image/jpeg')
  })
})
