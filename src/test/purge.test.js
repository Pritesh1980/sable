import { describe, it, expect, beforeEach, vi } from 'vitest'
import { purgeLocalUserData } from '../backend/purge'
import { SHARE_CACHE } from '../sw/shareTarget'
import { createOwnerScope } from '../backend/ownerScope'
import { createLocalStore } from '../backend/local/localStore'
import { createLocalBlobs } from '../backend/local/localBlobs'
import { backend } from '../backend'
import { getCachedBlobUrl, keyForUrl, registerBlobUrl, resolveBlobKey } from '../data/blobUrls'
import { pendingImageJobs } from '../data/imageJobs/pendingJobs'
import { compileRefinementPrompt } from '../../shared/imageJobs'
import { Blob } from 'node:buffer'
import { stageImage } from '../data/imageStaging'
import { STAGED_IMAGES_DB, UPLOAD_OUTBOX_KEY, DEVICE_COPIES_KEY, readOutbox } from '../data/stagedImageStore'

describe('purgeLocalUserData', () => {
  beforeEach(() => localStorage.clear())

  it('clears transient refinement inputs for every owner on identity change', async () => {
    const fields = { change: 'Adjust ink', keep: '', palette: 'black' }
    const requestId = 'v1.1800000000000.00000000-0000-4000-8000-000000000001'
    for (const ownerId of ['A', 'B']) {
      await pendingImageJobs.put({ requestId, ownerId,
        source: new Blob(['private prepared image'], { type: 'image/png' }), sourceImageDigest: 'a'.repeat(64),
        request: { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
          ...fields, prompt: compileRefinementPrompt(fields) },
        destination: { ownerId, conceptId: 'concept', parentVariantId: null, draftRevision: 1 },
        createdAt: 1_800_000_000_000, jobId: null, accepted: false })
    }
    await purgeLocalUserData()
    expect(await pendingImageJobs.list('A')).toEqual([])
    expect(await pendingImageJobs.list('B')).toEqual([])
  })

  it('retains private canonical rows and bytes while invalidating display resolutions', async () => {
    const ownerScope = createOwnerScope({ privateMode: true, getOwnerId: () => 'A' })
    const store = createLocalStore({ ownerScope, allowLegacy: false })
    const blobs = createLocalBlobs({ ownerScope, allowLegacy: false })
    const key = 'user/A/concepts/purge/image.png'
    const bytes = 'data:image/png;base64,YQ=='
    await store.upsert('concepts', [{ id: 'retained', image: { key } }])
    await blobs.upload('A', key, bytes)
    registerBlobUrl(key, bytes)
    let finish
    const spy = vi.spyOn(backend.blobs, 'getUrl').mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    const pending = resolveBlobKey('user/A/concepts/purge/pending.png')
    await purgeLocalUserData()
    finish('late-display-url')
    expect(await pending).toBe('')
    expect(getCachedBlobUrl(key)).toBe('')
    expect(keyForUrl(bytes)).toBeNull()
    expect(keyForUrl('late-display-url')).toBeNull()
    expect(await store.list('concepts')).toEqual([{ id: 'retained', image: { key } }])
    expect(await blobs.getUrl(key)).toBe(bytes)
    spy.mockRestore()
  })

  // Review finding (codex): an uncollected shared screenshot lives in an
  // origin-scoped cache, so without this A shares, closes before collecting,
  // and B signs in and picks up A's image from /share.
  it('drops an uncollected shared screenshot', async () => {
    const del = vi.fn()
    vi.stubGlobal('caches', { delete: del })

    await purgeLocalUserData()

    expect(del).toHaveBeenCalledWith(SHARE_CACHE)
    vi.unstubAllGlobals()
  })

  it('survives an environment with no Cache API', async () => {
    vi.stubGlobal('caches', undefined)
    await expect(purgeLocalUserData()).resolves.not.toThrow()
    vi.unstubAllGlobals()
  })

  it('clears the signed-in user data caches', async () => {
    localStorage.setItem('tattoo_ideas', '[{"id":"1"}]')
    localStorage.setItem('tattoo_artists_meta', '[{"id":"a"}]')
    localStorage.setItem('tattoo_img_migrated_v1', '1')
    localStorage.setItem('tattoo_legacy_sweep_v1', '{"a":{"x.1":0}}')

    await purgeLocalUserData()

    expect(localStorage.getItem('tattoo_ideas')).toBeNull()
    expect(localStorage.getItem('tattoo_artists_meta')).toBeNull()
    expect(localStorage.getItem('tattoo_img_migrated_v1')).toBeNull()
    // #118: the legacy photo sweep's ledger is about this user's photos.
    expect(localStorage.getItem('tattoo_legacy_sweep_v1')).toBeNull()
  })

  // #115: a photo still waiting to upload is the signed-out user's content.
  it('clears photos still waiting to upload: the staged bytes and the outbox', async () => {
    vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await stageImage('data:image/jpeg;base64,cGVuZGluZw==', { userId: 'u1', scope: 'artists', id: 'a1' })
    expect(readOutbox()).toHaveLength(1)

    await purgeLocalUserData()

    expect(readOutbox()).toEqual([])
    expect(localStorage.getItem(UPLOAD_OUTBOX_KEY)).toBeNull()
    expect(localStorage.getItem(DEVICE_COPIES_KEY)).toBeNull()
    const reopen = indexedDB.open(STAGED_IMAGES_DB)
    let upgraded = false
    reopen.onupgradeneeded = () => { upgraded = true }
    const db = await new Promise((resolve, reject) => {
      reopen.onsuccess = () => resolve(reopen.result)
      reopen.onerror = () => reject(reopen.error)
    })
    // A fresh upgrade proves the staged bytes went with the database.
    expect(upgraded).toBe(true)
    db.close()
    vi.restoreAllMocks()
  })

  it('preserves device prefs, API keys, and the local simulated remote', async () => {
    localStorage.setItem('tattoo_theme', 'dark')
    localStorage.setItem('tattoo_font', 'large')
    localStorage.setItem('openai_api_key', 'sk-xxx')
    localStorage.setItem('tattoo_remote_ideas', '[{"id":"r"}]')

    await purgeLocalUserData()

    expect(localStorage.getItem('tattoo_theme')).toBe('dark')
    expect(localStorage.getItem('tattoo_font')).toBe('large')
    expect(localStorage.getItem('openai_api_key')).toBe('sk-xxx')
    expect(localStorage.getItem('tattoo_remote_ideas')).toBe('[{"id":"r"}]')
  })

  // #28: purge previously fired deleteDatabase fire-and-forget, so a caller
  // awaiting it had no guarantee the display-image cache was actually gone.
  it('awaits the IndexedDB display-image cache actually being deleted', async () => {
    const openReq = indexedDB.open('tattoo-images-v1', 1)
    openReq.onupgradeneeded = (e) => e.target.result.createObjectStore('artist-images')
    const db = await new Promise((resolve, reject) => {
      openReq.onsuccess = () => resolve(openReq.result)
      openReq.onerror = () => reject(openReq.error)
    })
    await new Promise((resolve, reject) => {
      const tx = db.transaction('artist-images', 'readwrite')
      tx.objectStore('artist-images').put(['x'], 'artist-1')
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()

    await purgeLocalUserData()

    const reopenReq = indexedDB.open('tattoo-images-v1', 1)
    let upgraded = false
    reopenReq.onupgradeneeded = () => { upgraded = true }
    const reopened = await new Promise((resolve, reject) => {
      reopenReq.onsuccess = () => resolve(reopenReq.result)
      reopenReq.onerror = () => reject(reopenReq.error)
    })
    // A fresh onupgradeneeded firing proves the previous database (and its
    // 'artist-1' row) was actually deleted, not just requested-and-forgotten.
    expect(upgraded).toBe(true)
    reopened.close()
  })

  // #28: deleteDatabase silently never resolves while another tab/connection
  // holds the database open — purge must not hang forever waiting for it.
  it('resolves even when IndexedDB deletion is blocked by an open connection', async () => {
    const openReq = indexedDB.open('tattoo-images-v1', 1)
    openReq.onupgradeneeded = (e) => e.target.result.createObjectStore('artist-images')
    const blockingDb = await new Promise((resolve, reject) => {
      openReq.onsuccess = () => resolve(openReq.result)
      openReq.onerror = () => reject(openReq.error)
    })

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(purgeLocalUserData()).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()

    blockingDb.close()
    errSpy.mockRestore()
  })

  // #28 review (codex + agy): onblocked resolving early is a safety net for a
  // non-cooperating connection, but a *cooperating* one (this app's own
  // openDB(), wired to auto-close on versionchange) should never block purge
  // at all — otherwise the queued deletion can fire later and silently wipe
  // whatever a newly signed-in user has since written to a recreated DB.
  it('does not block at all when a lingering connection auto-closes on versionchange', async () => {
    const openReq = indexedDB.open('tattoo-images-v1', 1)
    openReq.onupgradeneeded = (e) => e.target.result.createObjectStore('artist-images')
    const cooperatingDb = await new Promise((resolve, reject) => {
      openReq.onsuccess = () => resolve(openReq.result)
      openReq.onerror = () => reject(openReq.error)
    })
    cooperatingDb.onversionchange = () => cooperatingDb.close()

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await purgeLocalUserData()
    // No "blocked by an open connection" log means onblocked never fired.
    expect(errSpy).not.toHaveBeenCalledWith(expect.stringContaining('blocked'))
    errSpy.mockRestore()
  })
})
