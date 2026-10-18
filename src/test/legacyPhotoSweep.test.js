import { describe, it, expect, vi, beforeEach } from 'vitest'
import { backend } from '../backend'
import { clearBlobUrls, keyForUrl } from '../data/blobUrls'
import {
  SWEEP_LEDGER_KEY,
  fingerprint,
  readLedger,
  ledgerEntry,
  recordRemovedInline,
  sweepLegacyPhotos,
} from '../data/legacyPhotoSweep'
import { STAGED_IMAGES_DB, readOutbox } from '../data/stagedImageStore'

// #118: the legacy IndexedDB cache (`tattoo-images-v1`) is no longer written.
// Whatever un-keyed photo is still only there is swept into blob storage,
// tracked in a device-local ledger so a re-run never uploads a photo twice and
// a photo deleted before it was swept stays deleted.

const LEGACY = 'data:image/png;base64,TEVHQUNZ'
const OTHER = 'data:image/jpeg;base64,T1RIRVI='

function deleteDb(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb('tattoo-blobs-v1')
  await deleteDb(STAGED_IMAGES_DB)
  vi.restoreAllMocks()
})

describe('fingerprint', () => {
  it('identifies the bytes, not the media type in the data url', () => {
    expect(fingerprint('data:image/png;base64,QUJD')).toBe(fingerprint('data:image/jpeg;base64,QUJD'))
    expect(fingerprint('data:image/png;base64,QUJD')).not.toBe(fingerprint('data:image/png;base64,QUJE'))
  })
})

describe('sweepLegacyPhotos', () => {
  it('stages an un-keyed cached photo once, folds its key in, and records it', async () => {
    const artists = [{ id: 'a', images: [] }]
    const first = await sweepLegacyPhotos({ userId: 'u1', artists, imageMap: { a: [LEGACY] } })

    expect(first.refs).toHaveLength(1)
    const { artistId, key } = first.refs[0]
    expect(artistId).toBe('a')
    expect(key).toMatch(/^user\/u1\/artists\/a\//)
    expect(keyForUrl(LEGACY)).toBe(key)
    // Staged first, then uploaded in the background by the outbox.
    await vi.waitFor(async () => expect(await backend.blobs.getUrl(key)).toBe(LEGACY))
    expect(ledgerEntry(readLedger(), 'a', LEGACY)).toEqual({ key })

    // Idempotent: the same cache, now with the key folded in, uploads nothing.
    clearBlobUrls()
    const upload = vi.spyOn(backend.blobs, 'upload')
    const again = await sweepLegacyPhotos({ userId: 'u1', artists: [{ id: 'a', images: [{ key }] }], imageMap: { a: [LEGACY] } })
    expect(again.refs).toEqual([])
    expect(upload).not.toHaveBeenCalled()
  })

  it('re-folds a recorded key that never reached the artist, but not one the user removed', async () => {
    const { refs } = await sweepLegacyPhotos({ userId: 'u1', artists: [{ id: 'a', images: [] }], imageMap: { a: [LEGACY] } })
    const { key } = refs[0]
    clearBlobUrls()

    // The tab closed before the folded key was saved: it comes back.
    const lost = await sweepLegacyPhotos({ userId: 'u1', artists: [{ id: 'a', images: [] }], imageMap: { a: [LEGACY] } })
    expect(lost.refs).toEqual([{ artistId: 'a', key }])

    // The user deleted the swept photo: its tombstone keeps it out.
    const removed = await sweepLegacyPhotos({
      userId: 'u1',
      artists: [{ id: 'a', images: [], removedImages: [{ ref: { key }, removedAt: '2026-10-01T00:00:00Z' }] }],
      imageMap: { a: [LEGACY] },
    })
    expect(removed.refs).toEqual([])
  })

  it('matches a cached photo the artist already holds under a key, by its bytes, and uploads nothing', async () => {
    // A photo migrated before the sweep was tracked: the cache still holds its
    // data url, nothing maps that url to the key after a reload, and the bytes
    // are on the backend under a key the artist already carries.
    const key = 'user/u1/artists/a/migrated.jpg'
    await backend.blobs.upload('u1', key, new Blob([Uint8Array.from(atob('TEVHQUNZ'), (c) => c.charCodeAt(0))], { type: 'image/jpeg' }), 'image/jpeg')
    clearBlobUrls()
    const upload = vi.spyOn(backend.blobs, 'upload')

    const { refs } = await sweepLegacyPhotos({ userId: 'u1', artists: [{ id: 'a', images: [{ key }] }], imageMap: { a: [LEGACY] } })

    expect(refs).toEqual([])
    expect(upload).not.toHaveBeenCalled()
    expect(ledgerEntry(readLedger(), 'a', LEGACY)).toEqual({ key })
  })

  it('leaves a photo undecided while the artist’s own photos cannot be read', async () => {
    const key = 'user/u1/artists/a/own.jpg'
    vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const upload = vi.spyOn(backend.blobs, 'upload')

    const { refs } = await sweepLegacyPhotos({ userId: 'u1', artists: [{ id: 'a', images: [{ key }] }], imageMap: { a: [LEGACY] } })

    expect(refs).toEqual([])
    expect(upload).not.toHaveBeenCalled()
    expect(ledgerEntry(readLedger(), 'a', LEGACY)).toBeUndefined()
  })

  it('keeps a photo whose upload fails on this device and queues it, so a later flush delivers it', async () => {
    vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { refs } = await sweepLegacyPhotos({ userId: 'u1', artists: [{ id: 'a', images: [] }], imageMap: { a: [LEGACY] } })

    expect(refs).toHaveLength(1)
    expect(readOutbox().map((e) => e.key)).toContain(refs[0].key)
  })

  it('skips a photo the user removed before it was swept, and anything that is not an inline photo', async () => {
    recordRemovedInline('a', [LEGACY, OTHER], [OTHER])
    const { refs } = await sweepLegacyPhotos({
      userId: 'u1',
      artists: [{ id: 'a', images: [] }],
      imageMap: { a: [LEGACY, { key: 'user/u1/artists/a/k.jpg' }, 'images/artists/a/1.jpg', 'data:text/html;base64,PGI+'] },
    })
    expect(refs).toEqual([])
    expect(ledgerEntry(readLedger(), 'a', LEGACY)).toEqual({ removed: true })
  })

  it('does nothing signed out', async () => {
    const { refs } = await sweepLegacyPhotos({ userId: null, artists: [{ id: 'a', images: [] }], imageMap: { a: [LEGACY] } })
    expect(refs).toEqual([])
    expect(localStorage.getItem(SWEEP_LEDGER_KEY)).toBeNull()
  })
})
