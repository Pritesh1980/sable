import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'
import { clearBlobUrls, registerBlobUrl } from '../data/blobUrls'
import { normalizeArtistImages } from '../data/artistsPolicy'
import { backend } from '../backend'

const KEY = 'user/u1/artists/zoia/own-photo.jpg'
const STAMP = '2026-09-01T10:00:00.000Z'
const firstId = DEFAULT_ARTISTS[0].id

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))

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

async function mount() {
  const { result } = renderHook(() => useArtistStorage(), { wrapper })
  await waitFor(() => expect(result.current).toBeTruthy())
  await waitFor(() => expect(stateRow(result, firstId).images.length).toBeGreaterThan(0))
  return result
}

async function clearLegacyCache() {
  await new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('tattoo-images-v1')
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await clearLegacyCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await clearLegacyCache()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// State is its own normalised form: normalising again changes nothing. (Inline
// data urls are kept by normalisation, so the D2 legacy overlay satisfies this too;
// only *persisting* strips them.)
const expectNormalised = (rows) =>
  rows.forEach((a) => expect(normalizeArtistImages(a.images)).toEqual(a.images))

describe('artist state is its own normalised form (#116)', () => {
  it('after hydrate', async () => {
    seedReturningUser()
    const result = await mount()
    expectNormalised(result.current[0])
  })

  it('after an edit with a producer-shaped photo', async () => {
    seedReturningUser({ ownPhoto: false })
    const result = await mount()
    registerBlobUrl('user/u1/artists/zoia/edit.jpg', 'data:image/png;base64,EDIT')
    act(() => result.current[1]((prev) => prev.map((a) => (a.id === firstId
      ? { ...a, images: [...a.images, 'data:image/png;base64,EDIT'] } : a))))
    expectNormalised(result.current[0])
  })

  it('after an edit that re-adds a photo under a second spelling', async () => {
    seedReturningUser()
    const result = await mount()
    act(() => result.current[1]((prev) => prev.map((a) => (a.id === firstId
      ? { ...a, images: [...a.images, { key: KEY, addedAt: 'x' }] } : a))))
    expect(stateRow(result, firstId).images.filter((i) => i?.key === KEY)).toHaveLength(1)
    expectNormalised(result.current[0])
  })

  it('after a pull that brings a remote photo and a remote removal', async () => {
    const rows = seedReturningUser()
    const removed = DEFAULT_ARTISTS[0].images[0]
    const remote = rows.map((a) => (a.id === firstId
      ? {
          ...a,
          images: [{ key: KEY }, { key: 'user/u1/artists/zoia/remote.jpg' }],
          removedImages: [{ ref: removed, removedAt: '2026-09-02T10:00:00.000Z' }],
          updatedAt: '2026-09-02T10:00:00.000Z',
        }
      : a))
    vi.spyOn(backend.store, 'list').mockResolvedValue(remote)
    const result = await mount()
    await waitFor(() =>
      expect(stateRow(result, firstId).images.some((i) => i?.key === 'user/u1/artists/zoia/remote.jpg')).toBe(true))
    expect(stateRow(result, firstId).images).not.toContain(removed)
    expectNormalised(result.current[0])
  })
})
