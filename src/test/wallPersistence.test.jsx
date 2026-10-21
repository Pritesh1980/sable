import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { canonicalizeImages, normalizeArtistImages } from '../data/artistsPolicy'
import { resolveImage } from '../data/imageResolver'
import { useArtistStorage } from '../hooks/useArtistStorage'
import { AuthProvider } from '../context/AuthContext'
import { useAuth } from '../context/useAuth'
import { stampAddedAt } from '../data/wall'
import { registerBlobUrl, clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

// Schema tests proving `addedAt` (stamped by the quick-add / drop-zone flows,
// W1's stampAddedAt) survives the full persistence round trip: what a producer
// emits → canonical ref (localStorage / remote) → artist state, which holds
// that ref itself since #116.

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

describe('artist state keeps addedAt on its refs (#116)', () => {
  beforeEach(() => clearBlobUrls())

  it('normalizes a { url, addedAt } a producer emitted to { key, addedAt }', () => {
    registerBlobUrl('user/1/artists/a/n.jpg', 'data:image/jpeg;base64,NNN')
    const stamped = stampAddedAt('data:image/jpeg;base64,NNN')
    expect(normalizeArtistImages([stamped])).toEqual([{ key: 'user/1/artists/a/n.jpg', addedAt: stamped.addedAt }])
  })

  it('keeps a { url, addedAt } static path as it is', () => {
    const ref = { url: '/images/static.jpg', addedAt: '2026-07-01T00:00:00.000Z' }
    expect(normalizeArtistImages([ref])).toEqual([ref])
  })

  it('a { key, addedAt } ref still resolves to its photo', async () => {
    const key = 'user/1/artists/a/resolve.jpg'
    await backend.blobs.upload('1', key, 'data:image/jpeg;base64,BBB', 'image/jpeg')
    expect(await resolveImage({ key, addedAt: '2026-07-01T00:00:00.000Z' })).toBe('data:image/jpeg;base64,BBB')
  })
})

// End-to-end: a device with an empty local IndexedDB cache (a "second device")
// pulling purely from the remote canonical record must still see addedAt.
describe('addedAt survives a cross-device round trip through useArtistStorage', () => {
  const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>

  beforeEach(() => {
    localStorage.clear()
    clearBlobUrls()
  })

  it('pulls addedAt from a remote { key, addedAt } canonical ref', async () => {
    const key = 'user/local-second@device.com/artists/c1/x.jpg'
    // The remote row must be written under the same signed-in identity that
    // will later read it back (#28 namespaces the local backend's simulated
    // remote per user, matching how Supabase's RLS already scopes writes).
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'local-second@device.com', email: 'second@device.com' } })
    )
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

    const { result } = renderHook(() => ({ auth: useAuth(), store: useArtistStorage() }), { wrapper })
    await waitFor(() => expect(result.current.store[0]).toHaveLength(1))

    const [artist] = result.current.store[0]
    expect(artist.images[0]).toEqual({ key, addedAt: '2026-07-01T00:00:00.000Z' })
    expect(await resolveImage(artist.images[0])).toBe('data:image/jpeg;base64,REMOTE')
  })
})
