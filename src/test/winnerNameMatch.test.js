import { describe, it, expect } from 'vitest'
import { indexWinners } from '../data/winners'

// Most results lists publish a name and no handle (Brighton's 2026 board has
// eighteen winners and not one Instagram handle). Most of the gallery is the
// other way round: a handle the owner follows, with `name` left blank. Exact
// matching therefore connects nothing at all, which makes the whole
// cross-reference inert for exactly the shows that publish results properly.
//
// So a winner's name is also tried against the artist's handle, normalised.
// "Adam Blakey" → adamblakey, which is how `adamblakeytattoos` begins.

const gallery = [
  { id: 'adamblakeytattoos', handle: 'adamblakeytattoos', name: '', rank: 20 },
  { id: 'oscarakermo', handle: 'oscarakermo', name: 'Oscar Akermo', rank: 6 },
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', rank: 1 },
]

const winner = (name, extra = {}) => ({ category: 'Large Healed', placing: 1, name, handle: '', note: '', ...extra })

describe('matching a name against a handle', () => {
  it('connects a winner’s name to the handle it begins', () => {
    const [entry] = indexWinners([winner('Adam Blakey')], gallery)
    expect(entry.savedArtistId).toBe('adamblakeytattoos')
  })

  it('says the match was inferred, not published', () => {
    const [entry] = indexWinners([winner('Adam Blakey')], gallery)
    expect(entry.matchedBy).toBe('name~handle')
  })

  it('marks an exact handle match as exact', () => {
    const [entry] = indexWinners([winner('', { handle: 'oscarakermo' })], gallery)
    expect(entry.matchedBy).toBe('handle')
  })

  it('marks an exact name match as exact', () => {
    const [entry] = indexWinners([winner('Oscar Akermo')], gallery)
    expect(entry.matchedBy).toBe('name')
  })

  it('ignores punctuation and case on both sides', () => {
    const [entry] = indexWinners([winner('zoia ink')], gallery)
    expect(entry.savedArtistId).toBe('zoia.ink')
  })

  it('does not match on a name too short to be distinctive', () => {
    const [entry] = indexWinners([winner('Ada')], gallery)
    expect(entry.savedArtistId).toBeNull()
  })

  it('refuses to guess when two handles both merely begin with the name', () => {
    const twins = [
      { id: 'a', handle: 'martinkubalatattoo', name: '' },
      { id: 'b', handle: 'martinkubalaink', name: '' },
    ]
    const [entry] = indexWinners([winner('Martin Kubala')], twins)
    expect(entry.savedArtistId).toBeNull()
  })

  it('takes the handle the name matches outright over one it merely begins', () => {
    const both = [
      { id: 'whole', handle: 'martinkubala', name: '' },
      { id: 'longer', handle: 'martinkubalatattoo', name: '' },
    ]
    const [entry] = indexWinners([winner('Martin Kubala')], both)
    expect(entry.savedArtistId).toBe('whole')
  })

  it('does not match a different artist whose handle merely looks similar', () => {
    const [entry] = indexWinners([winner('Nikki Tattoo')], [
      { id: 'niki', handle: 'niki___niki___niki', name: '' },
    ])
    expect(entry.savedArtistId).toBeNull()
  })

  it('leaves a genuinely unknown winner unmatched', () => {
    const [entry] = indexWinners([winner('Ellie Taylor')], gallery)
    expect(entry.savedArtistId).toBeNull()
    expect(entry.matchedBy).toBeNull()
  })

  it('still prefers an exact handle over an inferred name match', () => {
    const both = [
      { id: 'exact', handle: 'adamblakey', name: '' },
      { id: 'inferred', handle: 'adamblakeytattoos', name: '' },
    ]
    const [entry] = indexWinners([winner('Adam Blakey', { handle: 'adamblakey' })], both)
    expect(entry.savedArtistId).toBe('exact')
    expect(entry.matchedBy).toBe('handle')
  })

  it('does not let the source’s own typo match the wrong artist', () => {
    // Brighton printed both "Adam Blakey" and "Adam Blackey" on one page. The
    // misspelling is not a prefix of the handle, so it stays unmatched rather
    // than being fuzzily attached to someone.
    const [entry] = indexWinners([winner('Adam Blackey')], gallery)
    expect(entry.savedArtistId).toBeNull()
  })
})
