import { describe, it, expect } from 'vitest'
import { SAMPLE_ARTIST_ID, addSampleArtist, removeSampleArtists, findSampleArtist } from '../data/sampleArtist'
import { STYLE_TAGS } from '../data/artists'
import { demoArtworkFor } from '../data/demoArtwork'

describe('sample artist (#220, group C)', () => {
  it('adds one fictional artist, marked as a sample, ranked first in an empty library', () => {
    const [sample, ...rest] = addSampleArtist([])
    expect(rest).toEqual([])
    expect(sample).toMatchObject({ id: SAMPLE_ARTIST_ID, sample: true, rank: 1, status: 'researching' })
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
    expect(findSampleArtist(withSample)?.id).toBe(SAMPLE_ARTIST_ID)
    expect(findSampleArtist(mine)).toBeNull()
    expect(removeSampleArtists(withSample)).toEqual(mine)
    expect(removeSampleArtists(mine)).toBe(mine)
  })
})
