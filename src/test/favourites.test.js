import { describe, it, expect } from 'vitest'
import { isFavourite, toggleFavourite, favouriteIdentities, favouriteRef } from '../data/favourites'
import { favouritesCodec } from '../data/imageCodec'
import { buildWallItems } from '../data/wall'
import { refIdentity } from '../data/imageRef'
import { collectionFor } from '../backend/sync'
import { purgeLocalUserData } from '../backend/purge'
import { createBackup, parseBackup, restoreBackupImages } from '../data/export'

const NOW = '2026-07-04T12:00:00.000Z'
const IMG = { key: 'user/u1/artists/zoia/a.jpg', addedAt: 'x' }

describe('favouriteRef', () => {
  it('keeps keys and static paths, drops inline and local data', () => {
    expect(favouriteRef(IMG)).toEqual({ key: 'user/u1/artists/zoia/a.jpg' })
    expect(favouriteRef('user/u1/a.jpg')).toEqual({ key: 'user/u1/a.jpg' })
    expect(favouriteRef('images/artists/a.jpg')).toBe('images/artists/a.jpg')
    expect(favouriteRef({ url: 'images/artists/a.jpg', addedAt: 'x' })).toBe('images/artists/a.jpg')
    expect(favouriteRef('data:image/png;base64,AAA')).toBeNull()
    expect(favouriteRef('blob:http://x/1')).toBeNull()
    expect(favouriteRef(undefined)).toBeNull()
  })
})

describe('toggleFavourite / isFavourite', () => {
  it('adds a record with a random id, canonical image and addedAt', () => {
    const next = toggleFavourite([], IMG, NOW)
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ image: { key: IMG.key }, addedAt: NOW })
    expect(next[0].id).toBeTruthy()
    expect(next[0].id).not.toMatch(/^key:/)
    expect(isFavourite(next, IMG)).toBe(true)
    expect(isFavourite(next, 'user/u1/artists/zoia/a.jpg')).toBe(true)
    expect(isFavourite(next, { key: 'user/u1/other.jpg' })).toBe(false)
  })
  it('removes on a second toggle, whatever shape the image has', () => {
    const on = toggleFavourite([], IMG, NOW)
    expect(toggleFavourite(on, { key: IMG.key }, NOW)).toEqual([])
  })
  it('matches static paths', () => {
    const on = toggleFavourite([], 'images/artists/a.jpg', NOW)
    expect(isFavourite(on, { url: 'images/artists/a.jpg' })).toBe(true)
  })
  it('leaves the list alone for an image that is not stored yet', () => {
    const list = []
    expect(toggleFavourite(list, 'data:image/png;base64,AAA', NOW)).toBe(list)
  })
  it('favouriteIdentities is a Set of runtime identities', () => {
    const s = favouriteIdentities(toggleFavourite([], IMG, NOW))
    expect(s.has(refIdentity(IMG))).toBe(true)
  })
})

describe('a favourite survives giving a saved photo an artist', () => {
  it('matches the photo before and after, as the image ref is unchanged', () => {
    const saved = [{ id: 's1', image: { key: 'user/u1/saved/s1/a.jpg' }, addedAt: NOW }]
    const favs = toggleFavourite([], buildWallItems([], { saved })[0].image, NOW)
    const given = [{ id: 'z', handle: 'z', name: 'Z', tags: [], images: [{ key: 'user/u1/saved/s1/a.jpg', addedAt: NOW }] }]
    expect(isFavourite(favs, buildWallItems(given)[0].image)).toBe(true)
  })
})

describe('favourites plumbing', () => {
  it('syncs and purges', () => {
    expect(collectionFor('tattoo_favourites')).toBe('favourites')
    localStorage.setItem('tattoo_favourites', '[{"id":"1"}]')
    return purgeLocalUserData().then(() => expect(localStorage.getItem('tattoo_favourites')).toBeNull())
  })
  it('codec canonicalises display shapes and keeps unstaged rows', () => {
    const out = favouritesCodec.toCanonical([
      { id: 'a', image: { url: 'images/a.jpg', addedAt: 'x' }, addedAt: NOW },
      { id: 'b', image: 'data:image/png;base64,AAA', addedAt: NOW },
    ])
    expect(out[0].image).toBe('images/a.jpg')
    expect(out[1].image).toBe('data:image/png;base64,AAA')
  })
  it('round-trips through a backup; older backups import as []', () => {
    const fav = [{ id: 'f', image: { key: 'user/u1/a.jpg' }, addedAt: NOW, editGen: 'g' }]
    expect(createBackup({ favourites: fav }, 'x').data.favourites).toEqual([{ id: 'f', image: { key: 'user/u1/a.jpg' }, addedAt: NOW }])
    expect(parseBackup({ version: 1, data: { artists: [] } }).favourites).toEqual([])
    expect(parseBackup(createBackup({ favourites: fav }, 'x')).favourites).toHaveLength(1)
  })
  it('restores a data-url favourite into a stored ref', async () => {
    const { data } = await restoreBackupImages({ artists: [], ideas: [], concepts: [], saved: [], favourites: [{ id: 'f', image: { url: 'images/a.jpg' }, addedAt: NOW }] }, { userId: 'u1' })
    expect(data.favourites).toHaveLength(1)
  })
})

describe('favourites in a portable backup', () => {
  it('embeds the image like a saved photo', async () => {
    const { createPortableBackup } = await import('../data/portableBackup')
    const dataUrl = 'data:image/png;base64,AAAA'
    const backup = await createPortableBackup(
      { favourites: [{ id: 'f', image: { key: 'user/u1/saved/s/x.jpg' }, addedAt: 'z' }] },
      { ownerId: 'u1', blobs: { getUrl: async () => dataUrl } },
    )
    expect(backup.data.favourites).toEqual([{ id: 'f', image: { url: dataUrl }, addedAt: 'z' }])
  })
})
