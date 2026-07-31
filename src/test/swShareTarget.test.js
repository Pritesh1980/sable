import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SHARE_CACHE } from '../sw/shareTarget'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const sw = readFileSync(join(root, 'public/sw.js'), 'utf8')

// public/sw.js is not bundled, so it cannot import src/sw/shareTarget.js — the
// two are kept in agreement by this contract test instead.
describe('public/sw.js share-target contract', () => {
  it('uses the same stash cache name as the module', () => {
    expect(sw).toContain(SHARE_CACHE)
  })

  // The fetch handler returns early on any non-GET, so the share POST has to be
  // handled before that guard or it never runs.
  it('handles the share POST before the non-GET early return', () => {
    const shareIdx = sw.indexOf("'share'")
    const guardIdx = sw.indexOf("request.method !== 'GET'")
    expect(shareIdx).toBeGreaterThan(-1)
    expect(guardIdx).toBeGreaterThan(-1)
    expect(shareIdx).toBeLessThan(guardIdx)
  })

  it('answers the POST with a redirect to the landing route', () => {
    expect(sw).toMatch(/share\?shared=1/)
    expect(sw).toMatch(/Response\.redirect|new Response\([\s\S]*30[123]/)
  })

  it('stashes under a base-relative url', () => {
    expect(sw).toContain('share-stash/latest')
    expect(sw).toMatch(/BASE \+ 'share-stash\/latest'|`\$\{BASE\}share-stash\/latest`/)
  })

  // activate() deletes every cache whose key is not the current one. The share
  // stash is user data, not a rebuildable asset bucket, so it must be spared or
  // a share arriving around an SW update would vanish.
  it('does not sweep the share stash in the activate cleanup', () => {
    const cleanup = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf("addEventListener('fetch'"))
    // The constant, not the literal — its value is pinned to the module by the
    // first test in this file.
    expect(cleanup).toMatch(/k !== SHARE_CACHE|SHARE_CACHE !== k/)
    expect(sw).toMatch(new RegExp(`const SHARE_CACHE = '${SHARE_CACHE}'`))
  })

  it('keeps deriving the base from its own location rather than hardcoding it', () => {
    expect(sw).toContain("self.location.pathname.replace(/sw\\.js$/, '')")
  })
})
