import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage } from '../hooks/useArtistStorage'
import useImageSrc from '../hooks/useImageSrc'
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
// the first pull was in flight was reverted when the pull landed. Since #116
// state holds the refs themselves and each tile resolves its own photo
// (useImageSrc), so "unavailable" is a per-photo status, not a state field.

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
  // Painted: the owner's starter photos are in the stored rows.
  await waitFor(() => expect(stateRow(result, firstId).images.length).toBeGreaterThan(0))
  return result
}

// How a tile showing this ref settles: every status it reports, in order.
async function settledStatuses(ref) {
  const seen = []
  const { result } = renderHook(() => {
    const out = useImageSrc(ref)
    seen.push(out.status)
    return out
  })
  await waitFor(() => expect(['ready', 'unavailable']).toContain(result.current.status))
  return { seen, src: result.current.src }
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

    expect(stateRow(result, firstId).images[0]).toEqual({ key: KEY })
    expect(stateRow(result, firstId)).not.toHaveProperty('unresolvedImages')
    expect((await settledStatuses(stateRow(result, firstId).images[0])).src).toBe(photo)
    expect(cachedRow(firstId).images[0]).toEqual({ key: KEY })
    noDuplicates(cachedRow(firstId).images)
    noDuplicates(stateRow(result, firstId).images)
  })

  // #102 draws a placeholder for a photo that is unavailable, so a photo that
  // is merely still loading must never look unavailable.
  it('online, never marks a photo that is only loading as unavailable', async () => {
    seedReturningUser()
    const photo = 'data:image/jpeg;base64,b3duLXBob3Rv'
    await backend.blobs.upload('u1', KEY, photo, 'image/jpeg')
    const rows = []
    const { result } = renderHook(() => {
      const value = useArtistStorage()
      rows.push(value?.[0]?.find((a) => a.id === firstId))
      return value
    }, { wrapper })
    await waitFor(() => expect(result.current).toBeTruthy())

    // The ref is in place in every published value…
    for (const row of rows.filter(Boolean)) expect(row.images[0]).toEqual({ key: KEY })
    // …and its tile goes loading → ready, never unavailable.
    const { seen, src } = await settledStatuses(stateRow(result, firstId).images[0])
    expect(seen).toContain('loading')
    expect(seen).not.toContain('unavailable')
    expect(src).toBe(photo)
  })

  it('offline, marks the photo it could not load as unavailable', async () => {
    seedReturningUser()
    goOffline()
    const result = await mount()
    expect(stateRow(result, firstId).images[0]).toEqual({ key: KEY })
    const { seen } = await settledStatuses(stateRow(result, firstId).images[0])
    expect(seen.at(-1)).toBe('unavailable')
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

  it('a concept’s and its variant’s image keys are what state holds offline', async () => {
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const concept = {
      id: 'c1',
      prompt: 'moth',
      imageUrl: 'user/u1/concepts/c1/main.jpg',
      variants: [{ id: 'v1', imageUrl: 'user/u1/concepts/c1/v1.jpg' }],
    }

    const display = await conceptsCodec.toDisplay([concept])

    // The keys stay in state; whether they can be shown is decided at render.
    expect(display).toEqual([concept])
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
