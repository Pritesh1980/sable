import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  stageImage,
  stageImages,
  withStagedImages,
  drainOutbox,
  watchUploadOutbox,
} from '../data/imageStaging'
import { STAGED_IMAGES_DB, readOutbox } from '../data/stagedImageStore'
import { uploadImages, uploadDataUrl } from '../hooks/useImageUpload'
import { clearBlobUrls, keyForUrl, resolveBlobKey } from '../data/blobUrls'
import { backend } from '../backend'

// #115. A photo gets a durable copy on this device, under a freshly minted key,
// before that key enters state; the upload is queued in an outbox that retries
// until the backend confirms it.

const PHOTO = 'data:image/jpeg;base64,c3RhZ2VkIHBob3Rv'
const OTHER = 'data:image/jpeg;base64,YW5vdGhlciBvbmU='
const CTX = { userId: 'u1', scope: 'artists', id: 'zoia.ink' }

function deleteDb(name) {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}

const failUploads = () => vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
const inBlobStore = (key) => backend.blobs.getUrl(key)
// Lets a failed upload attempt finish before the backend "comes back", so the
// next attempt is a fresh one rather than the failing one still in flight.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await deleteDb(STAGED_IMAGES_DB)
  await deleteDb('tattoo-blobs-v1')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('stageImage', () => {
  it('mints a per-user key, keeps the bytes and queues the upload before handing the key back', async () => {
    failUploads()

    const { key, url } = await stageImage(PHOTO, CTX)

    expect(key).toMatch(/^user\/u1\/artists\/zoia\.ink\/[^/]+\.jpg$/)
    // Until state holds refs (#116/#117), the display URL is the data URL
    // itself, registered so saving maps it straight back to the key.
    expect(url).toBe(PHOTO)
    expect(keyForUrl(PHOTO)).toBe(key)
    expect(readOutbox()).toEqual([expect.objectContaining({ key, userId: 'u1' })])
  })

  it('a staged photo resolves from this device, with the backend unreachable and nothing in memory', async () => {
    failUploads()
    const getUrl = vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    const { key } = await stageImage(PHOTO, CTX)

    clearBlobUrls() // a reload

    expect(await resolveBlobKey(key)).toBe(PHOTO)
    expect(getUrl).not.toHaveBeenCalled()
  })

  it('uploads straight away when it can, and keeps the device copy so an offline reload still shows it', async () => {
    const { key } = await stageImage(PHOTO, CTX)

    await vi.waitFor(() => expect(readOutbox()).toEqual([]))
    expect(await inBlobStore(key)).toBe(PHOTO)

    // The upload is confirmed, but the old data-URL display cache used to keep
    // the photo visible offline; the device copy must do the same.
    clearBlobUrls()
    const getUrl = vi.spyOn(backend.blobs, 'getUrl').mockRejectedValue(new Error('offline'))
    expect(await resolveBlobKey(key)).toBe(PHOTO)
    expect(getUrl).not.toHaveBeenCalled()
  })

  it('mints a fresh key for every photo, even identical bytes', async () => {
    failUploads()
    const a = await stageImage(PHOTO, CTX)
    const b = await stageImage(OTHER, CTX)
    expect(a.key).not.toBe(b.key)
    expect(readOutbox().map((e) => e.key).sort()).toEqual([a.key, b.key].sort())
  })

  it('without a signed-in user, hands the data URL back unregistered and queues nothing', async () => {
    const upload = vi.spyOn(backend.blobs, 'upload')

    const result = await stageImage(PHOTO, { ...CTX, userId: undefined })

    expect(result).toEqual({ key: null, url: PHOTO })
    expect(keyForUrl(PHOTO)).toBeNull()
    expect(readOutbox()).toEqual([])
    expect(upload).not.toHaveBeenCalled()
  })

  it('falls back to uploading directly when the bytes cannot be kept on the device', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('IndexedDB unavailable') })
    const upload = vi.spyOn(backend.blobs, 'upload').mockResolvedValue({})

    const { key } = await stageImage(PHOTO, CTX)

    expect(upload).toHaveBeenCalledWith('u1', key, expect.any(Blob), 'image/jpeg')
    expect(keyForUrl(PHOTO)).toBe(key)
    expect(readOutbox()).toEqual([])
  })

  describe('when the photo can be neither kept on the device nor uploaded', () => {
    const noDeviceStore = () => vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new Error('IndexedDB unavailable') })

    it('stageImage reports failure, registers nothing and hands back no base64', async () => {
      failUploads()
      noDeviceStore()
      expect(await stageImage(PHOTO, CTX)).toEqual({ key: null, url: '', failed: true })
      expect(keyForUrl(PHOTO)).toBeNull()
      expect(readOutbox()).toEqual([])
    })

    it('withStagedImages does not commit, so base64 never reaches persisted state', async () => {
      failUploads()
      noDeviceStore()
      vi.stubGlobal('alert', vi.fn())
      const commit = vi.fn()
      await withStagedImages([PHOTO], CTX, commit)
      expect(commit).not.toHaveBeenCalled()
      expect(globalThis.alert).toHaveBeenCalled()
    })

    it('stageImages leaves the failed photo out', async () => {
      failUploads()
      noDeviceStore()
      vi.stubGlobal('alert', vi.fn())
      expect(await stageImages([PHOTO], CTX)).toEqual([])
    })
  })

  it('never writes the bytes into localStorage', async () => {
    failUploads()
    await stageImage(PHOTO, CTX)
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      expect(localStorage.getItem(key), key).not.toMatch(/data:|;base64,/)
    }
  })
})

