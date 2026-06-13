import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { swStrategy } from '../sw/swStrategy'

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

  it('uses cache-first for same-origin static assets', () => {
    expect(swStrategy(sameOrigin({ destination: 'script' }))).toBe('cache-first')
    expect(swStrategy(sameOrigin({ destination: 'style' }))).toBe('cache-first')
    expect(swStrategy(sameOrigin({ destination: 'image' }))).toBe('cache-first')
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
})
