import { describe, it, expect, vi, afterEach } from 'vitest'
import { randomId } from '../data/randomId'

afterEach(() => vi.restoreAllMocks())

describe('randomId', () => {
  it('uses crypto.randomUUID where the browser offers it', () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-2222-4333-8444-555555555555')
    expect(randomId()).toBe('11111111-2222-4333-8444-555555555555')
    expect(spy).toHaveBeenCalled()
  })

  // randomUUID exists only in secure contexts; the dev server reached from a
  // phone over plain http (LAN / Tailscale IP) is not one. getRandomValues works
  // there, so the fallback never needs Math.random.
  it('falls back to getRandomValues, never Math.random, outside a secure context', () => {
    const original = globalThis.crypto.randomUUID
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
    const mathRandom = vi.spyOn(Math, 'random')
    try {
      const ids = new Set(Array.from({ length: 500 }, () => randomId()))
      expect(ids.size).toBe(500)
      for (const id of ids) expect(id).toMatch(/^[0-9a-f]{32}$/)
      expect(mathRandom).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
