import { describe, it, expect } from 'vitest'
import { groupWinners, indexWinners, parseWinners } from '../data/winners'

// The format a UK show actually publishes, taken verbatim from the Brighton
// Tattoo Convention's own results post (brightontattoo.com/news/2026-competition-winners,
// read 2026-09-10). The first version of this parser was written against an
// invented format and got real data almost entirely wrong, so the real thing is
// the fixture now.
//
// Two things about it drive the parsing rules below:
//
//  1. "<n>st Place - " — the ordinal is followed by the word "Place".
//  2. "<collector> tattooed by <artist>, <studio>, <town>" — the name that comes
//     FIRST is the collector wearing the tattoo, and the artist is the one after
//     "tattooed by". That is how convention competitions run: the collector walks
//     the stage, the trophy credits the artist. Sable is an app about artists, so
//     the artist is the winner and the collector is context.
const BRIGHTON_2026 = `Saturday - Small Healed.
1st Place - Heidi tattooed by Alexa Tattooer, Resonance Body Art, Nailsea.
2nd Place - Niko tattooed by Als Tattoo, Supreme Tattoo, Italy.
Saturday - Small Black & Grey.
1st Place - Tia tattooed by Adam Blackey, New Mind, Huddersfield.
2nd Place - Kayleigh tattooed by Brad Wallis, Stag & Bones, Liverpool.
Sunday - Large Healed.
1st Place - Tia tattooed by Adam Blakey, New Mind, Huddersfield.
2nd Place - Gemma tattooed by Jordan ferris, Studio Two 23, Bristol.
Sunday - Project.
1st Place - Sally tattooed by K.Peanut & Gee Jenkins, The Church, Birmingham.`

describe('the format shows actually publish', () => {
  const entries = parseWinners(BRIGHTON_2026)

  it('reads every result row, and only the result rows', () => {
    // Seven placings under four category headings; the headings themselves
    // must not become winners.
    expect(entries).toHaveLength(7)
  })

  it('credits the artist, not the collector wearing the tattoo', () => {
    const first = entries[0]
    expect(first.name).toBe('Alexa Tattooer')
    expect(first.collector).toBe('Heidi')
  })

  it('does not mistake the word “Place” for a name', () => {
    expect(entries.map((e) => e.name)).not.toContain('Place')
  })

  it('reads the placing out of “1st Place”', () => {
    expect(entries[0].placing).toBe(1)
    expect(entries[1].placing).toBe(2)
  })

  it('keeps the studio and town as the note', () => {
    expect(entries[0].note).toBe('Resonance Body Art, Nailsea')
  })

  it('takes the category from the day-prefixed heading', () => {
    expect(entries[0].category).toBe('Small Healed')
    expect(entries[2].category).toBe('Small Black & Grey')
  })

  it('handles a heading with no size qualifier', () => {
    expect(entries.at(-1).category).toBe('Project')
  })

  it('keeps an artist who won in two categories as two rows', () => {
    const adam = entries.filter((e) => /adam bla/i.test(e.name))
    expect(adam).toHaveLength(2)
    expect(adam.map((e) => e.category).sort()).toEqual(['Large Healed', 'Small Black & Grey'])
  })

  it('keeps a studio name that contains an ampersand intact', () => {
    const sally = entries.at(-1)
    expect(sally.name).toBe('K.Peanut & Gee Jenkins')
    expect(sally.note).toBe('The Church, Birmingham')
  })

  it('survives the dash some rows use instead of a comma after the artist', () => {
    const [entry] = parseWinners(`Sunday - Large Colour.
1st Place - Jamie tattooed by Anthony Lennox - Artium Ink, Exeter.`)
    expect(entry.name).toBe('Anthony Lennox')
    expect(entry.note).toBe('Artium Ink, Exeter')
  })

  it('has no handles to work with, because the show publishes none', () => {
    expect(entries.every((e) => e.handle === '')).toBe(true)
  })

  it('groups the rows under their four categories, 1st before 2nd', () => {
    const groups = groupWinners(indexWinners(entries, []))
    expect(groups).toHaveLength(4)
    expect(groups.map((g) => g.category).sort()).toEqual(
      ['Large Healed', 'Project', 'Small Black & Grey', 'Small Healed']
    )
    const healed = groups.find((g) => g.category === 'Small Healed')
    expect(healed.entries.map((e) => e.placing)).toEqual([1, 2])
    expect(healed.entries.map((e) => e.name)).toEqual(['Alexa Tattooer', 'Als Tattoo'])
  })

  it('matches a saved artist by name when there is no handle', () => {
    const saved = [{ id: 'adamblakeytattoos', handle: 'adamblakeytattoos', name: 'Adam Blakey', rank: 12 }]
    const indexed = indexWinners(entries, saved)
    const matched = indexed.filter((e) => e.savedArtistId === 'adamblakeytattoos')
    // The show spells it "Blakey" once and "Blackey" once — only the exact
    // spelling matches, which is the honest outcome: inventing a fuzzy match
    // between two real artists' names would be worse than missing one.
    expect(matched).toHaveLength(1)
    expect(matched[0].category).toBe('Large Healed')
  })
})

// Big London 2026, transcribed from the winners' own Instagram and Facebook
// posts. Shows invent their own category names — "Asian Inspired", "Ornamental",
// "Best of Saturday" — and a parser that only recognises its own taxonomy files
// the heading as a winner and puts the real winner under the previous category.
describe('category headings a taxonomy has never seen', () => {
  const BIG_LONDON = `Best Realism
1st - Alex Artlex @alex_artlex

Asian Inspired
1st - Berk Bosveren @berkbosveren

Best Ornamental
2nd - NiKi @niki___niki___niki`

  const entries = parseWinners(BIG_LONDON)

  it('does not turn the heading into a winner', () => {
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.handle)).toEqual(['alex_artlex', 'berkbosveren', 'niki___niki___niki'])
  })

  it('files the winner under the show’s own category name', () => {
    const berk = entries.find((e) => e.handle === 'berkbosveren')
    expect(berk.category).toBe('Asian Inspired')
  })

  it('does not leak the previous category onto the next winner', () => {
    expect(entries.find((e) => e.handle === 'alex_artlex').category).toBe('Best Realism')
    expect(entries.find((e) => e.handle === 'niki___niki___niki').category).toBe('Best Ornamental')
  })

  it('still treats a trailing unknown line with nothing under it as not-a-heading', () => {
    // Nothing follows it, so there is no evidence it heads anything.
    const trailing = parseWinners('Best Realism\n1st - Alex @alex_artlex\nThanks everyone')
    expect(trailing).toHaveLength(1)
  })
})

describe('the invented format still works', () => {
  it('parses the “1st - Name @handle” form the paste box suggests', () => {
    const [entry] = parseWinners('Best of Show\n1st - Oscar Akermo @oscarakermo')
    expect(entry).toMatchObject({ category: 'Best of Show', placing: 1, handle: 'oscarakermo', name: 'Oscar Akermo' })
    expect(entry.collector).toBeUndefined()
  })

  it('does not invent a collector where the row has no “tattooed by”', () => {
    const [entry] = parseWinners('Best Colour\n1st - Zoia @zoia.ink')
    expect(entry.collector).toBeUndefined()
  })
})
