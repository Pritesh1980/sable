import { describe, it, expect } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_ARTWORK, demoArtworkFor, demoResponsiveProps } from '../data/demoArtwork'

describe('demo artwork manifest', () => {
  it('resolves stored strings and objects at either deployment base', () => {
    const src = 'images/demo/mora.blackfern/fern-v4.webp'
    for (const value of [src, `/${src}`, `/sable/${src}`, { url: src }]) {
      expect(demoArtworkFor(value)?.title).toBe('Botanical fern')
      expect(demoResponsiveProps(value, '/sable/').srcSet).toBe(`/sable/images/demo/mora.blackfern/fern-v4-thumb.webp 384w, /sable/${src} 1024w`)
    }
  })

  it('does not claim external, uploaded, malformed or legacy images', () => {
    for (const value of [undefined, null, {}, { key: 'blob' }, 42, '', 'blob:abc', 'data:image/png;base64,abc', '//example.com/images/demo/mora.blackfern/fern-v4.webp', 'https://example.com/images/demo/mora.blackfern/fern-v4.webp', 'images/demo/mora.blackfern/1.svg']) {
      expect(demoArtworkFor(value)).toBeNull()
      expect(demoResponsiveProps(value)).toEqual({})
    }
  })

  it('ships every full image and thumbnail as WebP within its byte budget', () => {
    expect(DEMO_ARTWORK).toHaveLength(18)
    expect(new Set(DEMO_ARTWORK.map((piece) => piece.src)).size).toBe(18)
    for (const piece of DEMO_ARTWORK) {
      for (const [path, budget] of [[piece.src, 350], [piece.thumbnail, 80]]) {
        const file = join(process.cwd(), 'public', path)
        expect(statSync(file).size).toBeLessThanOrEqual(budget * 1024)
        const bytes = readFileSync(file)
        expect(bytes.subarray(0, 4).toString()).toBe('RIFF')
        expect(bytes.subarray(8, 12).toString()).toBe('WEBP')
      }
    }
  })
})
