import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// #29. Supabase signed URLs expire after SIGNED_URL_TTL (1h) but blobUrls.js
// cached them forever — a long-running session could hold a broken image URL
// indefinitely even though the underlying blob key is still valid.
//
// Backends that never expire their URLs (local's data: URLs, browser object
// URLs) must not be affected — a fake backend without urlTtlMs asserts that.

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))

const { backend } = await import('../backend')
const { resolveBlobKey, getCachedBlobUrl, keyForUrl, registerBlobUrl, clearBlobUrls, refreshedBlobUrl } =
  await import('../data/blobUrls')

beforeEach(() => {
  clearBlobUrls()
  getUrl.mockReset()
  delete backend.blobs.urlTtlMs
})
afterEach(() => vi.useRealTimers())

describe('blob URL cache respects a backend TTL (#29)', () => {
  it('reuses a fresh cached url without calling the backend again', async () => {
    backend.blobs.urlTtlMs = 3600_000
    getUrl.mockResolvedValue('https://signed.example/fresh')

    const first = await resolveBlobKey('k1')
    const second = await resolveBlobKey('k1')

    expect(first).toBe('https://signed.example/fresh')
    expect(second).toBe('https://signed.example/fresh')
    expect(getUrl).toHaveBeenCalledTimes(1)
  })

  it('refreshes a url once it is old enough to be near TTL expiry', async () => {
    backend.blobs.urlTtlMs = 3600_000
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('https://signed.example/first')

    const first = await resolveBlobKey('k1')
    expect(first).toBe('https://signed.example/first')

    // 30s from real expiry — inside the refresh margin.
    vi.setSystemTime(Date.now() + 3600_000 - 30_000)
    getUrl.mockResolvedValueOnce('https://signed.example/second')

    const second = await resolveBlobKey('k1')
    expect(second).toBe('https://signed.example/second')
    expect(getUrl).toHaveBeenCalledTimes(2)
  })

  it('does not refresh well before expiry', async () => {
    backend.blobs.urlTtlMs = 3600_000
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('https://signed.example/first')
    await resolveBlobKey('k1')

    // 5 minutes in — nowhere near the 1h TTL.
    vi.setSystemTime(Date.now() + 5 * 60_000)
    const second = await resolveBlobKey('k1')

    expect(second).toBe('https://signed.example/first')
    expect(getUrl).toHaveBeenCalledTimes(1)
  })

  it('never refreshes a url from a backend with no TTL (local/object URLs)', async () => {
    // backend.blobs.urlTtlMs left unset, as the local adapter does.
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('data:image/jpeg;base64,AAA')
    await resolveBlobKey('k1')

    // Advance far past any plausible signed-URL TTL.
    vi.setSystemTime(Date.now() + 10 * 3600_000)
    const second = await resolveBlobKey('k1')

    expect(second).toBe('data:image/jpeg;base64,AAA')
    expect(getUrl).toHaveBeenCalledTimes(1)
  })
})

describe('review follow-ups (#29)', () => {
  it('getCachedBlobUrl does not hand back an expired url, and kicks off a refresh', async () => {
    backend.blobs.urlTtlMs = 3600_000
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('https://signed.example/first')
    await resolveBlobKey('k1')

    expect(getCachedBlobUrl('k1')).toBe('https://signed.example/first')

    // Past the refresh margin — a synchronous read must not serve this.
    vi.setSystemTime(Date.now() + 3600_000 - 30_000)
    getUrl.mockResolvedValueOnce('https://signed.example/second')

    expect(getCachedBlobUrl('k1')).toBe('')
    // The background refresh it triggered needs its microtasks flushed.
    await vi.waitFor(() => expect(getCachedBlobUrl('k1')).toBe('https://signed.example/second'))
  })

  it('does not leak the old url in the reverse map once a key is re-registered', () => {
    registerBlobUrl('k1', 'https://signed.example/old')
    registerBlobUrl('k1', 'https://signed.example/new')

    expect(keyForUrl('https://signed.example/old')).toBeNull()
    expect(keyForUrl('https://signed.example/new')).toBe('k1')
  })

  it('falls back to the last cached url when a refresh fails, instead of going blank', async () => {
    backend.blobs.urlTtlMs = 3600_000
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('https://signed.example/first')
    await resolveBlobKey('k1')

    vi.setSystemTime(Date.now() + 3600_000 - 30_000)
    getUrl.mockRejectedValueOnce(new Error('network blip'))

    const result = await resolveBlobKey('k1')
    expect(result).toBe('https://signed.example/first')
  })
})

