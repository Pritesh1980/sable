import { describe, it, expect, beforeEach } from 'vitest'
import { getImageUrl, getImageNote, normalizeReferenceImages } from '../data/planning'
import {
  registerBlobUrl,
  getCachedBlobUrl,
  keyForUrl,
  resolveBlobKey,
  clearBlobUrls,
} from '../data/blobUrls'
import { backend } from '../backend'

describe('blob URL cache', () => {
  beforeEach(() => clearBlobUrls())

  it('registers and reverse-maps key ↔ url', () => {
    registerBlobUrl('user/u1/artists/a1/x.jpg', 'data:image/jpeg;base64,AAA')
    expect(getCachedBlobUrl('user/u1/artists/a1/x.jpg')).toBe('data:image/jpeg;base64,AAA')
    expect(keyForUrl('data:image/jpeg;base64,AAA')).toBe('user/u1/artists/a1/x.jpg')
  })

  it('resolves a key through the backend blob store and caches it', async () => {
    const key = 'user/u1/artists/a1/resolve.jpg'
    await backend.blobs.upload('u1', key, 'data:image/jpeg;base64,BBB', 'image/jpeg')
    const url = await resolveBlobKey(key)
    expect(url).toBe('data:image/jpeg;base64,BBB')
    // now cached synchronously
    expect(getCachedBlobUrl(key)).toBe('data:image/jpeg;base64,BBB')
  })
})

describe('getImageUrl with keys', () => {
  beforeEach(() => clearBlobUrls())

  it('returns the cached url for a {key} entry', () => {
    registerBlobUrl('k1', 'https://signed.example/k1')
    expect(getImageUrl({ key: 'k1' })).toBe('https://signed.example/k1')
  })

  it('still handles strings and {url} entries', () => {
    expect(getImageUrl('/images/static.jpg')).toBe('/images/static.jpg')
    expect(getImageUrl({ url: 'data:image/png;base64,ZZZ', note: 'n' })).toBe('data:image/png;base64,ZZZ')
    expect(getImageNote({ url: 'x', note: 'hi' })).toBe('hi')
  })

  it('returns empty string for an unresolved key', () => {
    expect(getImageUrl({ key: 'not-resolved-yet' })).toBe('')
  })
})

describe('normalizeReferenceImages preserves keys', () => {
  it('keeps key alongside url/note and keeps key-only entries', () => {
    const out = normalizeReferenceImages([
      'data:image/jpeg;base64,AAA',
      { url: 'data:x', note: 'a', key: 'k1' },
      { key: 'k2', note: 'b' },
    ])
    expect(out[0]).toEqual({ url: 'data:image/jpeg;base64,AAA', note: '' })
    expect(out[1]).toEqual({ url: 'data:x', note: 'a', key: 'k1' })
    expect(out[2]).toEqual({ url: '', note: 'b', key: 'k2' })
  })
})
