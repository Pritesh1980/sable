import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'
import { clearBlobUrls } from '../data/blobUrls'
import { conceptsCodec } from '../data/imageCodec'
import { backend } from '../backend'

// #101. With a network backend, opening the app offline stripped the user's
// own photo refs ({ key }) out of the offline cache: a key that can't be
// resolved *right now* became '' in the display value, and the cache is
// written by canonicalizing that display value. And an artist edit made while
// the first pull was in flight was reverted when the pull landed.

const KEY = 'user/u1/artists/zoia/own-photo.jpg'
const STAMP = '2026-09-01T10:00:00.000Z'
const firstId = DEFAULT_ARTISTS[0].id
const secondId = DEFAULT_ARTISTS[1].id

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))

const noDuplicates = (images) => expect(new Set(images.map((i) => JSON.stringify(i))).size).toBe(images.length)
const cachedRow = (id) => JSON.parse(localStorage.getItem('tattoo_artists_meta')).find((a) => a.id === id)
const stateRow = (result, id) => result.current[0].find((a) => a.id === id)

function seedReturningUser({ ownPhoto = true } = {}) {
  const rows = DEFAULT_ARTISTS.map((a) => ({ ...a, images: [], notes: '', updatedAt: STAMP }))
  if (ownPhoto) rows[0].images = [{ key: KEY }]
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
  localStorage.setItem('tattoo_artists_meta', JSON.stringify(rows))
  localStorage.setItem('tattoo_remote_artistsMeta', JSON.stringify(rows))
  localStorage.setItem('tattoo_img_migrated_v1', '1')
  return rows
}

function goOffline() {
  vi.spyOn(backend.store, 'list').mockRejectedValue(new Error('offline'))
  vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
}

async function mount() {
  const { result } = renderHook(() => useArtistStorage(), { wrapper })
  await waitFor(() => expect(result.current).toBeTruthy())
  // Hydrated: the owner's curated static images have been merged in.
  await waitFor(() => expect(stateRow(result, firstId).images.length).toBeGreaterThan(0))
  return result
}

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('opening the app offline (#101)', () => {
  it('keeps an artist’s own photo ref in the offline cache, in place', async () => {
    seedReturningUser()
    goOffline()

    await mount()

    expect(cachedRow(firstId).images[0]).toEqual({ key: KEY })
    noDuplicates(cachedRow(firstId).images)
  })

  it('online, the same photo resolves, shows first, and is cached once', async () => {
    seedReturningUser()
    const photo = 'data:image/jpeg;base64,b3duLXBob3Rv'
    await backend.blobs.upload('u1', KEY, photo, 'image/jpeg')

    const result = await mount()

    await waitFor(() => expect(stateRow(result, firstId).images[0]).toBe(photo))
    expect(stateRow(result, firstId).unresolvedImages).toBeUndefined()
    expect(cachedRow(firstId).images[0]).toEqual({ key: KEY })
    noDuplicates(cachedRow(firstId).images)
  })

  it('keeps it through an edit made while offline', async () => {
    seedReturningUser()
    goOffline()
    const result = await mount()

    act(() => result.current[1]((prev) => prev.map((a) => (a.id === firstId ? { ...a, notes: 'offline note' } : a))))

    expect(cachedRow(firstId).notes).toBe('offline note')
    expect(cachedRow(firstId).images[0]).toEqual({ key: KEY })
  })

  it('never writes an image-less row to the cache on the first render', async () => {
    seedReturningUser()
    goOffline()
    const writes = []
    const setItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'tattoo_artists_meta') writes.push(JSON.parse(value).find((a) => a.id === firstId).images)
      return setItem(key, value)
    })

    await mount()

    expect(writes.length).toBeGreaterThan(0)
    for (const images of writes) expect(images).toContainEqual({ key: KEY })
  })

  it('keeps a concept’s and its variant’s image keys through the display round-trip', async () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const concept = {
      id: 'c1',
      prompt: 'moth',
      imageUrl: 'user/u1/concepts/c1/main.jpg',
      variants: [{ id: 'v1', imageUrl: 'user/u1/concepts/c1/v1.jpg' }],
    }

    const display = await conceptsCodec.toDisplay([concept])

    // Nothing to show offline — same as before, so the UI is unchanged…
    expect(display[0].imageUrl).toBe('')
    expect(display[0].variants[0].imageUrl).toBe('')
    // …but what gets cached and synced still points at the photos.
    expect(conceptsCodec.toCanonical(display)).toEqual([concept])
  })
})

describe('the first pull after opening (#101)', () => {
  it('does not revert an edit made while it was in flight', async () => {
    const rows = seedReturningUser({ ownPhoto: false })
    // The remote has a newer change to another artist, so we can tell when
    // the pull has landed.
    localStorage.setItem('tattoo_remote_artistsMeta', JSON.stringify(rows.map((a) =>
      a.id === secondId ? { ...a, notes: 'from another device', updatedAt: '2026-09-02T10:00:00.000Z' } : a
    )))
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const realList = backend.store.list.bind(backend.store)
    vi.spyOn(backend.store, 'list').mockImplementation(async (...args) => {
      await gate
      return realList(...args)
    })
    const result = await mount()

    act(() => result.current[1]((prev) => prev.map((a) => (a.id === firstId ? { ...a, notes: 'edited during pull' } : a))))
    release()
    await waitFor(() => expect(stateRow(result, secondId).notes).toBe('from another device'))

    expect(stateRow(result, firstId).notes).toBe('edited during pull')
    expect(cachedRow(firstId).notes).toBe('edited during pull')
  })

  it('does not bring back an artist deleted while it was in flight', async () => {
    const rows = seedReturningUser({ ownPhoto: false })
    localStorage.setItem('tattoo_remote_artistsMeta', JSON.stringify(rows.map((a) =>
      a.id === secondId ? { ...a, notes: 'from another device', updatedAt: '2026-09-02T10:00:00.000Z' } : a
    )))
    // A non-owner, so DEFAULT_ARTISTS can't put the deleted artist back.
    localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u2', email: 'someone@example.com' } }))
    let release
    const gate = new Promise((resolve) => { release = resolve })
    const realList = backend.store.list.bind(backend.store)
    vi.spyOn(backend.store, 'list').mockImplementation(async (...args) => {
      await gate
      return realList(...args)
    })
    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(result.current?.[0]?.length).toBe(rows.length))

    act(() => result.current[1]((prev) => prev.filter((a) => a.id !== firstId)))
    release()
    await waitFor(() => expect(stateRow(result, secondId).notes).toBe('from another device'))

    expect(stateRow(result, firstId)).toBeUndefined()
  })
})
