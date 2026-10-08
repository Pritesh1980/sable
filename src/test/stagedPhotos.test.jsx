import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { displayCacheImages } from '../data/legacyArtistImages'
import { resolveImage } from '../data/imageResolver'
import { useStorage } from '../hooks/useStorage'
import { ideasCodec } from '../data/imageCodec'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { stageImage, watchUploadOutbox } from '../data/imageStaging'
import { STAGED_IMAGES_DB, readOutbox } from '../data/stagedImageStore'
import { clearBlobUrls, keyForUrl, registerBlobUrl } from '../data/blobUrls'
import { stampAddedAt } from '../data/wall'
import { backend } from '../backend'

// #115. A photo added while its upload fails (offline, Supabase paused) used
// to vanish on reload: stored as { url: dataUrl }, it was dropped from the
// cache and the remote, and the local-only display path never restored it.
// Staged first, it has a key and a durable copy before it ever enters state.
// Since #116 state holds that key; the photo shows by resolving it (the tile's
// useImageSrc), which serves the staged device copy.

const PHOTO = 'data:image/jpeg;base64,b2ZmbGluZSBwaG90bw=='
const STAMP = '2026-09-01T10:00:00.000Z'
const ROW = { id: 'a1', handle: 'a1', name: '', tags: [], images: [], rank: 1, status: 'researching', notes: '', studio: null, updatedAt: STAMP }

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))

const cachedRow = () => JSON.parse(localStorage.getItem('tattoo_artists_meta')).find((a) => a.id === 'a1')
const stateRow = (view) => view.result.current[0].find((a) => a.id === 'a1')
const remoteRow = async () => (await backend.store.list('artistsMeta')).find((r) => r.id === 'a1')

function seedUser() {
  // Not the owner, so no curated defaults join the one artist under test.
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'someone@example.com' } }))
  localStorage.setItem('tattoo_artists_meta', JSON.stringify([ROW]))
  localStorage.setItem('tattoo_remote_u1_artistsMeta', JSON.stringify([ROW]))
  localStorage.setItem('tattoo_img_migrated_v1', '1')
}

function expectNoBase64InLocalStorage() {
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    expect(localStorage.getItem(key), key).not.toMatch(/data:|;base64,/)
  }
}

function deleteDb(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

function displayCache(id) {
  return new Promise((resolve) => {
    const req = indexedDB.open('tattoo-images-v1', 1)
    req.onupgradeneeded = (e) => e.target.result.createObjectStore('artist-images')
    req.onsuccess = (e) => {
      const db = e.target.result
      const get = db.transaction('artist-images', 'readonly').objectStore('artist-images').get(id)
      get.onsuccess = () => { db.close(); resolve(get.result) }
    }
  })
}

async function mount() {
  const view = renderHook(() => useArtistStorage(), { wrapper })
  await waitFor(() => expect(view.result.current?.[0]).toHaveLength(1))
  return view
}

// The Wall drop and the add-artist modal store a photo as { url, addedAt }.
async function addPhoto(view, shape = stampAddedAt) {
  const { key, url } = await stageImage(PHOTO, { userId: 'u1', scope: 'artists', id: 'a1' })
  act(() => view.result.current[1]((prev) => prev.map((a) => (
    a.id === 'a1' ? { ...a, images: [...(a.images || []), shape(url)] } : a
  ))))
  return key
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb(STAGED_IMAGES_DB)
  await deleteDb('tattoo-blobs-v1')
  await deleteDb('tattoo-images-v1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('a photo added while its upload fails (#115)', () => {
  it('is cached as its key at once, and never as base64', async () => {
    seedUser()
    vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    const view = await mount()

    const key = await addPhoto(view)

    expect(cachedRow().images).toEqual([{ key, addedAt: expect.any(String) }])
    expectNoBase64InLocalStorage()
  })

  it('survives a reload, shown from the copy staged on this device', async () => {
    seedUser()
    vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const first = await mount()
    const key = await addPhoto(first)
    first.unmount()

    clearBlobUrls() // nothing about the photo survives in memory
    const second = await mount()

    expect(stateRow(second).images).toEqual([{ key, addedAt: expect.any(String) }])
    expect(stateRow(second)).not.toHaveProperty('unresolvedImages')
    expect(await resolveImage(stateRow(second).images[0])).toBe(PHOTO)
    expect(cachedRow().images).toEqual([{ key, addedAt: expect.any(String) }])
    expectNoBase64InLocalStorage()
  })

  it('uploads once the backend is reachable again, and the remote row holds its key', async () => {
    seedUser()
    const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    const getUrl = vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const first = await mount()
    const key = await addPhoto(first)
    first.unmount()
    clearBlobUrls()
    const second = await mount()
    const stop = watchUploadOutbox('u1')
    // The record syncs without waiting for the bytes: the reload's catch-up
    // push carries the key while blob storage is still down.
    await waitFor(async () => expect((await remoteRow())?.images).toEqual([{ key, addedAt: expect.any(String) }]), { timeout: 3000 })
    expect(readOutbox().map((e) => e.key)).toEqual([key])
    expect(stateRow(second).images).toEqual([{ key, addedAt: expect.any(String) }])
    expect(await resolveImage(stateRow(second).images[0])).toBe(PHOTO)

    upload.mockRestore()
    getUrl.mockRestore()
    window.dispatchEvent(new Event('online'))

    await waitFor(async () => expect(await backend.blobs.getUrl(key)).toBe(PHOTO))
    await waitFor(() => expect(readOutbox()).toEqual([]))
    expect((await remoteRow()).images).toEqual([{ key, addedAt: expect.any(String) }])
    expectNoBase64InLocalStorage()
    stop()
  })

  it('a later flush retries the upload', async () => {
    seedUser()
    const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    const view = await mount()
    const key = await addPhoto(view)
    await waitFor(async () => expect((await remoteRow())?.images).toHaveLength(1), { timeout: 3000 })
    expect(readOutbox().map((e) => e.key)).toEqual([key])

    upload.mockRestore()
    act(() => view.result.current[1]((prev) => prev.map((a) => ({ ...a, notes: 'an unrelated edit' }))))

    await waitFor(async () => expect(await backend.blobs.getUrl(key)).toBe(PHOTO), { timeout: 3000 })
    expect(readOutbox()).toEqual([])
  })
})

describe('ideas and concepts sync through useStorage', () => {
  it('a later flush retries their uploads too', async () => {
    localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'someone@example.com' } }))
    const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useStorage('tattoo_ideas', [], ideasCodec), { wrapper })
    await waitFor(() => expect(result.current).toBeTruthy())
    const { key, url } = await stageImage(PHOTO, { userId: 'u1', scope: 'ideas', id: 'i1' })
    act(() => result.current[1]([{ id: 'i1', title: 'Moth', tags: [], images: [{ url, note: '' }] }]))
    const remoteIdea = async () => (await backend.store.list('ideas')).find((r) => r.id === 'i1')
    await waitFor(async () => expect((await remoteIdea())?.images).toEqual([{ key, note: '' }]), { timeout: 3000 })
    expect(readOutbox().map((e) => e.key)).toEqual([key])

    upload.mockRestore()
    act(() => result.current[1]((prev) => prev.map((idea) => ({ ...idea, title: 'Moth, again' }))))

    await waitFor(async () => expect(await backend.blobs.getUrl(key)).toBe(PHOTO), { timeout: 3000 })
    expect(readOutbox()).toEqual([])
  })
})

