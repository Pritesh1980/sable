import { describe, it, expect } from 'vitest'
import { parseLineup } from '../data/lineup'
import { parseWinners } from '../data/winners'
import { buildStudioIndex } from '../data/showPlan'

// Pins parser output on awkward spacing: runs of spaces, tabs, no-break spaces,
// and the gap left where a handle is lifted out. The separator and trim regexes
// were rewritten to be linear (SonarQube S8786); these must not move.
const NBSP = ' '

describe('parseLineup spacing', () => {
  it.each([
    ['Oscar Akermo - Cloak & Dagger, UK', { name: 'Oscar Akermo', handle: '', note: 'Cloak & Dagger, UK' }],
    ['Oscar Akermo   -   Cloak & Dagger', { name: 'Oscar Akermo', handle: '', note: 'Cloak & Dagger' }],
    ['Oscar Akermo\t–\tCloak & Dagger', { name: 'Oscar Akermo', handle: '', note: 'Cloak & Dagger' }],
    [`Oscar Akermo${NBSP}|${NBSP}Cloak & Dagger`, { name: 'Oscar Akermo', handle: '', note: 'Cloak & Dagger' }],
    ['Oscar Akermo @oscarakermo - Cloak & Dagger', { name: 'Oscar Akermo', handle: 'oscarakermo', note: 'Cloak & Dagger' }],
    ['Oscar Akermo · Cloak • London', { name: 'Oscar Akermo', handle: '', note: 'Cloak — London' }],
    ['Oscar Akermo (Cloak & Dagger) ,;.- ', { name: 'Oscar Akermo Cloak & Dagger', handle: '', note: '' }],
    ['Jean-Luc Picard - Enterprise', { name: 'Jean-Luc Picard', handle: '', note: 'Enterprise' }],
  ])('%j', (line, expected) => {
    expect(parseLineup(line)).toEqual([expected])
  })
})

describe('parseWinners spacing', () => {
  it('reads "tattooed by" rows through runs of spaces and tabs', () => {
    const rows = parseWinners('Best Blackwork\n1st Place -  Tia   tattooed\tby   Adam Blakey  -  New Mind, Huddersfield.')
    expect(rows).toEqual([
      expect.objectContaining({ category: 'Best Blackwork', placing: 1, name: 'Adam Blakey', note: 'New Mind, Huddersfield', collector: 'Tia' }),
    ])
  })

  it.each([
    ['Best Colour | 1st | Ana Ink'],
    ['Best Colour  |  1st  |  Ana Ink'],
    ['Best Colour:  1st -  Ana Ink'],
    [`Best Colour${NBSP}–${NBSP}1st${NBSP}–${NBSP}Ana Ink`],
  ])('splits inline category rows: %j', (line) => {
    expect(parseWinners(line)).toEqual([
      expect.objectContaining({ category: 'Best Colour', placing: 1, name: 'Ana Ink' }),
    ])
  })

  it('ignores page chrome with trailing punctuation', () => {
    expect(parseWinners('Results:.\nWinners:')).toEqual([])
  })
})

describe('showPlan booth clause', () => {
  const studios = [
    { id: 'no-regrets-london', name: 'No Regrets London' },
    { id: 'no-regrets-bristol', name: 'No Regrets Bristol' },
    { id: 'london-glitch', name: 'London Glitch' },
  ]
  const index = buildStudioIndex([], studios)

  it.each([
    ['No Regrets Studios, Booth 380'],
    ['No Regrets Studios,   Booth 380'],
    ['No Regrets Studios , Booth 380'],
    ['No Regrets Studios Booth 380'],
    ['No Regrets StudiosBooth 380'],
  ])('strips the booth clause before matching and displaying: %j', (text) => {
    // Pooled across both branches, so the name shown is the show's own text.
    expect(index.matchText(text)?.name).toBe('No Regrets Studios')
  })

  it('stops at the first booth mention', () => {
    expect(index.matchText("London's Glitch, Booth 362, Booth 363")?.name).toBe('London Glitch')
  })
})
