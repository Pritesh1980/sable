import { describe, it, expect } from 'vitest'
import { trimEndChars, trimChars } from '../data/textTrim'

// Loop-based replacements for `.replace(/[set]+$/, '')`. The regex form backtracks
// quadratically on a long run of set characters followed by one that isn't; a
// scan from the end cannot.
describe('trimEndChars', () => {
  it('strips trailing characters from the set, whitespace included when asked', () => {
    expect(trimEndChars('Ann, Studio ,;.- ', ',;.-', { whitespace: true })).toBe('Ann, Studio')
    expect(trimEndChars('Results:.', ':.')).toBe('Results')
    expect(trimEndChars('Results: ', ':.')).toBe('Results: ')
  })

  it('handles the dash, pipe and bullet characters the parsers split on', () => {
    expect(trimEndChars('Name –—|·•', '–—|·•', { whitespace: true })).toBe('Name')
  })

  it('leaves the string alone when nothing trails, and empties an all-trim string', () => {
    expect(trimEndChars('Name', ',')).toBe('Name')
    expect(trimEndChars(',,,', ',')).toBe('')
    expect(trimEndChars('', ',')).toBe('')
  })

  it('stays linear on the input that makes the regex form quadratic', () => {
    const nasty = 'a' + ' ,'.repeat(100_000) + 'b'
    const start = performance.now()
    expect(trimEndChars(nasty, ',', { whitespace: true })).toBe(nasty)
    expect(performance.now() - start).toBeLessThan(50)
  })
})

describe('trimChars', () => {
  it('strips the set from both ends', () => {
    expect(trimChars('--moth-line--', '-')).toBe('moth-line')
    expect(trimChars('__relief__', '_')).toBe('relief')
    expect(trimChars('----', '-')).toBe('')
  })
})
