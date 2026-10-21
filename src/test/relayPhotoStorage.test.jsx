import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCollectionStore } from '../sync/collectionStore'
import { createArtistsPolicy, META_KEY } from '../data/artistsPolicy'
import { backend } from '../backend'
import { createOwnerScope } from '../backend/ownerScope'
import { createLocalStore } from '../backend/local/localStore'
import { createLocalBlobs } from '../backend/local/localBlobs'
import { clearBlobUrls, keyForUrl, resolveBlobKey } from '../data/blobUrls'
import { stageImage, drainOutbox } from '../data/imageStaging'
import { conceptsCodec } from '../data/imageCodec'
import { getStagedBytes, putStagedBytes, markDeviceCopy, readOutbox, STAGED_IMAGES_DB } from '../data/stagedImageStore'

const PHOTO = 'data:image/png;base64,cGhvdG8='
const ROW = { id: 'c1', handle: 'c1', images: [], updatedAt: '2026-01-01T00:00:00.000Z' }
const original = { ...backend }
const stores = []
let owner

const deleteDb = (name) => new Promise((resolve) => {
  const request = indexedDB.deleteDatabase(name)
  request.onsuccess = request.onerror = request.onblocked = () => resolve()
})

async function legacy(images) {
  await new Promise((resolve, reject) => {
    const request = indexedDB.open('tattoo-images-v1', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('artist-images')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('artist-images', 'readwrite')
      tx.objectStore('artist-images').put(images, 'c1')
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
}

async function mount() {
  const { policy, codec } = createArtistsPolicy()
  const store = createCollectionStore({ key: META_KEY, defaultValue: [], policy, codec, initialUser: { id: owner } })
  stores.push(store)
  await store.start({ id: owner })
  return store
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb('tattoo-images-v1')
  await deleteDb(STAGED_IMAGES_DB)
  await deleteDb('tattoo-blobs-v1')
  owner = 'A'
  const ownerScope = createOwnerScope({ privateMode: true, getOwnerId: () => owner })
  Object.assign(backend, { kind: 'local', capabilities: { realAuth: true, offlineAuth: false }, ownerScope,
    store: createLocalStore({ ownerScope, allowLegacy: false }),
    blobs: createLocalBlobs({ ownerScope, allowLegacy: false }) })
  await backend.store.upsert('artistsMeta', [ROW])
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  stores.splice(0).forEach((store) => store.stop())
  vi.restoreAllMocks()
  Object.assign(backend, original)
  clearBlobUrls()
})

it('a later private concept flush retries its staged photo without an online event', async () => {
  await backend.store.upsert('concepts', [{ id: 'c1', imageUrl: '', variants: [] }])
  const store = createCollectionStore({ key: 'tattoo_concepts', defaultValue: [], codec: conceptsCodec,
    initialUser: { id: owner } })
  stores.push(store)
  await store.start({ id: owner })
  const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
  const { key } = await stageImage(PHOTO, { userId: owner, scope: 'concepts', id: 'c1' })
  store.set((rows) => rows.map((row) => ({ ...row, imageUrl: key })))
  await store.flush()
  expect(readOutbox().map((entry) => entry.key)).toContain(key)
  upload.mockRestore()
  store.set((rows) => rows.map((row) => ({ ...row, notes: 'Retry on edit' })))
  await store.flush()
  await vi.waitFor(() => expect(readOutbox()).toEqual([]))
  expect(await backend.blobs.getUrl(key)).toBe(PHOTO)
})

it('never reuploads mixed historical bytes or resurrects migrated entries from the retired cache', async () => {
  await legacy([PHOTO, { key: 'user/A/artists/c1/old.png' }])
  const upload = vi.spyOn(backend.blobs, 'upload')
  const open = vi.spyOn(indexedDB, 'open')
  const store = await mount()
  expect(store.getSnapshot()[0].images).toEqual([])
  expect(upload).not.toHaveBeenCalled()
  expect(open.mock.calls.map(([name]) => name)).not.toContain('tattoo-images-v1')
})

it('never seeds curated owner-email data into a real-auth local collection', () => {
  const { policy, codec } = createArtistsPolicy()
  const store = createCollectionStore({ key: META_KEY, defaultValue: [], policy, codec,
    initialUser: { id: owner, email: 'owner@example.com' } })
  stores.push(store)
  expect(store.getSnapshot()).toEqual([])
})

it('does not stage bytes or publish a reverse mapping after an owner change during FileReader', async () => {
  let reader
  vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function () { reader = this })
  const pending = stageImage(new Blob(['photo'], { type: 'image/png' }), { userId: owner, scope: 'artists', id: 'c1' })
  owner = 'B'; backend.ownerScope.invalidate()
  Object.defineProperty(reader, 'result', { value: PHOTO })
  reader.onload()
  expect(await pending).toMatchObject({ failed: true, key: null })
  expect(readOutbox()).toEqual([])
  expect(keyForUrl(PHOTO)).toBeNull()
})

it('does not resolve another owner staged bytes even if their device-copy index exists', async () => {
  const key = 'user/B/artists/c1/private.png'
  await putStagedBytes(key, PHOTO)
  markDeviceCopy(key)
  expect(await resolveBlobKey(key)).toBe('')
  expect(keyForUrl(PHOTO)).toBeNull()
})

it('never restores another owner cache refs as new uploads or reverse URL mappings', async () => {
  await legacy([PHOTO])
  owner = 'B'; backend.ownerScope.invalidate()
  await backend.store.upsert('artistsMeta', [ROW])
  const upload = vi.spyOn(backend.blobs, 'upload')
  const store = await mount()
  expect(store.getSnapshot()[0].images).toEqual([])
  expect(upload).not.toHaveBeenCalled()
  expect(keyForUrl(PHOTO)).toBeNull()
})

it('keeps a new failed-upload photo visible and retryable after completed migration and reload', async () => {
  localStorage.setItem('tattoo_img_migrated_v1', '1')
  const upload = vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
  const first = await mount()
  const { key } = await stageImage(PHOTO, { userId: owner, scope: 'artists', id: 'c1' })
  first.set((rows) => rows.map((row) => ({ ...row, images: [{ key }] })))
  await first.flush(); first.stop(); clearBlobUrls()
  const second = await mount()
  expect(second.getSnapshot()[0].images).toEqual([{ key }])
  expect(await resolveBlobKey(key)).toBe(PHOTO)
  expect(readOutbox().map((entry) => entry.key)).toContain(key)
  upload.mockRestore()
  await drainOutbox({ userId: owner })
  expect(await backend.blobs.getUrl(key)).toBe(PHOTO)
  expect(readOutbox()).toEqual([])
})

it('keeps a new photo added during canonical upsert instead of overwriting its staged bytes', async () => {
  const store = await mount()
  const first = await stageImage(PHOTO, { userId: owner, scope: 'artists', id: 'c1' })
  store.set((rows) => rows.map((row) => ({ ...row, images: [{ key: first.key }] })))
  const real = backend.store.upsert.bind(backend.store)
  let second
  vi.spyOn(backend.store, 'upsert').mockImplementationOnce(async (...args) => {
    second = await stageImage('data:image/png;base64,bmV3', { userId: owner, scope: 'artists', id: 'c1' })
    store.set((rows) => rows.map((row) => ({ ...row, images: [...row.images, { key: second.key }] })))
    return real(...args)
  })
  await store.flush(); await store.flush()
  expect((await backend.store.list('artistsMeta'))[0].images).toEqual([{ key: first.key }, { key: second.key }])
  expect(await getStagedBytes(second.key)).toBe('data:image/png;base64,bmV3')
})

it('fences cache writes and completion when the owner changes during a pending pull', async () => {
  const list = backend.store.list.bind(backend.store)
  vi.spyOn(backend.store, 'list').mockImplementation(async (...args) => {
    const rows = await list(...args)
    owner = 'B'; backend.ownerScope.invalidate()
    return rows
  })
  await mount()
  expect(localStorage.getItem(META_KEY)).not.toContain('"c1"')
  expect(localStorage.getItem('tattoo_remote_B_artistsMeta')).toBeNull()
})

it('keeps failed upload bytes recoverable without any legacy classification or completion write', async () => {
  vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
  const { key } = await stageImage(PHOTO, { userId: owner, scope: 'artists', id: 'c1' })
  expect(key).toMatch(/^user\/A\/artists\/c1\//)
  expect(await getStagedBytes(key)).toBe(PHOTO)
  expect(readOutbox().map((entry) => entry.key)).toContain(key)
  expect(localStorage.getItem('tattoo_img_migrated_v1')).toBeNull()
})

it('retains ambiguous historical bytes without displaying or reuploading them after a new photo is saved', async () => {
  await legacy([PHOTO])
  localStorage.setItem('tattoo_img_migrated_v1', '1')
  const store = await mount()
  const photo = await stageImage('data:image/png;base64,bmV3', { userId: owner, scope: 'artists', id: 'c1' })
  store.set((rows) => rows.map((row) => ({ ...row, images: [{ key: photo.key }] })))
  await store.flush()
  expect(store.getSnapshot()[0].images).toEqual([{ key: photo.key }])
  expect(keyForUrl(PHOTO)).toBeNull()
})
