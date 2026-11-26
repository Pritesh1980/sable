import { describe, it, expect, vi, afterEach } from 'vitest'
import { planShowPack, packStatus } from '../data/showPack'
import { createShowPackStore } from '../data/showPackStore'
import { isQuotaError, preparePack, readPhotoBytes, removePack, verifyPack } from '../data/showPackPrepare'
import { getStagedBytes, markDeviceCopy, putStagedBytes } from '../data/stagedImageStore'
import { backend } from '../backend'

// #209: preparing a pack reads each photo's bytes, stores them on this
// device, reads them back, and only then calls the pack ready. Every way a
// run can fall short (offline, a partial download, a full disk, a stop or a
// reload, bytes that vanish later) must leave it visibly not ready.

let n = 0
const freshStore = () => createShowPackStore({ dbName: `show-packs-prepare-test-${n++}` })
const OWNER = 'user-a'
const edition = { editionKey: 'uk-tattoo-fest@2027', label: 'UK Tattoo Fest 2027' }
const KEY = `user/${OWNER}/artists/mora/a.jpg`

const artists = [
  { id: 'mora', handle: 'mora.blackfern', name: 'Mora Vane', images: [{ key: KEY }, 'images/demo/mora/1.webp', 'https://cdn.example.com/x.jpg'] },
  { id: 'vesper', handle: 'vesper_noctis', name: 'Vesper Ash', images: ['images/demo/vesper/1.webp'] },
]
const ideas = [{ id: 'fern', title: 'Fern', status: 'idea', linkedArtists: ['mora'], images: [{ url: 'images/demo/mora/1.webp', note: 'shading' }] }]
const plan = (selection = { artistIds: ['mora', 'vesper'], ideaIds: ['fern'] }, lib = { artists, ideas }) =>
  planShowPack({ edition, ...lib, selection })

const ID = {
  key: `key:${KEY}`,
  mora: 'path:/images/demo/mora/1.webp',
  vesper: 'path:/images/demo/vesper/1.webp',
  external: 'url:https://cdn.example.com/x.jpg',
}

const image = (s, type = 'image/jpeg') => new Blob([s], { type })
const idOf = (ref) => (typeof ref === 'string' ? (ref.startsWith('http') ? `url:${ref}` : `path:/${ref}`) : `key:${ref.key}`)
function reader(table = {}) {
  const defaults = { [ID.key]: image('key-bytes'), [ID.mora]: image('mora-bytes', 'image/webp'), [ID.vesper]: image('vesper-bytes', 'image/webp') }
  const all = { ...defaults, ...table }
  return vi.fn(async (ref) => {
    const hit = all[idOf(ref)]
    if (!hit) return { error: 'unavailable' }
    return hit instanceof Blob ? { blob: hit } : hit
  })
}
const clock = (iso = '2026-11-26T14:02:00.000Z') => () => iso
const readIds = (read) => read.mock.calls.map(([ref]) => idOf(ref))

afterEach(() => vi.restoreAllMocks())

