import { describe, it, expect } from 'vitest'
import { isIOS } from '../data/platform'

describe('isIOS', () => {
  it('recognizes an iPhone Safari user agent', () => {
    expect(isIOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
  })

  it('recognizes an iPad user agent', () => {
    expect(isIOS('Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15')).toBe(true)
  })

  it('recognizes an iPod user agent', () => {
    expect(isIOS('Mozilla/5.0 (iPod touch; CPU iPhone OS 17_5 like Mac OS X)')).toBe(true)
  })

  it('rejects a desktop Mac user agent', () => {
    expect(isIOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36')).toBe(false)
  })

  it('rejects an Android user agent', () => {
    expect(isIOS('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36')).toBe(false)
  })

  it('defaults to false for an empty/unknown user agent', () => {
    expect(isIOS('')).toBe(false)
    expect(isIOS(undefined)).toBe(false)
  })
})
