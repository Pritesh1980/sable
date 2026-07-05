import { describe, it, expect } from 'vitest'
import { buildWallItems, isRecent, stampAddedAt } from '../data/wall'

const NOW = new Date('2026-07-04T12:00:00.000Z')

describe('isRecent', () => {
  it('is true when addedAt is within 14 days of now', () => {
    const addedAt = new Date('2026-07-01T12:00:00.000Z').toISOString()
    expect(isRecent(addedAt, NOW)).toBe(true)
  })

  it('is false when addedAt is older than 14 days', () => {
    const addedAt = new Date('2026-06-01T12:00:00.000Z').toISOString()
    expect(isRecent(addedAt, NOW)).toBe(false)
  })

  it('is false when addedAt is exactly on the 14-day boundary edge (older side)', () => {
    const fifteenDaysAgo = new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString()
    expect(isRecent(fifteenDaysAgo, NOW)).toBe(false)
  })

  it('is true at exactly 14 days ago', () => {
    const fourteenDaysAgo = new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    expect(isRecent(fourteenDaysAgo, NOW)).toBe(true)
  })

  it('is false when addedAt is missing (migration rule)', () => {
    expect(isRecent(undefined, NOW)).toBe(false)
  })

  it('is false when addedAt is null', () => {
    expect(isRecent(null, NOW)).toBe(false)
  })
})

describe('stampAddedAt', () => {
  it('sets addedAt as an ISO string on a string image URL', () => {
    const stamped = stampAddedAt('/images/artists/foo/1.jpg', NOW)
    expect(stamped.addedAt).toBe(NOW.toISOString())
    expect(stamped.url).toBe('/images/artists/foo/1.jpg')
  })

  it('sets addedAt on an object image ref, preserving other fields', () => {
    const stamped = stampAddedAt({ key: 'user/1/artists/foo/abc.jpg' }, NOW)
    expect(stamped.addedAt).toBe(NOW.toISOString())
    expect(stamped.key).toBe('user/1/artists/foo/abc.jpg')
  })

  it('round-trips through JSON cleanly', () => {
    const stamped = stampAddedAt({ key: 'abc' }, NOW)
    const roundTripped = JSON.parse(JSON.stringify(stamped))
    expect(roundTripped).toEqual(stamped)
  })
})

describe('buildWallItems', () => {
  const artists = [
    {
      id: 'zoia.ink',
      handle: 'zoia.ink',
      name: '',
      tags: ['dark-illustrative', 'surrealism'],
      images: ['/images/artists/zoia.ink/1.jpg', { key: 'user/1/artists/zoia.ink/2.jpg' }],
    },
    {
      id: 'carlosvalera',
      handle: 'carl245tattoo',
      name: 'Carlos Valera',
      tags: ['realism'],
      studio: 'no-regrets-london',
      images: [{ key: 'blob-key', addedAt: NOW.toISOString() }],
    },
    {
      id: 'noimages',
      handle: 'noimages',
      name: '',
      tags: [],
      images: [],
    },
  ]

  it('produces one flat entry per artist image, preserving artist then image order', () => {
    const items = buildWallItems(artists, { now: NOW })
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.artistId)).toEqual(['zoia.ink', 'zoia.ink', 'carlosvalera'])
    expect(items.map((i) => i.imageIndex)).toEqual([0, 1, 0])
  })

  it('is stable — same input produces the same output', () => {
    const first = buildWallItems(artists, { now: NOW })
    const second = buildWallItems(artists, { now: NOW })
    expect(second).toEqual(first)
  })

  it('carries artistName, handle and styles through from the artist record', () => {
    const items = buildWallItems(artists, { now: NOW })
    const carlos = items.find((i) => i.artistId === 'carlosvalera')
    expect(carlos.artistName).toBe('Carlos Valera')
    expect(carlos.handle).toBe('carl245tattoo')
    expect(carlos.styles).toEqual(['realism'])
  })

  it('falls back to handle for artistName when name is blank', () => {
    const items = buildWallItems(artists, { now: NOW })
    const zoia = items.find((i) => i.artistId === 'zoia.ink' && i.imageIndex === 0)
    expect(zoia.artistName).toBe('zoia.ink')
  })

  it('preserves string image URLs untouched', () => {
    const items = buildWallItems(artists, { now: NOW })
    const item = items.find((i) => i.artistId === 'zoia.ink' && i.imageIndex === 0)
    expect(item.image).toBe('/images/artists/zoia.ink/1.jpg')
    expect(item.addedAt).toBeUndefined()
    expect(item.isRecent).toBe(false)
  })

  it('normalises unresolved blob-key refs to an empty string src', () => {
    // item.image is always a displayable string (see imageSrc); keyed refs
    // that haven't been resolved to a URL yet come back as '' so consumers
    // fall back to the monogram instead of rendering "[object Object]".
    const items = buildWallItems(artists, { now: NOW })
    const item = items.find((i) => i.artistId === 'zoia.ink' && i.imageIndex === 1)
    expect(item.image).toBe('')
    expect(item.addedAt).toBeUndefined()
    expect(item.isRecent).toBe(false)
  })

  it('marks images with a recent addedAt as isRecent', () => {
    const items = buildWallItems(artists, { now: NOW })
    const item = items.find((i) => i.artistId === 'carlosvalera')
    expect(item.addedAt).toBe(NOW.toISOString())
    expect(item.isRecent).toBe(true)
  })

  it('resolves the artist studio id to a display name', () => {
    const items = buildWallItems(artists, { now: NOW })
    const carlos = items.find((i) => i.artistId === 'carlosvalera')
    expect(carlos.studioName).toBe('No Regrets London')
  })

  it('leaves studioName undefined when the artist has no (or an unknown) studio', () => {
    const items = buildWallItems(artists, { now: NOW })
    const zoia = items.find((i) => i.artistId === 'zoia.ink' && i.imageIndex === 0)
    expect(zoia.studioName).toBeUndefined()
  })

  it('handles an artist with no images (contributes zero entries)', () => {
    const items = buildWallItems(artists, { now: NOW })
    expect(items.some((i) => i.artistId === 'noimages')).toBe(false)
  })

  it('handles an empty artist list', () => {
    expect(buildWallItems([], { now: NOW })).toEqual([])
  })

  it('defaults now to the current time when not provided', () => {
    const items = buildWallItems(
      [{ id: 'a', handle: 'a', name: '', tags: [], images: [{ key: 'k', addedAt: new Date().toISOString() }] }],
      {}
    )
    expect(items[0].isRecent).toBe(true)
  })
})
