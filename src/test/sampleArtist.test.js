import { describe, it, expect } from 'vitest'
import { SAMPLE_ARTIST_PREFIX, addSampleArtist, removeSampleArtists, findSampleArtist } from '../data/sampleArtist'
import { STYLE_TAGS } from '../data/artists'
import { demoArtworkFor } from '../data/demoArtwork'

describe('sample artist (#220, group C)', () => {
  it('adds one fictional artist, marked as a sample, ranked first in an empty library', () => {
    const [sample, ...rest] = addSampleArtist([])
    expect(rest).toEqual([])
    expect(sample).toMatchObject({ sample: true, rank: 1 })
    expect(sample).not.toHaveProperty('status') // status left the app (#220 D)
    expect(sample.id.startsWith(SAMPLE_ARTIST_PREFIX)).toBe(true)
    expect(sample.name).toBeTruthy()
    expect(sample.tags.length).toBeGreaterThan(0)
    sample.tags.forEach((tag) => expect(STYLE_TAGS).toContain(tag))
  })

  it('uses only shipped demo artwork, stored base-relative', () => {
    const [sample] = addSampleArtist([])
    expect(sample.images.length).toBeGreaterThanOrEqual(3)
    sample.images.forEach((src) => {
      expect(src.startsWith('images/demo/')).toBe(true)
      expect(demoArtworkFor(src)).not.toBeNull()
    })
  })

  it('ranks the sample after the artists already saved, and never adds it twice', () => {
    const mine = [{ id: 'a', handle: 'a', rank: 1 }, { id: 'b', handle: 'b', rank: 4 }]
    const once = addSampleArtist(mine)
    expect(once).toHaveLength(3)
    expect(once[2].rank).toBe(5)
    expect(addSampleArtist(once)).toBe(once)
  })

  it('finds and removes the sample without touching real artists', () => {
    const mine = [{ id: 'a', handle: 'a', rank: 1 }]
    const withSample = addSampleArtist(mine)
    expect(findSampleArtist(withSample)?.sample).toBe(true)
    expect(findSampleArtist(mine)).toBeNull()
    expect(removeSampleArtists(withSample)).toEqual(mine)
    expect(removeSampleArtists(mine)).toBe(mine)
  })

  // Review of #225: a re-added sample must not inherit the removed one's
  // photo tombstones or in-flight uploads, which are keyed by artist id.
  it('gives each added sample its own id', () => {
    expect(addSampleArtist([])[0].id).not.toBe(addSampleArtist([])[0].id)
  })

  it('closes the rank gap when the sample was ranked above real artists', () => {
    const library = [...addSampleArtist([]), { id: 'a', handle: 'a', rank: 2 }, { id: 'b', handle: 'b', rank: 3 }]
    expect(removeSampleArtists(library).map((a) => [a.id, a.rank])).toEqual([['a', 1], ['b', 2]])
  })
})
