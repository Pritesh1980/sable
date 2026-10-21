import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { DEFAULT_ARTISTS } from '../data/artists'
import { clearBlobUrls, registerBlobUrl } from '../data/blobUrls'
import { backend } from '../backend'

// #116: artist state holds the stored refs themselves. Display resolution is
// per tile (useImageSrc).

const KEY = 'user/u1/artists/zoia/own-photo.jpg'
const STAMP = '2026-09-01T10:00:00.000Z'
const firstId = DEFAULT_ARTISTS[0].id

function Gate({ children }) {
  const auth = useAuth()
  return auth?.user ? children : null
}
const wrapper = ({ children }) => createElement(AuthProvider, null, createElement(Gate, null, children))

const noDuplicates = (images) => expect(new Set(images.map((i) => JSON.stringify(i))).size).toBe(images.length)
const stateRow = (result, id) => result.current[0].find((a) => a.id === id)

function seedReturningUser({ ownPhoto = true } = {}) {
  const rows = DEFAULT_ARTISTS.map((a) => ({ ...a, images: [], notes: '', updatedAt: STAMP }))
  if (ownPhoto) rows[0].images = [{ key: KEY }]
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: { id: 'u1', email: 'owner@example.com' } }))
  localStorage.setItem('tattoo_artists_meta', JSON.stringify(rows))
  localStorage.setItem('tattoo_remote_artistsMeta', JSON.stringify(rows))
  return rows
}

function goOffline() {
  vi.spyOn(backend.store, 'list').mockRejectedValue(new Error('offline'))
  vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
}

async function mount() {
  const { result } = renderHook(() => useArtistStorage(), { wrapper })
  await waitFor(() => expect(result.current).toBeTruthy())
  await waitFor(() => expect(stateRow(result, firstId).images.length).toBeGreaterThan(0))
  return result
}

const edit = (result, change) =>
  act(() => result.current[1]((prev) => prev.map((a) => (a.id === firstId ? change(a) : a))))

beforeEach(() => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('artist state holds refs (#116)', () => {
  it('keeps an uncached { key } in state at its position, offline, from the first paint', async () => {
    seedReturningUser()
    goOffline()
    const { result } = renderHook(() => useArtistStorage(), { wrapper })
    await waitFor(() => expect(result.current).toBeTruthy())
    // no hydration wait: the ref is in the very first published value
    expect(stateRow(result, firstId).images[0]).toEqual({ key: KEY })
    expect(stateRow(result, firstId).images.length).toBeGreaterThan(1) // starters follow
    expect(stateRow(result, firstId)).not.toHaveProperty('unresolvedImages')
  })

  it('converts a registered display url a producer emitted into { key } at the edit', async () => {
    seedReturningUser({ ownPhoto: false })
    const result = await mount()
    registerBlobUrl('user/u1/artists/zoia/new.jpg', 'data:image/png;base64,NEW')
    edit(result, (a) => ({ ...a, images: [...a.images, 'data:image/png;base64,NEW'] }))
    expect(stateRow(result, firstId).images.at(-1)).toEqual({ key: 'user/u1/artists/zoia/new.jpg' })
    expect(localStorage.getItem('tattoo_artists_meta')).not.toContain('data:image')
  })

  it('keeps one copy when an edit adds a photo under a second spelling, first position wins', async () => {
    seedReturningUser()
    const result = await mount()
    const starter = stateRow(result, firstId).images.find((i) => typeof i === 'string')
    edit(result, (a) => ({ ...a, images: [...a.images, { key: KEY, addedAt: 'x' }, `/${starter}`] }))
    const images = stateRow(result, firstId).images
    expect(images[0]).toEqual({ key: KEY })
    expect(images.filter((i) => i?.key === KEY)).toHaveLength(1)
    expect(images.filter((i) => i === starter || i === `/${starter}`)).toHaveLength(1)
    noDuplicates(images)
  })

  it('an unregistered inline data url stays on screen but is never persisted', async () => {
    seedReturningUser({ ownPhoto: false })
    const result = await mount()
    edit(result, (a) => ({ ...a, images: [...a.images, 'data:image/png;base64,INLINE'] }))
    expect(stateRow(result, firstId).images).toContain('data:image/png;base64,INLINE')
    expect(localStorage.getItem('tattoo_artists_meta')).not.toContain('INLINE')
  })
})
