import { describe, it, expect } from 'vitest'
import { isBlobKey, refKey, refIdentity } from '../data/imageRef'

describe('isBlobKey', () => {
  it('is true only for strings that start with "user/"', () => {
    expect(isBlobKey('user/u1/artists/a/1.jpg')).toBe(true)
    expect(isBlobKey('images/artists/a/1.jpg')).toBe(false)
    expect(isBlobKey('/images/artists/a/1.jpg')).toBe(false)
    expect(isBlobKey('https://example.com/user/x.jpg')).toBe(false)
    expect(isBlobKey('data:image/png;base64,AAAA')).toBe(false)
    expect(isBlobKey('')).toBe(false)
    expect(isBlobKey(null)).toBe(false)
    expect(isBlobKey({ key: 'user/u1/a.jpg' })).toBe(false)
  })
})

describe('refKey', () => {
  it('returns the blob key from a { key } ref, a { url } ref, or a bare key string', () => {
    expect(refKey({ key: 'user/u1/a.jpg', addedAt: 'x' })).toBe('user/u1/a.jpg')
    expect(refKey('user/u1/a.jpg')).toBe('user/u1/a.jpg')
    expect(refKey({ url: 'user/u1/a.jpg' })).toBe('user/u1/a.jpg')
  })

  it('ignores an object key that is not a blob key and falls through to its url', () => {
    // Positive isBlobKey: only `user/…` is blob-backed (#113). A legacy/mixed
    // ref whose key is something else is displayed from its url, as before.
    const mixed = { key: 'blob-key', url: 'images/artists/a/1.jpg' }
    expect(refKey(mixed)).toBe('')
    expect(refIdentity(mixed)).toBe(refIdentity('images/artists/a/1.jpg'))
    expect(refKey({ key: 'blob-key' })).toBe('')
  })

  it('returns "" for display strings, static paths and empties', () => {
    expect(refKey('images/artists/a/1.jpg')).toBe('')
    expect(refKey('blob:http://localhost/abc')).toBe('')
    expect(refKey({ url: 'https://example.com/a.jpg' })).toBe('')
    expect(refKey(null)).toBe('')
    expect(refKey(undefined)).toBe('')
    expect(refKey({})).toBe('')
  })
})

describe('refIdentity', () => {
  it('is key-first: a { key } ref, a { url } wrapper and a bare string share one identity', () => {
    const id = refIdentity({ key: 'user/u1/a.jpg' })
    expect(id).toBe('key:user/u1/a.jpg')
    expect(refIdentity('user/u1/a.jpg')).toBe(id)
    expect(refIdentity({ key: 'user/u1/a.jpg', addedAt: '2026-01-01T00:00:00Z' })).toBe(id)
  })

  it('is independent of the deploy base for static paths', () => {
    const a = refIdentity('images/artists/a/1.jpg')
    expect(refIdentity('/images/artists/a/1.jpg')).toBe(a)
    expect(refIdentity('/sable/images/artists/a/1.jpg')).toBe(a)
    expect(refIdentity({ url: '/sable/images/artists/a/1.jpg', addedAt: 'x' })).toBe(a)
  })

  it('keeps different photos distinct', () => {
    expect(refIdentity('images/artists/a/1.jpg')).not.toBe(refIdentity('images/artists/a/2.jpg'))
    expect(refIdentity({ key: 'user/u1/a.jpg' })).not.toBe(refIdentity({ key: 'user/u1/b.jpg' }))
  })

  it('identifies external and display urls by their full string', () => {
    expect(refIdentity('https://example.com/a.jpg')).toBe('url:https://example.com/a.jpg')
    expect(refIdentity({ url: 'blob:http://localhost/abc' })).toBe('url:blob:http://localhost/abc')
  })

  it('is null for anything that is not an image ref', () => {
    expect(refIdentity(null)).toBeNull()
    expect(refIdentity(undefined)).toBeNull()
    expect(refIdentity('')).toBeNull()
    expect(refIdentity({})).toBeNull()
  })
})
