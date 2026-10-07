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

  // State resolved at hydration can still hold the old url, and canonicalizing
  // an unmapped url stores it in place of the key (#110) — so a superseded url
  // keeps its mapping. The map grows by one entry per key per refresh.
  it('keeps a superseded url mapped to its key once the key is re-registered', () => {
    registerBlobUrl('k1', 'https://signed.example/old')
    registerBlobUrl('k1', 'https://signed.example/new')

    expect(keyForUrl('https://signed.example/old')).toBe('k1')
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
// result is baked into long-lived React state (imageCodec.js for
// ideas/concepts; artists hold refs since #116). #29 keeps the *cache*
// honest about TTL, but nothing re-derives a value already sitting in state
// from it, so an hour-plus-idle session can end up rendering an <img> whose
// src is a genuinely expired signed URL. refreshedBlobUrl is the recovery
// path an <img>'s onError calls into: given the URL that just failed, hand
// back a fresh one if the underlying key can actually produce a different
// one, or null if there's nothing more to try (so the caller falls through
// to its normal broken-image handling instead of retrying forever). Since
// #110 a superseded url keeps its reverse mapping, so this also recovers a
// url whose key has already been refreshed by someone else.
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

  // Until #110 a superseded url lost its reverse mapping, so this returned
  // null — an accepted gap then, and the same dropped mapping that let an
  // expired url be saved in place of its key. The mapping is now kept.
  it('recovers a url that was superseded before it failed to load', async () => {
    backend.blobs.urlTtlMs = 3600_000
    vi.useFakeTimers()
    getUrl.mockResolvedValueOnce('https://signed.example/first')
    const first = await resolveBlobKey('k1')

    vi.setSystemTime(Date.now() + 3600_000 - 30_000)
    getUrl.mockResolvedValueOnce('https://signed.example/second')
    await resolveBlobKey('k1')

    // A stale <img> still showing `first` finally errors; `first` still maps
    // to k1, whose cache already holds `second`.
    const refreshed = await refreshedBlobUrl(first)
    expect(refreshed).toBe('https://signed.example/second')
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