describe('preparePack', () => {
  it('stores every photo, reads each back, and only then reports ready', async () => {
    const store = freshStore()
    const read = reader()
    const progress = []
    const pack = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: read, now: clock(), onProgress: (done, total) => progress.push([done, total]) })

    expect(pack.state).toBe('done')
    expect(pack.ownerId).toBe(OWNER)
    expect(pack.preparedAt).toBe('2026-11-26T14:02:00.000Z')
    expect(packStatus(pack)).toMatchObject({ state: 'ready', saved: 3, savable: 3, external: 1, checkedAt: '2026-11-26T14:02:00.000Z' })
    expect(pack.verification.bytes).toBe('key-bytes'.length + 'mora-bytes'.length + 'vesper-bytes'.length)
    expect(progress.at(-1)).toEqual([4, 4])
    expect(await store.getPack(OWNER, 'uk-tattoo-fest@2027')).toEqual(pack)
    const stored = await store.getPhoto(OWNER, ID.vesper)
    expect(new TextDecoder().decode(stored.bytes)).toBe('vesper-bytes')
    expect(stored.type).toBe('image/webp')
  })

  it('never fetches a photo that lives on another site, and says so', async () => {
    const store = freshStore()
    const read = reader()
    const pack = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: read, now: clock() })
    expect(readIds(read)).not.toContain(ID.external)
    expect(pack.results[ID.external]).toBe('external')
  })

  it('reads a photo shared by an artist and an idea once', async () => {
    const read = reader()
    await preparePack(plan(), { ownerId: OWNER, store: freshStore(), readPhoto: read, now: clock() })
    expect(readIds(read).filter((id) => id === ID.mora)).toHaveLength(1)
  })

  it('does not trust a response that is not an image, or is empty', async () => {
    const read = reader({ [ID.mora]: image('<!doctype html>', 'text/html'), [ID.vesper]: image('', 'image/webp') })
    const pack = await preparePack(plan(), { ownerId: OWNER, store: freshStore(), readPhoto: read, now: clock() })
    expect(pack.results[ID.mora]).toBe('unavailable')
    expect(pack.results[ID.vesper]).toBe('unavailable')
    expect(packStatus(pack).state).toBe('incomplete')
  })

  it('is not ready after a partial download', async () => {
    const pack = await preparePack(plan(), { ownerId: OWNER, store: freshStore(), readPhoto: reader({ [ID.key]: { error: 'partial' } }), now: clock() })
    expect(pack.results[ID.key]).toBe('partial')
    expect(packStatus(pack)).toMatchObject({ state: 'incomplete', saved: 2 })
    expect(packStatus(pack).problems).toEqual([{ id: ID.key, why: 'partial' }])
  })

  it('after going offline, a retry fetches only what is missing, then is ready', async () => {
    const store = freshStore()
    const first = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: reader({ [ID.vesper]: { error: 'offline' } }), now: clock() })
    expect(packStatus(first)).toMatchObject({ state: 'incomplete', reason: 'offline', saved: 2 })

    const read = reader()
    const second = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: read, now: clock('2026-11-26T15:00:00.000Z') })
    expect(readIds(read)).toEqual([ID.vesper])
    expect(packStatus(second)).toMatchObject({ state: 'ready', saved: 3, checkedAt: '2026-11-26T15:00:00.000Z' })
  })

  it('stops at a full disk, keeps what it saved, and is not ready', async () => {
    const store = freshStore()
    const putPhoto = store.putPhoto
    let writes = 0
    const full = {
      ...store,
      putPhoto: (record) => {
        writes += 1
        if (writes === 2) return Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'))
        return putPhoto(record)
      },
    }
    const read = reader()
    const pack = await preparePack(plan(), { ownerId: OWNER, store: full, readPhoto: read, now: clock() })

    expect(pack.stoppedBy).toBe('quota')
    expect(pack.results).toMatchObject({ [ID.key]: 'saved', [ID.mora]: 'quota', [ID.vesper]: 'skipped' })
    expect(readIds(read)).not.toContain(ID.vesper)
    expect(packStatus(pack)).toMatchObject({ state: 'incomplete', reason: 'quota', saved: 1 })
    expect(await store.getPhoto(OWNER, ID.key)).not.toBeNull()

    // With room again, it finishes without re-reading what it kept.
    const again = reader()
    const finished = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: again, now: clock() })
    expect(readIds(again)).toEqual([ID.mora, ID.vesper])
    expect(packStatus(finished).state).toBe('ready')
  })

  it('reports a quota failure on the pack record itself, before reading anything', async () => {
    const store = freshStore()
    const full = { ...store, putPack: () => Promise.reject(new DOMException('full', 'QuotaExceededError')) }
    const read = reader()
    await expect(preparePack(plan(), { ownerId: OWNER, store: full, readPhoto: read, now: clock() })).rejects.toSatisfy(isQuotaError)
    expect(read).not.toHaveBeenCalled()
  })

  it('a stopped or reloaded run is interrupted, never ready, and resumes from what it saved', async () => {
    const store = freshStore()
    const controller = new AbortController()
    const read = reader()
    const run = preparePack(plan(), {
      ownerId: OWNER, store, readPhoto: read, now: clock(), signal: controller.signal,
      onProgress: (done) => { if (done === 1) controller.abort() },
    })
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })

    // What a reload finds: a run that never finished.
    const stored = await store.getPack(OWNER, 'uk-tattoo-fest@2027')
    expect(packStatus(stored).state).toBe('interrupted')
    const checked = await verifyPack(stored, { store, now: clock() })
    expect(packStatus(checked)).toMatchObject({ state: 'interrupted', saved: 1 })

    const resume = reader()
    const done = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: resume, now: clock() })
    expect(readIds(resume)).toEqual([ID.mora, ID.vesper])
    expect(packStatus(done).state).toBe('ready')
  })

  // Review finding (codex): a Stop during the final read-back still committed
  // the run as done.
  it('a Stop during the final read-back leaves the pack interrupted', async () => {
    const store = freshStore()
    const controller = new AbortController()
    let readingBack = false
    const watched = {
      ...store,
      getPhoto: async (...args) => {
        const record = await store.getPhoto(...args)
        if (readingBack) controller.abort()
        return record
      },
    }
    const run = preparePack(plan(), {
      ownerId: OWNER, store: watched, readPhoto: reader(), now: clock(), signal: controller.signal,
      onProgress: (done, total) => { if (done === total) readingBack = true },
    })
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(packStatus(await store.getPack(OWNER, 'uk-tattoo-fest@2027')).state).toBe('interrupted')
  })

  it('stops writing as soon as the signed-in owner changes', async () => {
    const store = freshStore()
    let current = true
    const read = reader()
    const run = preparePack(plan(), {
      ownerId: OWNER, store, readPhoto: read, now: clock(),
      assertCurrent: () => { if (!current) throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' }) },
      onProgress: (done) => { if (done === 1) current = false },
    })
    await expect(run).rejects.toMatchObject({ code: 'owner_changed' })
    expect(await store.listPhotoIds(OWNER)).toEqual([ID.key])
    expect(packStatus(await store.getPack(OWNER, 'uk-tattoo-fest@2027')).state).toBe('interrupted')
  })

  it('refreshing drops photos the pack no longer holds', async () => {
    const store = freshStore()
    await preparePack(plan(), { ownerId: OWNER, store, readPhoto: reader(), now: clock() })
    await preparePack(plan({ artistIds: ['vesper'], ideaIds: [] }), { ownerId: OWNER, store, readPhoto: reader(), now: clock() })
    expect(await store.listPhotoIds(OWNER)).toEqual([ID.vesper])
  })
})

