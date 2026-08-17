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
const { resolveBlobKey, getCachedBlobUrl, keyForUrl, registerBlobUrl, clearBlobUrls } =
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
