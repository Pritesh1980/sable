import { describe, expect, it } from 'vitest'
import {
  SHARE_CACHE,
  isShareTargetRequest,
  shareLandingUrl,
  shareStashUrl,
  pickSharedImage,
  takeSharedImage,
} from '../sw/shareTarget'

// Minimal stand-in for the Cache API — enough to prove take-and-clear.
function fakeCaches(stored = null) {
  const entries = new Map(stored ? [[stored.url, stored.response]] : [])
  return {
    deleted: [],
    open() {
      return Promise.resolve({
        match: (url) => Promise.resolve(entries.get(url) || undefined),
        delete: (url) => { this.deleted.push(url); return Promise.resolve(entries.delete(url)) },
      })
    },
  }
}

// A share_target with files must POST, and a static host cannot answer a POST —
// the service worker intercepts it, stashes the file and redirects. These are
// the decisions that logic turns on, kept pure because public/sw.js can't be
// imported by the suite.
describe('isShareTargetRequest', () => {
  it('matches only a POST to <base>share', () => {
    expect(isShareTargetRequest('POST', 'https://x.dev/sable/share', '/sable/')).toBe(true)
    expect(isShareTargetRequest('POST', 'https://x.dev/share', '/')).toBe(true)
  })

  it('ignores GETs to the same path — that is the iOS landing visit', () => {
    expect(isShareTargetRequest('GET', 'https://x.dev/sable/share', '/sable/')).toBe(false)
  })

  it('ignores POSTs elsewhere, and the same path under a different base', () => {
    expect(isShareTargetRequest('POST', 'https://x.dev/sable/gallery', '/sable/')).toBe(false)
    expect(isShareTargetRequest('POST', 'https://x.dev/share', '/sable/')).toBe(false)
  })

  it('ignores the query string when matching', () => {
    expect(isShareTargetRequest('POST', 'https://x.dev/sable/share?x=1', '/sable/')).toBe(true)
  })
})

describe('share URLs', () => {
  it('are base-aware', () => {
    expect(shareLandingUrl('/sable/')).toBe('/sable/share?shared=1')
    expect(shareLandingUrl('/')).toBe('/share?shared=1')
    expect(shareStashUrl('/sable/')).toBe('/sable/share-stash/latest')
    expect(shareStashUrl('/')).toBe('/share-stash/latest')
  })

  it('names a cache that the SW cleanup will not treat as a stale asset bucket', () => {
    expect(SHARE_CACHE).toMatch(/share/)
  })
})

describe('pickSharedImage', () => {
  it('takes the first image, ignoring non-images', () => {
    const txt = { type: 'text/plain', name: 'a.txt' }
    const png = { type: 'image/png', name: 'shot.png' }
    expect(pickSharedImage([txt, png])).toBe(png)
  })

  it('returns null when nothing shared is an image', () => {
    expect(pickSharedImage([{ type: 'application/pdf' }])).toBe(null)
    expect(pickSharedImage([])).toBe(null)
    expect(pickSharedImage(null)).toBe(null)
  })

  it('skips empty entries a share sheet can include', () => {
    expect(pickSharedImage([null, undefined, { type: 'image/jpeg' }])).toEqual({ type: 'image/jpeg' })
  })
})

// The page collects the stash exactly once — a reload must not re-add the same
// screenshot, so reading it also clears it.
describe('takeSharedImage', () => {
  it('returns the stashed image as a File and clears the stash', async () => {
    const store = fakeCaches({
      url: '/sable/share-stash/latest',
      response: new Response(new Blob(['x'], { type: 'image/png' }), {
        headers: { 'Content-Type': 'image/png' },
      }),
    })

    const file = await takeSharedImage('/sable/', store)
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/png')
    expect(store.deleted).toEqual(['/sable/share-stash/latest'])
  })

  it('returns null when nothing was shared', async () => {
    const store = fakeCaches()
    expect(await takeSharedImage('/sable/', store)).toBe(null)
    expect(store.deleted).toEqual([])
  })

  // Safari has no Cache API in some private modes, and this runs on every
  // ?shared=1 visit — it must never throw into the page.
  it('returns null rather than throwing when caches are unavailable', async () => {
    expect(await takeSharedImage('/sable/', undefined)).toBe(null)
    expect(await takeSharedImage('/sable/', {})).toBe(null)
  })
})
