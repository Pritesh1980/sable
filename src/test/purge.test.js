import { describe, it, expect, beforeEach, vi } from 'vitest'
import { purgeLocalUserData } from '../backend/purge'
import { SHARE_CACHE } from '../sw/shareTarget'

describe('purgeLocalUserData', () => {
  beforeEach(() => localStorage.clear())

  // Review finding (codex): an uncollected shared screenshot lives in an
  // origin-scoped cache, so without this A shares, closes before collecting,
  // and B signs in and picks up A's image from /share.
  it('drops an uncollected shared screenshot', () => {
    const del = vi.fn()
    vi.stubGlobal('caches', { delete: del })

    purgeLocalUserData()

    expect(del).toHaveBeenCalledWith(SHARE_CACHE)
    vi.unstubAllGlobals()
  })

  it('survives an environment with no Cache API', () => {
    vi.stubGlobal('caches', undefined)
    expect(() => purgeLocalUserData()).not.toThrow()
    vi.unstubAllGlobals()
  })

  it('clears the signed-in user data caches', () => {
    localStorage.setItem('tattoo_ideas', '[{"id":"1"}]')
    localStorage.setItem('tattoo_artists_meta', '[{"id":"a"}]')
    localStorage.setItem('tattoo_img_migrated_v1', '1')

    purgeLocalUserData()

    expect(localStorage.getItem('tattoo_ideas')).toBeNull()
    expect(localStorage.getItem('tattoo_artists_meta')).toBeNull()
    expect(localStorage.getItem('tattoo_img_migrated_v1')).toBeNull()
  })

  it('preserves device prefs, API keys, and the local simulated remote', () => {
    localStorage.setItem('tattoo_theme', 'dark')
    localStorage.setItem('tattoo_font', 'large')
    localStorage.setItem('openai_api_key', 'sk-xxx')
    localStorage.setItem('tattoo_remote_ideas', '[{"id":"r"}]')

    purgeLocalUserData()

    expect(localStorage.getItem('tattoo_theme')).toBe('dark')
    expect(localStorage.getItem('tattoo_font')).toBe('large')
    expect(localStorage.getItem('openai_api_key')).toBe('sk-xxx')
    expect(localStorage.getItem('tattoo_remote_ideas')).toBe('[{"id":"r"}]')
  })
})
