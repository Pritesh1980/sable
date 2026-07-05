import { describe, it, expect } from 'vitest'
import { canUseGL, resolveTransitionMode } from '../lib/gl'

describe('canUseGL', () => {
  it('is true when webgl2 context creation succeeds', () => {
    const canvas = { getContext: (type) => (type === 'webgl2' ? {} : null) }
    expect(canUseGL(() => canvas)).toBe(true)
  })

  it('is true when only webgl1 context creation succeeds', () => {
    const canvas = { getContext: (type) => (type === 'webgl' ? {} : null) }
    expect(canUseGL(() => canvas)).toBe(true)
  })

  it('is false when no context is returned', () => {
    const canvas = { getContext: () => null }
    expect(canUseGL(() => canvas)).toBe(false)
  })

  it('is false when context creation throws', () => {
    const canvas = { getContext: () => { throw new Error('no gl') } }
    expect(canUseGL(() => canvas)).toBe(false)
  })
})

describe('resolveTransitionMode', () => {
  const noPreference = () => ({ matches: false })
  const reduced = () => ({ matches: true })
  const passingStorage = { getItem: () => null }
  const location = (search) => ({ search })

  it('returns webgl when nothing overrides and gl is supported', () => {
    const mode = resolveTransitionMode({
      location: location(''),
      storage: passingStorage,
      matchMedia: noPreference,
      canUseGL: () => true,
    })
    expect(mode).toBe('webgl')
  })

  it('returns css when canUseGL is false', () => {
    const mode = resolveTransitionMode({
      location: location(''),
      storage: passingStorage,
      matchMedia: noPreference,
      canUseGL: () => false,
    })
    expect(mode).toBe('css')
  })

  it('returns css when ?gl=off is in the query string', () => {
    const mode = resolveTransitionMode({
      location: location('?gl=off'),
      storage: passingStorage,
      matchMedia: noPreference,
      canUseGL: () => true,
    })
    expect(mode).toBe('css')
  })

  it('returns css when other query params are present alongside gl=off', () => {
    const mode = resolveTransitionMode({
      location: location('?foo=bar&gl=off'),
      storage: passingStorage,
      matchMedia: noPreference,
      canUseGL: () => true,
    })
    expect(mode).toBe('css')
  })

  it('returns css when localStorage tattoo_gl_override is "off"', () => {
    const mode = resolveTransitionMode({
      location: location(''),
      storage: { getItem: (key) => (key === 'tattoo_gl_override' ? 'off' : null) },
      matchMedia: noPreference,
      canUseGL: () => true,
    })
    expect(mode).toBe('css')
  })

  it('returns css when prefers-reduced-motion matches', () => {
    const mode = resolveTransitionMode({
      location: location(''),
      storage: passingStorage,
      matchMedia: reduced,
      canUseGL: () => true,
    })
    expect(mode).toBe('css')
  })

  it('defaults to real globals when deps are omitted', () => {
    // jsdom has no WebGL support, so this should resolve to css without throwing
    expect(() => resolveTransitionMode()).not.toThrow()
    expect(resolveTransitionMode()).toBe('css')
  })
})
