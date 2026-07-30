import { describe, expect, it } from 'vitest'
import { resolveAssetPath } from '../data/assetPath'

// Image paths are persisted and synced (canonicalizeImages stores static paths
// verbatim), so the deploy base must never be frozen into a record — a move
// from /sable/ to a root domain would strand every stored path. Data stays
// base-relative; the base is applied here, at display time.
describe('resolveAssetPath', () => {
  it('prefixes the base onto a base-relative path', () => {
    expect(resolveAssetPath('images/artists/zoia.ink/1.jpg', '/sable/'))
      .toBe('/sable/images/artists/zoia.ink/1.jpg')
    expect(resolveAssetPath('images/artists/zoia.ink/1.jpg', '/'))
      .toBe('/images/artists/zoia.ink/1.jpg')
  })

  // The shape DEFAULT_ARTISTS shipped for years.
  it('rebases a legacy root-absolute path', () => {
    expect(resolveAssetPath('/images/artists/zoia.ink/1.jpg', '/sable/'))
      .toBe('/sable/images/artists/zoia.ink/1.jpg')
    expect(resolveAssetPath('/images/artists/zoia.ink/1.jpg', '/'))
      .toBe('/images/artists/zoia.ink/1.jpg')
  })

  // demoSeed baked ${BASE_URL} into localStorage on the live Pages demo, so
  // returning visitors hold these. Re-prefixing would give /sable/sable/…
  it('leaves an already-based path alone', () => {
    expect(resolveAssetPath('/sable/images/demo/mora.blackfern/1.svg', '/sable/'))
      .toBe('/sable/images/demo/mora.blackfern/1.svg')
  })

  it('passes through anything carrying a protocol', () => {
    for (const url of [
      'https://example.com/a.jpg',
      'http://example.com/a.jpg',
      'blob:http://localhost/abc-123',
      'data:image/png;base64,iVBORw0KGgo=',
    ]) {
      expect(resolveAssetPath(url, '/sable/')).toBe(url)
    }
  })

  it('returns empty string for missing or non-string input', () => {
    expect(resolveAssetPath('', '/sable/')).toBe('')
    expect(resolveAssetPath(null, '/sable/')).toBe('')
    expect(resolveAssetPath(undefined, '/sable/')).toBe('')
    expect(resolveAssetPath({ key: 'k1' }, '/sable/')).toBe('')
  })

  it('is idempotent — resolving twice changes nothing', () => {
    for (const base of ['/', '/sable/']) {
      for (const input of ['images/a.jpg', '/images/a.jpg', 'blob:xyz']) {
        const once = resolveAssetPath(input, base)
        expect(resolveAssetPath(once, base)).toBe(once)
      }
    }
  })
})
