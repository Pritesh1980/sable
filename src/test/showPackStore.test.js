import { describe, it, expect } from 'vitest'
import { createShowPackStore, currentPackOwner } from '../data/showPackStore'
import { createOwnerScope } from '../backend/ownerScope'

// #209: the pack store is device-local and keyed by owner. A pack prepared by
// one account must be invisible to the next one on this phone, even before
// the sign-out purge has run.

let n = 0
const freshStore = () => createShowPackStore({ dbName: `show-packs-store-test-${n++}` })
const bytes = (s) => new TextEncoder().encode(s).buffer

const pack = (ownerId, editionKey = 'uk-tattoo-fest@2027') => ({
  ownerId, editionKey, state: 'done', photos: [{ id: 'path:/images/a.webp', ref: 'images/a.webp', external: false }],
  artists: [], ideas: [], selection: { artistIds: [], ideaIds: [] },
})
const photo = (ownerId, id = 'path:/images/a.webp') => ({ ownerId, id, type: 'image/webp', size: 3, sha256: 'x', bytes: bytes('abc') })

describe('show pack store', () => {
  it('stores and lists one owner’s packs and photos', async () => {
    const store = freshStore()
    await store.putPack(pack('A'))
    await store.putPack(pack('A', 'tattoo-freeze@2027'))
    await store.putPhoto(photo('A'))

    expect((await store.listPacks('A')).map((p) => p.editionKey).sort()).toEqual(['tattoo-freeze@2027', 'uk-tattoo-fest@2027'])
    expect((await store.getPack('A', 'uk-tattoo-fest@2027')).state).toBe('done')
    const stored = await store.getPhoto('A', 'path:/images/a.webp')
    expect(new TextDecoder().decode(stored.bytes)).toBe('abc')
    expect(await store.listPhotoIds('A')).toEqual(['path:/images/a.webp'])
  })

  it('shows the next account none of the previous account’s packs or photos', async () => {
    const store = freshStore()
    await store.putPack(pack('A'))
    await store.putPhoto(photo('A'))

    expect(await store.listPacks('B')).toEqual([])
    expect(await store.getPack('B', 'uk-tattoo-fest@2027')).toBeNull()
    expect(await store.getPhoto('B', 'path:/images/a.webp')).toBeNull()
    expect(await store.listPhotoIds('B')).toEqual([])
    // An owner id that merely starts with another's is a different owner.
    expect(await store.listPacks('A2')).toEqual([])
  })

  it('deletes only within the given owner', async () => {
    const store = freshStore()
    await store.putPack(pack('A'))
    await store.putPack(pack('B'))
    await store.putPhoto(photo('A'))
    await store.putPhoto(photo('B'))

    await store.deletePack('B', 'uk-tattoo-fest@2027')
    await store.deletePhotos('B', ['path:/images/a.webp'])

    expect(await store.getPack('A', 'uk-tattoo-fest@2027')).not.toBeNull()
    expect(await store.getPhoto('A', 'path:/images/a.webp')).not.toBeNull()
    expect(await store.listPacks('B')).toEqual([])
  })

  it('refuses a record with no owner', async () => {
    const store = freshStore()
    await expect(store.putPack({ ...pack('A'), ownerId: '' })).rejects.toThrow()
    await expect(store.putPhoto({ ...photo('A'), ownerId: undefined })).rejects.toThrow()
  })
})

describe('currentPackOwner', () => {
  // The same owner scope the private backend uses (src/backend/index.js).
  function privateBackend() {
    let identity = null
    const ownerScope = createOwnerScope({ privateMode: true, getOwnerId: () => identity })
    return { ownerScope, setIdentity(id) { identity = id; ownerScope.invalidate() } }
  }

  it('names the signed-in owner, and notices when it changes', () => {
    const backend = privateBackend()
    backend.setIdentity('A')
    const owner = currentPackOwner(backend)
    expect(owner.ownerId).toBe('A')
    expect(() => owner.assertCurrent()).not.toThrow()
    backend.setIdentity('B')
    expect(() => owner.assertCurrent()).toThrow()
  })

  it('is null when nobody is signed in to a private build', () => {
    expect(currentPackOwner(privateBackend())).toBeNull()
  })
})
