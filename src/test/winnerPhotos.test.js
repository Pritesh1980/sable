import { describe, it, expect, beforeEach } from 'vitest'
import {
  MAX_PHOTOS_PER_WINNER,
  clearWinnerPhotos,
  deletePhoto,
  loadPhotos,
  photoIdsFor,
  putPhoto,
  withPhotoId,
  withoutPhotoId,
} from '../data/winnerPhotos'

// Photos of winning tattoos are the bulkiest thing this app stores and the one
// thing a re-import can't bring back. They must not live in localStorage: a
// handful of phone screenshots would blow the ~5MB origin quota and take the
// whole gallery's offline cache down with them. So the winner record keeps only
// an id and the bytes live in IndexedDB, the same split the style index uses.

beforeEach(async () => {
  await clearWinnerPhotos()
})

describe('the winner record only ever holds ids', () => {
  it('adds a photo id to a winner', () => {
    const entry = withPhotoId({ category: 'Best Realism', handle: 'alex_artlex' }, 'p1')
    expect(entry.photoIds).toEqual(['p1'])
  })

  it('keeps several photos — a post has the tattoo and the trophy shot', () => {
    let entry = withPhotoId({ handle: 'a' }, 'p1')
    entry = withPhotoId(entry, 'p2')
    expect(entry.photoIds).toEqual(['p1', 'p2'])
  })

  it('does not add the same id twice', () => {
    let entry = withPhotoId({ handle: 'a' }, 'p1')
    entry = withPhotoId(entry, 'p1')
    expect(entry.photoIds).toEqual(['p1'])
  })

  it('caps how many photos one winner can hold', () => {
    let entry = { handle: 'a' }
    for (let i = 0; i < MAX_PHOTOS_PER_WINNER + 3; i += 1) entry = withPhotoId(entry, `p${i}`)
    expect(entry.photoIds).toHaveLength(MAX_PHOTOS_PER_WINNER)
  })

  it('removes an id again', () => {
    const entry = withoutPhotoId({ photoIds: ['p1', 'p2'] }, 'p1')
    expect(entry.photoIds).toEqual(['p2'])
  })

  it('never puts image bytes on the record', () => {
    const entry = withPhotoId({ handle: 'a' }, 'p1')
    expect(JSON.stringify(entry)).not.toContain('data:')
    expect(JSON.stringify(entry).length).toBeLessThan(120)
  })
})

describe('the bytes live in IndexedDB', () => {
  it('round-trips a photo', async () => {
    await putPhoto('p1', 'data:image/jpeg;base64,AAA')
    const found = await loadPhotos(['p1'])
    expect(found.get('p1')).toBe('data:image/jpeg;base64,AAA')
  })

  it('loads several at once', async () => {
    await putPhoto('p1', 'data:a')
    await putPhoto('p2', 'data:b')
    const found = await loadPhotos(['p1', 'p2'])
    expect([...found.keys()].sort()).toEqual(['p1', 'p2'])
  })

  it('is quiet about ids that are not there', async () => {
    const found = await loadPhotos(['nope'])
    expect(found.size).toBe(0)
  })

  it('deletes one', async () => {
    await putPhoto('p1', 'data:a')
    await deletePhoto('p1')
    expect((await loadPhotos(['p1'])).size).toBe(0)
  })

  it('survives being asked for nothing', async () => {
    expect((await loadPhotos([])).size).toBe(0)
  })
})

describe('photoIdsFor', () => {
  it('collects every id across a board so one load covers the card', () => {
    const ids = photoIdsFor([
      { photoIds: ['p1', 'p2'] },
      { photoIds: ['p3'] },
      { handle: 'no-photos' },
    ])
    expect(ids).toEqual(['p1', 'p2', 'p3'])
  })

  it('does not repeat an id shared by two rows', () => {
    expect(photoIdsFor([{ photoIds: ['p1'] }, { photoIds: ['p1'] }])).toEqual(['p1'])
  })
})
