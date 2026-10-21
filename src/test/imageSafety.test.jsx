import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { canonicalizeImages } from '../data/artistsPolicy'
import { withStagedImages } from '../data/imageStaging'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'
import { clearBlobUrls, keyForUrl, registerBlobUrl, resolveBlobKey } from '../data/blobUrls'
import { backend } from '../backend'

// #110. Ways real photo data could be damaged on the Supabase backend. Bug 4 (the
// legacy migration uploading data-URL text) went with the migration itself (#149).

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

function seedReturningUser() {
  const rows = DEFAULT_ARTISTS.map((a) => ({ ...a, images: [], notes: '', updatedAt: STAMP }))
  rows[0].images = [{ key: KEY }]
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
  localStorage.setItem('tattoo_artists_meta', JSON.stringify(rows))
  localStorage.setItem('tattoo_remote_artistsMeta', JSON.stringify(rows))
}

function deleteDb(name) {
  return new Promise((res) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => res()
  })
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
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
    await waitFor(() => expect(stateRow(result, firstId)?.images[0]).toEqual({ key: KEY }))
    // The photo's tile resolves its key to a signed URL (#116: state holds the
    // key, the tile the URL).
    const shown = await resolveBlobKey(KEY)
    expect(shown).toMatch(/^https:\/\/signed\.example\//)

    // An hour later the photo's <img> errors and ArtistImage asks for a fresh
    // URL (#82) — the old one is still registered.
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

// Since #115 the screenshot is staged (a key and a durable copy) before the
// artist is added, rather than uploaded afterwards.
describe('inline screenshots get a key (#110, bug 2)', () => {
  const A = 'data:image/jpeg;base64,c2hvdEE='
  const B = 'data:image/jpeg;base64,c2hvdEI='

  it('stages bare and { url } data URLs, registering each under a per-artist key', async () => {
    const commit = vi.fn()
    await withStagedImages([A, { url: B, addedAt: STAMP }, { key: KEY }, 'images/demo/x.webp'], {
      userId: 'u1', scope: 'artists', id: 'new.artist',
    }, commit)

    expect(commit).toHaveBeenCalledTimes(1)
    expect(keyForUrl(A)).toMatch(/^user\/u1\/artists\/new\.artist\//)
    expect(keyForUrl(B)).toMatch(/^user\/u1\/artists\/new\.artist\//)
  })

  it('skips images that already have a key, and does nothing without a user', async () => {
    registerBlobUrl(KEY, A)
    const upload = vi.spyOn(backend.blobs, 'upload')
    const commit = vi.fn()

    withStagedImages([A], { userId: 'u1', scope: 'artists', id: 'a' }, commit)
    withStagedImages([B], { userId: undefined, scope: 'artists', id: 'a' }, commit)

    expect(commit).toHaveBeenCalledTimes(2)
    expect(keyForUrl(B)).toBeNull()
    expect(upload).not.toHaveBeenCalled()
  })

  it('a quick-added artist reaches the remote with { key }, not a dropped photo', async () => {
    seedReturningUser()
    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(stateRow(result, firstId)?.images.length).toBeGreaterThan(0))

    const artist = { id: 'new.artist', handle: 'new.artist', name: '', tags: [], images: [A], rank: 99, status: 'researching', notes: '' }
    await withStagedImages(artist.images, { userId: 'u1', scope: 'artists', id: artist.id }, () => {
      act(() => result.current[1]((prev) => [...prev, artist]))
    })

    await waitFor(async () => {
      const remote = (await backend.store.list('artistsMeta')).find((r) => r.id === 'new.artist')
      expect(remote?.images).toEqual([{ key: expect.stringMatching(/^user\/u1\/artists\/new\.artist\//) }])
    }, { timeout: 3000 })
  })
})
