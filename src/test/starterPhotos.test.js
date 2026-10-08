import { describe, it, expect, vi } from 'vitest'

vi.mock('../data/artists', async (importOriginal) => ({
  ...(await importOriginal()),
  DEFAULT_ARTISTS: [
    { id: 'd1', handle: 'd1', name: '', tags: [], rank: 1, images: ['images/artists/d1/1.jpg', 'images/artists/d1/2.jpg'] },
  ],
}))

const { applyDefaults, dedupeRefs, withStarterPhotos } = await import('../data/artistsPolicy')

describe('starter photos in stored rows (#116)', () => {
  it('appends the starter photos after the artist’s own', () => {
    const [row] = applyDefaults([{ id: 'd1', handle: 'd1', rank: 1, images: [{ key: 'user/u1/own.jpg' }] }])
    expect(row.images).toEqual([{ key: 'user/u1/own.jpg' }, 'images/artists/d1/1.jpg', 'images/artists/d1/2.jpg'])
  })

  it('does not duplicate a starter that is already there under another spelling', () => {
    const [row] = applyDefaults([{ id: 'd1', handle: 'd1', rank: 1, images: ['/images/artists/d1/1.jpg'] }])
    expect(row.images).toEqual(['/images/artists/d1/1.jpg', 'images/artists/d1/2.jpg'])
  })

  it('never re-adds a starter the artist removed (tombstone)', () => {
    const [row] = applyDefaults([{
      id: 'd1', handle: 'd1', rank: 1, images: ['images/artists/d1/2.jpg'],
      removedImages: [{ ref: 'images/artists/d1/1.jpg', removedAt: '2026-01-01T00:00:00Z' }],
    }])
    expect(row.images).toEqual(['images/artists/d1/2.jpg'])
  })

  it('returns the same array when every starter is already present (no churn)', () => {
    const images = ['images/artists/d1/1.jpg', 'images/artists/d1/2.jpg']
    expect(withStarterPhotos(images, images, [])).toBe(images)
  })

  it('leaves an artist with no default untouched', () => {
    const row = { id: 'other', handle: 'o', rank: 2, images: ['x.jpg'] }
    expect(applyDefaults([row]).find((a) => a.id === 'other')).toBe(row)
  })

  it('dedupeRefs keeps the first of two spellings of one photo', () => {
    expect(dedupeRefs([{ key: 'user/u1/a.jpg' }, 'images/b.jpg', { key: 'user/u1/a.jpg', addedAt: 'x' }, '/images/b.jpg']))
      .toEqual([{ key: 'user/u1/a.jpg' }, 'images/b.jpg'])
  })
})