// #82. Resolving a key into a display URL happens once, at hydration — the
// result is baked into long-lived React state (useArtistStorage's
// buildArtists, imageCodec.js for ideas/concepts). #29 keeps the *cache*
// honest about TTL, but nothing re-derives a value already sitting in state
// from it, so an hour-plus-idle session can end up rendering an <img> whose
// src is a genuinely expired signed URL. refreshedBlobUrl is the recovery
// path an <img>'s onError calls into: given the URL that just failed, hand
// back a fresh one if the underlying key can actually produce a different
// one, or null if there's nothing more to try (so the caller falls through
// to its normal broken-image handling instead of retrying forever). Because
// keyForUrl only ever tracks a key's *current* url (older ones are dropped
// on purpose, #29), this can only recover a url that's still the most
// recently resolved one for its key — see the "superseded" test below for
// the one case that's a known, accepted gap rather than a bug.
describe('refreshedBlobUrl (#82)', () => {
  it('returns a fresh url when the failed url maps to a key whose cache entry has expired', async () => {
    backend.blobs.urlTtlMs = 3600_000
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('https://signed.example/first')
    const first = await resolveBlobKey('k1')

    vi.setSystemTime(Date.now() + 3600_000 - 30_000)
    getUrl.mockResolvedValueOnce('https://signed.example/second')

    const refreshed = await refreshedBlobUrl(first)
    expect(refreshed).toBe('https://signed.example/second')
  })

  // registerBlobUrl deliberately drops a superseded url's reverse mapping
  // once a key resolves to something new (#29 — otherwise it leaks an entry
  // per refresh over a long session). That means a url this component never
  // even displayed the *most recent* resolution of can't be traced back to
  // its key any more by the time onError fires — a known, accepted gap this
  // is not attempting to close, since doing so would mean never cleaning up
  // the reverse map at all. It degrades safely: null, same as a genuinely
  // broken image, not a crash or a wrong result.
  it('returns null for a url that was superseded before it ever failed to load', async () => {
    backend.blobs.urlTtlMs = 3600_000
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('https://signed.example/first')
    const first = await resolveBlobKey('k1')

    vi.setSystemTime(Date.now() + 3600_000 - 30_000)
    getUrl.mockResolvedValueOnce('https://signed.example/second')
    await resolveBlobKey('k1')

    // A stale <img> still showing `first` finally errors — but `first`'s
    // reverse mapping is already gone, superseded by `second` above.
    const refreshed = await refreshedBlobUrl(first)
    expect(refreshed).toBeNull()
  })

  it('returns null for a url with no known key (a static path, or never uploaded)', async () => {
    const refreshed = await refreshedBlobUrl('/images/artists/zoia.ink/1.jpg')
    expect(refreshed).toBeNull()
    expect(getUrl).not.toHaveBeenCalled()
  })

  it('returns null when the cache still considers the url fresh (a genuinely broken image, not an expiry)', async () => {
    backend.blobs.urlTtlMs = 3600_000
    getUrl.mockResolvedValueOnce('https://signed.example/first')
    const first = await resolveBlobKey('k1')

    // No time has passed — the cache has no reason to think this is stale.
    const refreshed = await refreshedBlobUrl(first)
    expect(refreshed).toBeNull()
    expect(getUrl).toHaveBeenCalledTimes(1)
  })
})
