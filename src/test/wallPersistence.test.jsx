import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { canonicalizeImages, displayFromCanonical } from '../hooks/useArtistStorage'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { stampAddedAt } from '../data/wall'
import { registerBlobUrl, clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

// Schema tests proving `addedAt` (stamped by the quick-add / drop-zone flows,
// W1's stampAddedAt) survives the full persistence round trip: display image
// → canonical ref (localStorage / remote) → back to a display image.

describe('canonicalizeImages preserves addedAt', () => {
  beforeEach(() => clearBlobUrls())

  it('keeps addedAt on an already-keyed ref', () => {
    const stamped = stampAddedAt({ key: 'user/1/artists/a/1.jpg' })
    const [out] = canonicalizeImages([stamped])
    expect(out).toEqual({ key: 'user/1/artists/a/1.jpg', addedAt: stamped.addedAt })
  })

  it('resolves a { url, addedAt } ref (from stampAddedAt on a string) to { key, addedAt } once the url is a known blob', () => {
    registerBlobUrl('user/1/artists/a/2.jpg', 'data:image/jpeg;base64,AAA')
    const stamped = stampAddedAt('data:image/jpeg;base64,AAA')
    const [out] = canonicalizeImages([stamped])
    expect(out).toEqual({ key: 'user/1/artists/a/2.jpg', addedAt: stamped.addedAt })
  })

  it('keeps addedAt on a static/external URL that never becomes a blob key', () => {
    const stamped = stampAddedAt('/images/artists/a/3.jpg')
    const [out] = canonicalizeImages([stamped])
    expect(out).toEqual({ url: '/images/artists/a/3.jpg', addedAt: stamped.addedAt })
  })

  it('drops an un-migrated data-URL ref entirely (stays IndexedDB-only, like plain string data-URLs)', () => {
    const stamped = stampAddedAt('data:image/jpeg;base64,UNMIGRATED')
    expect(canonicalizeImages([stamped])).toEqual([])
  })

  it('leaves plain strings and unstamped { key } refs behaving exactly as before', () => {
    expect(canonicalizeImages(['/images/static.jpg'])).toEqual(['/images/static.jpg'])
    expect(canonicalizeImages([{ key: 'abc' }])).toEqual([{ key: 'abc' }])
  })
})

describe('displayFromCanonical preserves addedAt', () => {
  beforeEach(() => clearBlobUrls())

  it('resolves a { key, addedAt } ref back to { url, addedAt }', async () => {
    const key = 'user/1/artists/a/resolve.jpg'
    await backend.blobs.upload('1', key, 'data:image/jpeg;base64,BBB', 'image/jpeg')
    const [display] = await displayFromCanonical([{ key, addedAt: '2026-07-01T00:00:00.000Z' }])
    expect(display).toEqual({ url: 'data:image/jpeg;base64,BBB', addedAt: '2026-07-01T00:00:00.000Z' })
  })

  it('resolves a { url, addedAt } ref (no key) back to itself', async () => {
    const [display] = await displayFromCanonical([{ url: '/images/static.jpg', addedAt: '2026-07-01T00:00:00.000Z' }])
    expect(display).toEqual({ url: '/images/static.jpg', addedAt: '2026-07-01T00:00:00.000Z' })
  })

  it('resolves a ref with no addedAt back to a plain string, unchanged from before', async () => {
    const key = 'user/1/artists/a/plain.jpg'
    await backend.blobs.upload('1', key, 'data:image/jpeg;base64,CCC', 'image/jpeg')
    const [display] = await displayFromCanonical([{ key }])
    expect(display).toBe('data:image/jpeg;base64,CCC')
  })
})

// End-to-end: a device with an empty local IndexedDB cache (a "second device")
// hydrating purely from the remote canonical record must still see addedAt.
describe('addedAt survives a cross-device round trip through useArtistStorage', () => {
  const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

  beforeEach(() => {
    localStorage.clear()
    clearBlobUrls()
  })

  it('hydrates addedAt from a remote { key, addedAt } canonical ref', async () => {
    const key = 'user/local-second@device.com/artists/c1/x.jpg'
    await backend.blobs.upload('u', key, 'data:image/jpeg;base64,REMOTE', 'image/jpeg')
    await backend.store.upsert('artistsMeta', [
      {
        id: 'c1',
        handle: 'x',
        rank: 1,
        tags: [],
        images: [{ key, addedAt: '2026-07-01T00:00:00.000Z' }],
        updatedAt: '2026-06-01T00:00:00Z',
      },
    ])
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'local-second@device.com', email: 'second@device.com' } })
    )

    const { result } = renderHook(() => ({ auth: useAuth(), store: useArtistStorage() }), { wrapper })
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))

    const [artist] = result.current.store[0]
    expect(artist.images[0]).toEqual({ url: 'data:image/jpeg;base64,REMOTE', addedAt: '2026-07-01T00:00:00.000Z' })
  })
})
