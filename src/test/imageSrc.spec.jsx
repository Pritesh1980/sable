// Review-fix coverage: object-shaped image refs ({ url, addedAt }) must render
// as usable <img src> strings everywhere, not "[object Object]".
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { imageSrc, buildWallItems, stampAddedAt } from '../data/wall'
import ArtistImage from '../components/ArtistImage'

describe('imageSrc', () => {
  it('passes plain string refs through', () => {
    expect(imageSrc('/images/artists/zoia.ink/1.jpg')).toBe('/images/artists/zoia.ink/1.jpg')
  })

  it('unwraps { url, addedAt } refs to the url', () => {
    expect(imageSrc({ url: 'blob:abc', addedAt: '2026-07-01T00:00:00.000Z' })).toBe('blob:abc')
  })

  it('returns empty string for missing/keyed-only refs', () => {
    expect(imageSrc(undefined)).toBe('')
    expect(imageSrc(null)).toBe('')
    expect(imageSrc({ key: 'k1' })).toBe('')
  })
})

describe('buildWallItems image normalisation', () => {
  it('always exposes item.image as a string src, with addedAt lifted alongside', () => {
    const now = new Date('2026-07-04T12:00:00.000Z')
    const artists = [{
      id: 'a1', name: 'A1', handle: 'a1', tags: [],
      images: ['/plain.jpg', stampAddedAt('/fresh.jpg', now)],
    }]
    const items = buildWallItems(artists, { now })
    expect(items.map((i) => i.image)).toEqual(['/plain.jpg', '/fresh.jpg'])
    expect(items[1].isRecent).toBe(true)
  })
})

describe('ArtistImage with object refs', () => {
  it('renders the unwrapped url, never "[object Object]"', () => {
    render(<ArtistImage src={{ url: '/x.jpg', addedAt: '2026-07-01T00:00:00.000Z' }} label="test" />)
    const img = screen.getByAltText('test')
    expect(img.getAttribute('src')).toBe('/x.jpg')
  })

  it('falls back to the monogram for an empty object ref', () => {
    render(<ArtistImage src={{ key: 'unresolved' }} label="zed" />)
    expect(screen.queryByAltText('zed')).toBeNull()
  })
})