describe('verifyPack', () => {
  async function ready(store = freshStore()) {
    const pack = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: reader(), now: clock() })
    return { store, pack }
  }

  it('re-reads the stored bytes and stamps a new last-checked time, offline', async () => {
    const { store, pack } = await ready()
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const checked = await verifyPack(pack, { store, now: clock('2026-11-27T09:00:00.000Z') })
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(packStatus(checked)).toMatchObject({ state: 'ready', checkedAt: '2026-11-27T09:00:00.000Z' })
    expect((await store.getPack(OWNER, pack.editionKey)).verification.checkedAt).toBe('2026-11-27T09:00:00.000Z')
  })

  it('catches bytes that have gone (evicted, cleared): not ready', async () => {
    const { store, pack } = await ready()
    await store.deletePhotos(OWNER, [ID.vesper])
    const checked = await verifyPack(pack, { store, now: clock() })
    expect(packStatus(checked)).toMatchObject({ state: 'incomplete', reason: 'lost', saved: 2 })
    expect(packStatus(checked).problems).toEqual([{ id: ID.vesper, why: 'missing' }])
  })

  it('catches stale bytes that no longer match what was saved, and a refresh replaces them', async () => {
    const { store, pack } = await ready()
    const record = await store.getPhoto(OWNER, ID.mora)
    await store.putPhoto({ ...record, bytes: new TextEncoder().encode('something else').buffer })
    const checked = await verifyPack(pack, { store, now: clock() })
    expect(packStatus(checked).problems).toEqual([{ id: ID.mora, why: 'damaged' }])

    const read = reader()
    const refreshed = await preparePack(plan(), { ownerId: OWNER, store, readPhoto: read, now: clock() })
    expect(readIds(read)).toEqual([ID.mora])
    expect(packStatus(refreshed).state).toBe('ready')
  })
})

describe('removePack', () => {
  it('keeps photos another pack still uses, and drops the rest', async () => {
    const store = freshStore()
    await preparePack(plan(), { ownerId: OWNER, store, readPhoto: reader(), now: clock() })
    const other = planShowPack({ edition: { editionKey: 'tattoo-freeze@2027', label: 'Tattoo Freeze 2027' }, artists, ideas, selection: { artistIds: ['vesper'], ideaIds: [] } })
    const freeze = await preparePack(other, { ownerId: OWNER, store, readPhoto: reader(), now: clock() })

    await removePack(OWNER, 'uk-tattoo-fest@2027', { store })

    expect(await store.getPack(OWNER, 'uk-tattoo-fest@2027')).toBeNull()
    expect(await store.listPhotoIds(OWNER)).toEqual([ID.vesper])
    expect(packStatus(await verifyPack(freeze, { store, now: clock() })).state).toBe('ready')
  })

  it('never touches another account’s pack, the library, staged copies or stored blobs', async () => {
    const store = freshStore()
    await preparePack(plan(), { ownerId: OWNER, store, readPhoto: reader(), now: clock() })
    await preparePack(plan(), { ownerId: 'user-b', store, readPhoto: reader(), now: clock() })
    await putStagedBytes(KEY, 'data:image/jpeg;base64,a2V5')
    markDeviceCopy(KEY)
    const removeBlob = vi.spyOn(backend.blobs, 'remove').mockResolvedValue()
    const library = structuredClone({ artists, ideas })

    await removePack(OWNER, 'uk-tattoo-fest@2027', { store })

    expect(await store.listPhotoIds(OWNER)).toEqual([])
    expect((await store.listPhotoIds('user-b')).sort()).toEqual([ID.key, ID.mora, ID.vesper].sort())
    expect(await store.getPack('user-b', 'uk-tattoo-fest@2027')).not.toBeNull()
    expect(await getStagedBytes(KEY)).toBe('data:image/jpeg;base64,a2V5')
    expect(removeBlob).not.toHaveBeenCalled()
    expect({ artists, ideas }).toEqual(library)
  })
})

