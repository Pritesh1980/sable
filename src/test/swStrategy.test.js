import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { swStrategy, FONT_HOSTS } from '../sw/swStrategy'

const sameOrigin = (over = {}) => ({ method: 'GET', mode: 'no-cors', destination: '', sameOrigin: true, ...over })

describe('swStrategy', () => {
  it('bypasses non-GET requests', () => {
    expect(swStrategy(sameOrigin({ method: 'POST' }))).toBe('bypass')
    expect(swStrategy(sameOrigin({ method: 'DELETE', mode: 'navigate' }))).toBe('bypass')
  })

  it('bypasses cross-origin requests (auth, document store, signed images)', () => {
    expect(swStrategy(sameOrigin({ sameOrigin: false }))).toBe('bypass')
    expect(swStrategy(sameOrigin({ sameOrigin: false, mode: 'navigate' }))).toBe('bypass')
  })

  it('uses network-first for navigations so a new deploy is never masked by cache', () => {
    expect(swStrategy(sameOrigin({ mode: 'navigate' }))).toBe('network-first')
    expect(swStrategy(sameOrigin({ destination: 'document' }))).toBe('network-first')
  })

  it('uses cache-first for same-origin static assets (incl. the lazy three chunk)', () => {
    expect(swStrategy(sameOrigin({ destination: 'script' }))).toBe('cache-first')
    expect(swStrategy(sameOrigin({ destination: 'style' }))).toBe('cache-first')
    expect(swStrategy(sameOrigin({ destination: 'image' }))).toBe('cache-first')
  })

  it('cache-firsts Google Fonts even though they are cross-origin, so fonts work offline', () => {
    expect(swStrategy(sameOrigin({ sameOrigin: false, host: 'fonts.googleapis.com', destination: 'style' }))).toBe('cache-first')
    expect(swStrategy(sameOrigin({ sameOrigin: false, host: 'fonts.gstatic.com', destination: 'font' }))).toBe('cache-first')
    // Every declared font host resolves to cache-first.
    for (const host of FONT_HOSTS) {
      expect(swStrategy(sameOrigin({ sameOrigin: false, host }))).toBe('cache-first')
    }
  })

  it('does not cache a non-GET request to a font host', () => {
    expect(swStrategy(sameOrigin({ method: 'POST', sameOrigin: false, host: 'fonts.gstatic.com' }))).toBe('bypass')
  })

  it('still bypasses other cross-origin hosts (e.g. the auth/document backend)', () => {
    expect(swStrategy(sameOrigin({ sameOrigin: false, host: 'xyz.supabase.co' }))).toBe('bypass')
  })
})

describe('public/sw.js contract', () => {
  const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8')

  it('bumps the cache version past the cache-first-navigation era (v1)', () => {
    const match = sw.match(/const CACHE_NAME = '([^']+)'/)
    expect(match).toBeTruthy()
    expect(match[1]).not.toBe('tattoo-v1')
  })

  it('handles navigations network-first', () => {
    expect(sw).toMatch(/mode === 'navigate'/)
  })

  it('still bypasses cross-origin requests', () => {
    expect(sw).toMatch(/url\.origin !== self\.location\.origin/)
  })

  it('runtime-caches both Google Fonts hosts so typography works offline', () => {
    for (const host of FONT_HOSTS) {
      expect(sw).toContain(host)
    }
  })

  it('exempts fonts from the cross-origin bypass rather than bypassing them', () => {
    // The bypass guard must be gated on a font check, not an unconditional
    // cross-origin return — otherwise fonts would never be cached.
    expect(sw).toMatch(/!isFont && url\.origin !== self\.location\.origin/)
  })
})