// On a backend whose URLs are not the bytes (Supabase signs one per key), the
// photo must not come back twice after a reload: once from its key, and again
// as a "legacy" data URL out of the IndexedDB display cache.
describe('after the upload lands on a signed-URL backend', () => {
  function signedUrls() {
    const real = backend.blobs.getUrl.bind(backend.blobs)
    vi.spyOn(backend.blobs, 'getUrl').mockImplementation(async (key) => {
      if (!(await real(key))) throw new Error('Object not found')
      return `https://signed.example/${key}`
    })
  }

  it('the display cache keeps a keyed photo as its ref, and only an unkeyed one as a data URL', () => {
    registerBlobUrl('user/u1/artists/a1/k.jpg', PHOTO)
    const legacy = 'data:image/jpeg;base64,bGVnYWN5'
    expect(displayCacheImages([
      PHOTO,
      { url: PHOTO, addedAt: STAMP },
      legacy,
      'images/demo/a1/1.webp',
      { key: 'user/u1/artists/a1/other.jpg' },
    ])).toEqual([
      { key: 'user/u1/artists/a1/k.jpg' },
      { key: 'user/u1/artists/a1/k.jpg', addedAt: STAMP },
      legacy,
      'images/demo/a1/1.webp',
      { key: 'user/u1/artists/a1/other.jpg' },
    ])
  })

  it.each([
    ['a bare URL (quick-add, artist detail)', (url) => url],
    ['a { url, addedAt } ref (Wall drop, add-artist modal)', stampAddedAt],
  ])('a reload shows the photo once, added as %s', async (_label, shape) => {
    seedUser()
    signedUrls()
    const first = await mount()
    const key = await addPhoto(first, shape)
    await waitFor(() => expect(readOutbox()).toEqual([])) // uploaded; the device copy stays for offline display
    await waitFor(async () => expect(await displayCache('a1')).toHaveLength(1))
    first.unmount()

    clearBlobUrls()
    const second = await mount()

    // Shown once, from the key's device copy (offline-safe) rather than the
    // signed URL, and never also as a legacy data-URL entry beside it.
    await new Promise((resolve) => setTimeout(resolve, 50)) // past the legacy overlay's hydration
    expect(stateRow(second).images).toHaveLength(1)
    expect(stateRow(second).images[0].key).toBe(key)
    expect(await resolveImage(stateRow(second).images[0])).toBe(PHOTO)
    expect(keyForUrl(PHOTO)).toBe(key)
  })
})
