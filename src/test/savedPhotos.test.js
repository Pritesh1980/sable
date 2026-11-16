import { describe, it, expect, beforeEach } from 'vitest'
import { buildWallItems, photoParam, findPhotoIndex } from '../data/wall'
import { collectionFor } from '../backend/sync'
import { purgeLocalUserData } from '../backend/purge'
import { savedCodec } from '../data/imageCodec'
import { createBackup, parseBackup, replaceLibraryQuestion, restoreBackupImages } from '../data/export'
import { createPortableBackup } from '../data/portableBackup'

const NOW = new Date('2026-07-04T12:00:00.000Z')
const artists = [{ id: 'zoia.ink', name: 'Zoia', handle: 'zoia.ink', tags: ['fine-line'], images: [{ key: 'user/u1/artists/zoia/a.jpg' }] }]
const saved = [
  { id: 's-old', image: { key: 'user/u1/saved/s-old/a.jpg' }, addedAt: '2026-06-01T00:00:00.000Z' },
  { id: 's-new', image: { key: 'user/u1/saved/s-new/b.jpg' }, addedAt: '2026-07-03T00:00:00.000Z' },
]

describe('buildWallItems with saved photos', () => {
  it('puts saved photos first, newest first, then artist photos', () => {
    const items = buildWallItems(artists, { saved, now: NOW })
    expect(items.map((i) => i.savedId ?? i.artistId)).toEqual(['s-new', 's-old', 'zoia.ink'])
  })

  it('shapes a saved item as unattributed', () => {
    const [item] = buildWallItems(artists, { saved, now: NOW })
    expect(item).toMatchObject({
      artistId: null, savedId: 's-new', artistName: 'No artist yet', handle: undefined,
      styles: [], image: { key: 'user/u1/saved/s-new/b.jpg' }, addedAt: '2026-07-03T00:00:00.000Z', isRecent: true,
    })
    expect(buildWallItems([], { saved, now: NOW })[1].isRecent).toBe(false)
  })

  it('is unchanged without saved', () => {
    expect(buildWallItems(artists, { now: NOW })).toHaveLength(1)
  })
})

describe('saved photo deep links', () => {
  it('round-trips s:<id> and keeps artist links working', () => {
    const items = buildWallItems(artists, { saved, now: NOW })
    expect(photoParam(items[1])).toBe('s:s-old')
    expect(findPhotoIndex(items, 's:s-old')).toBe(1)
    expect(findPhotoIndex(items, 's:gone')).toBe(-1)
    expect(findPhotoIndex(items, photoParam(items[2]))).toBe(2)
  })
})

describe('saved sync + purge', () => {
  beforeEach(() => localStorage.clear())
  it('maps tattoo_saved to the saved collection', () => {
    expect(collectionFor('tattoo_saved')).toBe('saved')
  })
  it('purges tattoo_saved on sign-out', async () => {
    localStorage.setItem('tattoo_saved', JSON.stringify(saved))
    await purgeLocalUserData()
    expect(localStorage.getItem('tattoo_saved')).toBeNull()
  })
})

describe('savedCodec', () => {
  it('persists canonical { key } refs', () => {
    const out = savedCodec.toCanonical([{ id: 'a', image: { key: 'user/u1/saved/a/x.jpg', addedAt: 'z' }, addedAt: 'z' }])
    expect(out[0].image).toEqual({ key: 'user/u1/saved/a/x.jpg', addedAt: 'z' })
  })
  it('drops inline data from the persisted form', () => {
    expect(savedCodec.toCanonical([{ id: 'a', image: 'data:image/png;base64,AAAA', addedAt: 'z' }])).toEqual([])
  })
  it('toDisplay returns the stored form', async () => {
    expect(await savedCodec.toDisplay(saved)).toEqual(saved)
  })
})

describe('saved in backups', () => {
  it('round-trips through createBackup / parseBackup', () => {
    const backup = createBackup({ saved: [{ ...saved[0], editGen: 'g' }] }, 'x')
    expect(backup.data.saved).toEqual([saved[0]])
    expect(parseBackup(JSON.parse(JSON.stringify(backup))).saved).toEqual([saved[0]])
  })
  it('imports an older backup without saved as []', () => {
    expect(parseBackup({ version: 2, data: { artists: [] } }).saved).toEqual([])
  })
  it('rejects a non-array saved', () => {
    expect(() => parseBackup({ data: { saved: 3 } })).toThrow(/saved/)
  })
  it('restores embedded data urls signed out unchanged', async () => {
    const data = parseBackup({ data: { saved: [{ id: 'a', image: { url: 'data:image/png;base64,AAAA' }, addedAt: 'z' }] } })
    expect((await restoreBackupImages(data, {})).data.saved).toEqual(data.saved)
  })
  it('names saved photos in the replace question', () => {
    const q = replaceLibraryQuestion({ saved }, { saved: [] }, undefined)
    expect(q).toMatch(/2 saved photos/)
  })
  it('portable export keeps saved records, embedding their image', async () => {
    const dataUrl = 'data:image/png;base64,AAAA'
    const backup = await createPortableBackup(
      { saved: [{ id: 's', image: { key: 'user/u1/saved/s/x.jpg' }, addedAt: 'z' }] },
      { ownerId: 'u1', blobs: { getUrl: async () => dataUrl } },
    )
    expect(backup.data.saved).toEqual([{ id: 's', image: { url: dataUrl }, addedAt: 'z' }])
  })
})
