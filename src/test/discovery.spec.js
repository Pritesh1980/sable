import { describe, it, expect } from 'vitest'
import { buildDiscoveryPrompt, parseDiscoveryResponse } from '../data/discovery'

const artists = [
  { handle: 'zoia.ink', tags: ['dark-illustrative', 'surrealism'], styleDescriptor: 'fine-line geometry, dotwork shading' },
  { handle: 'victorportugal', tags: ['dark-illustrative', 'blackwork'] },
]

describe('buildDiscoveryPrompt', () => {
  it('describes the collection style DNA and lists exclusions', () => {
    const p = buildDiscoveryPrompt(artists, { exclude: ['zoia.ink', 'victorportugal', 'kamilczapiga'] })
    expect(p).toContain('dark-illustrative')
    expect(p).toContain('fine-line geometry, dotwork shading')
    expect(p).toContain('kamilczapiga')
    // Output contract is machine-parseable lines
    expect(p).toMatch(/handle \| name \| styles \| note/i)
  })
})

describe('parseDiscoveryResponse', () => {
  it('parses well-formed lines into suggestion objects marked as ai-sourced', () => {
    const out = parseDiscoveryResponse(
      '@some_artist | Some Artist | blackwork, dark-illustrative | Heavy black geometric work\n' +
      'other.artist | Other Artist | surrealism | Dreamlike compositions'
    )
    expect(out).toEqual([
      { handle: 'some_artist', name: 'Some Artist', tags: ['blackwork', 'dark-illustrative'], note: 'Heavy black geometric work', source: 'ai' },
      { handle: 'other.artist', name: 'Other Artist', tags: ['surrealism'], note: 'Dreamlike compositions', source: 'ai' },
    ])
  })

  it('filters unknown style tags and drops entries left with none', () => {
    const out = parseDiscoveryResponse(
      'a1 | A One | blackwork, watercolour | ok\n' +
      'a2 | A Two | neo-traditional | all unknown tags'
    )
    expect(out).toHaveLength(1)
    expect(out[0].tags).toEqual(['blackwork'])
  })

  it('ignores junk lines, headers and dedupes handles', () => {
    const out = parseDiscoveryResponse(
      'Here are some suggestions:\n' +
      'handle | name | styles | note\n' +
      'a1 | A One | blackwork | first\n' +
      '@A1 | A One Again | blackwork | duplicate\n' +
      'not a valid line at all'
    )
    expect(out).toHaveLength(1)
    expect(out[0].handle).toBe('a1')
  })

  it('returns [] for empty or unusable text', () => {
    expect(parseDiscoveryResponse('')).toEqual([])
    expect(parseDiscoveryResponse('no pipes here')).toEqual([])
  })
})
