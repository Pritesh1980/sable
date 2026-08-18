import { describe, it, expect, beforeEach, vi } from 'vitest'
import { purgeLocalUserData } from '../backend/purge'
import { SHARE_CACHE } from '../sw/shareTarget'

describe('purgeLocalUserData', () => {
  beforeEach(() => localStorage.clear())

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

    await purgeLocalUserData()

    expect(localStorage.getItem('tattoo_ideas')).toBeNull()
    expect(localStorage.getItem('tattoo_artists_meta')).toBeNull()
    expect(localStorage.getItem('tattoo_img_migrated_v1')).toBeNull()
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
})