describe('the upload outbox', () => {
  it('retries until the backend takes the photo', async () => {
    const upload = failUploads()
    const { key } = await stageImage(PHOTO, CTX)
    await settle()
    expect(await drainOutbox({ userId: 'u1' })).toEqual({ uploaded: 0, pending: 1 })

    upload.mockRestore()
    expect(await drainOutbox({ userId: 'u1' })).toEqual({ uploaded: 1, pending: 0 })

    expect(readOutbox()).toEqual([])
    expect(await inBlobStore(key)).toBe(PHOTO)
  })

  it('only sends the signed-in user’s photos', async () => {
    const upload = failUploads()
    const mine = await stageImage(PHOTO, CTX)
    const theirs = await stageImage(OTHER, { ...CTX, userId: 'u2' })
    await settle()
    upload.mockRestore()

    await drainOutbox({ userId: 'u1' })

    expect(await inBlobStore(mine.key)).toBe(PHOTO)
    expect(readOutbox().map((e) => e.key)).toEqual([theirs.key])
  })

  it('drops a queued upload whose bytes are gone rather than retrying it forever', async () => {
    const upload = failUploads()
    const { key } = await stageImage(PHOTO, CTX)
    await deleteDb(STAGED_IMAGES_DB) // evicted by the browser, say
    upload.mockRestore()
    const send = vi.spyOn(backend.blobs, 'upload')

    expect(await drainOutbox({ userId: 'u1' })).toEqual({ uploaded: 0, pending: 0 })

    expect(readOutbox()).toEqual([])
    expect(send).not.toHaveBeenCalled()
    expect(await inBlobStore(key)).toBe('')
  })

  it('does not even try while the browser reports it is offline', async () => {
    const upload = failUploads()
    await stageImage(PHOTO, CTX)
    await settle()
    upload.mockClear()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    expect(await drainOutbox({ userId: 'u1' })).toEqual({ uploaded: 0, pending: 1 })

    expect(upload).not.toHaveBeenCalled()
  })

  it('sends a photo once even when two drains overlap', async () => {
    const upload = failUploads()
    await stageImage(PHOTO, CTX)
    await settle()
    upload.mockRestore()
    const send = vi.spyOn(backend.blobs, 'upload')

    await Promise.all([drainOutbox({ userId: 'u1' }), drainOutbox({ userId: 'u1' })])

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('retries as soon as the browser says it is back online', async () => {
    const upload = failUploads()
    const { key } = await stageImage(PHOTO, CTX)
    const stop = watchUploadOutbox('u1') // its first drain fails too: still offline
    await settle()
    upload.mockRestore()

    window.dispatchEvent(new Event('online'))

    await vi.waitFor(async () => expect(await inBlobStore(key)).toBe(PHOTO))
    expect(readOutbox()).toEqual([])
    stop()
  })

  it('drains when watching starts, for an app opened with photos still queued', async () => {
    const upload = failUploads()
    const { key } = await stageImage(PHOTO, CTX)
    await settle()
    upload.mockRestore()

    const stop = watchUploadOutbox('u1')

    await vi.waitFor(async () => expect(await inBlobStore(key)).toBe(PHOTO))
    stop()
  })

  it('stops listening once unwatched', async () => {
    const upload = failUploads()
    const stop = watchUploadOutbox('u1')
    stop()
    await stageImage(PHOTO, CTX)
    upload.mockClear()

    window.dispatchEvent(new Event('online'))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(upload).not.toHaveBeenCalled()
  })
})

describe('withStagedImages', () => {
  it('commits at once when there is nothing to stage', () => {
    const commit = vi.fn()
    withStagedImages(['https://example.com/a.jpg', 'images/demo/x.webp'], CTX, commit)
    withStagedImages([PHOTO], { ...CTX, userId: undefined }, commit)
    expect(commit).toHaveBeenCalledTimes(2)
  })

  it('stages inline photos first, so they are registered by the time they are committed', async () => {
    failUploads()
    let registeredAtCommit = null
    const commit = vi.fn(() => { registeredAtCommit = keyForUrl(PHOTO) })

    const pending = withStagedImages([PHOTO, { url: OTHER, addedAt: '2026-09-01T10:00:00.000Z' }], CTX, commit)

    expect(commit).not.toHaveBeenCalled()
    await pending
    expect(commit).toHaveBeenCalledTimes(1)
    expect(registeredAtCommit).toMatch(/^user\/u1\/artists\/zoia\.ink\//)
    expect(keyForUrl(OTHER)).toMatch(/^user\/u1\/artists\/zoia\.ink\//)
  })

  it('leaves a photo that is already staged alone', async () => {
    failUploads()
    const { key } = await stageImage(PHOTO, CTX)
    const commit = vi.fn()

    withStagedImages([PHOTO], CTX, commit)

    expect(commit).toHaveBeenCalledTimes(1)
    expect(keyForUrl(PHOTO)).toBe(key)
    expect(readOutbox()).toHaveLength(1)
  })
})

describe('the upload helpers stage too', () => {
  it('stageImages returns a registered display URL per photo', async () => {
    failUploads()
    const urls = await stageImages([PHOTO, OTHER], CTX)
    expect(urls).toEqual([PHOTO, OTHER])
    expect(keyForUrl(PHOTO)).toBeTruthy()
    expect(keyForUrl(OTHER)).toBeTruthy()
  })

  it('uploadDataUrl hands back the staged key even while the upload is failing', async () => {
    failUploads()
    const key = await uploadDataUrl(PHOTO, { userId: 'u1', scope: 'ideas', id: 'i1' })
    expect(key).toMatch(/^user\/u1\/ideas\/i1\//)
    expect(readOutbox().map((e) => e.key)).toEqual([key])
  })

  it('uploadImages stages every compressed photo before returning its URL', async () => {
    failUploads()
    // jsdom has no canvas or image decoding; stand in for both.
    class FakeImage {
      constructor() { this.width = 1200; this.height = 900 }
      set src(_value) { setTimeout(() => this.onload?.(), 0) }
    }
    vi.stubGlobal('Image', FakeImage)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} })
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PHOTO)

    const urls = await uploadImages([new File(['x'], 'shot.jpg', { type: 'image/jpeg' })], CTX)

    expect(urls).toEqual([PHOTO])
    expect(keyForUrl(PHOTO)).toMatch(/^user\/u1\/artists\/zoia\.ink\//)
    expect(readOutbox()).toHaveLength(1)
  })
})