describe('readPhotoBytes', () => {
  const response = (body, { ok = true, status = 200, headers = {} } = {}) => ({
    ok, status, headers: new Headers(headers), blob: async () => body,
  })
  const resolve = async () => '/images/demo/mora/1.webp'

  it('hands back an image', async () => {
    const blob = image('abc', 'image/webp')
    const result = await readPhotoBytes('images/demo/mora/1.webp', { resolve, fetchImpl: async () => response(blob, { headers: { 'content-length': '3' } }) })
    expect(result.blob).toBe(blob)
  })

  it('calls a body shorter than its announced length partial', async () => {
    const result = await readPhotoBytes('images/demo/mora/1.webp', { resolve, fetchImpl: async () => response(image('abc'), { headers: { 'content-length': '100' } }) })
    expect(result).toEqual({ error: 'partial' })
  })

  it('calls a body cut off mid-read partial', async () => {
    const cut = { ok: true, status: 200, headers: new Headers(), blob: () => Promise.reject(new TypeError('network error')) }
    expect(await readPhotoBytes('images/a.webp', { resolve, fetchImpl: async () => cut })).toEqual({ error: 'partial' })
  })

  // Review finding (codex): a 206 is a slice of the photo, and its length
  // header describes the slice, so the length check alone can't catch it.
  it('calls a range response partial', async () => {
    const slice = { ok: true, status: 206, headers: new Headers({ 'content-length': '3' }), blob: async () => image('abc') }
    expect(await readPhotoBytes('images/a.webp', { resolve, fetchImpl: async () => slice })).toEqual({ error: 'partial' })
    const ranged = response(image('abc'), { headers: { 'content-range': 'bytes 0-2/100' } })
    expect(await readPhotoBytes('images/a.webp', { resolve, fetchImpl: async () => ranged })).toEqual({ error: 'partial' })
  })

  // Review finding (codex): a same-origin path must not follow a redirect to
  // another site. A blob key's storage url is the backend's own business.
  it('keeps a same-origin photo request same-origin', async () => {
    const fetchImpl = vi.fn(async () => response(image('abc', 'image/webp')))
    await readPhotoBytes('images/demo/mora/1.webp', { resolve, fetchImpl })
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ mode: 'same-origin' })
    await readPhotoBytes({ key: KEY }, { resolve: async () => 'https://storage.example.com/signed?token=x', fetchImpl })
    expect(fetchImpl.mock.calls[1][1]?.mode).toBeUndefined()
    await readPhotoBytes({ key: KEY }, { resolve: async () => 'data:image/jpeg;base64,YQ==', fetchImpl })
    expect(fetchImpl.mock.calls[2][1]?.mode).toBeUndefined()
  })

  it('tells offline from a missing photo', async () => {
    expect(await readPhotoBytes('images/a.webp', { resolve, fetchImpl: () => Promise.reject(new TypeError('Failed to fetch')) })).toEqual({ error: 'offline' })
    expect(await readPhotoBytes('images/a.webp', { resolve, fetchImpl: async () => response(image(''), { ok: false, status: 404 }) })).toEqual({ error: 'unavailable' })
    expect(await readPhotoBytes({ key: KEY }, { resolve: async () => '', fetchImpl: vi.fn() })).toEqual({ error: 'unavailable' })
  })

  it('passes an abort through rather than calling it offline', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchImpl = () => Promise.reject(new DOMException('Aborted', 'AbortError'))
    await expect(readPhotoBytes('images/a.webp', { resolve, fetchImpl, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('isQuotaError', () => {
  it('recognises the browsers’ quota errors', () => {
    expect(isQuotaError(new DOMException('x', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true)
    expect(isQuotaError({ code: 22 })).toBe(true)
    expect(isQuotaError(new Error('nope'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
  })
})
