import { describe, it, expect } from 'vitest'
import { matchArtistsToIdea, IDEA_STATUSES } from '../data/brief'

describe('IDEA_STATUSES', () => {
  it('contains idea, booked, done', () => {
    const keys = IDEA_STATUSES.map((s) => s.value)
    expect(keys).toContain('idea')
    expect(keys).toContain('booked')
    expect(keys).toContain('done')
  })

  it('each status has a value and label', () => {
    IDEA_STATUSES.forEach((s) => {
      expect(s.value).toBeTruthy()
      expect(s.label).toBeTruthy()
    })
  })
})

describe('matchArtistsToIdea', () => {
  const artists = [
    { id: 'a1', handle: 'artist1', tags: ['blackwork', 'fine-line'] },
    { id: 'a2', handle: 'artist2', tags: ['surrealism', 'dark-fantasy'] },
    { id: 'a3', handle: 'artist3', tags: ['blackwork', 'surrealism'] },
    { id: 'a4', handle: 'artist4', tags: ['realism'] },
  ]

  it('returns artists sharing at least one style tag with the idea', () => {
    const idea = { tags: ['blackwork'] }
    const matched = matchArtistsToIdea(idea, artists)
    expect(matched.map((a) => a.id)).toEqual(expect.arrayContaining(['a1', 'a3']))
    expect(matched.find((a) => a.id === 'a4')).toBeUndefined()
  })

  it('returns empty array when idea has no tags', () => {
    const idea = { tags: [] }
    expect(matchArtistsToIdea(idea, artists)).toHaveLength(0)
  })

  it('returns empty array when no artists match', () => {
    const idea = { tags: ['fine-line'] }
    const result = matchArtistsToIdea(idea, [{ id: 'a1', tags: ['realism'] }])
    expect(result).toHaveLength(0)
  })

  it('ranks artists with more tag overlap higher', () => {
    const idea = { tags: ['blackwork', 'surrealism'] }
    const matched = matchArtistsToIdea(idea, artists)
    // a3 has both tags, a1 and a2 have one each
    expect(matched[0].id).toBe('a3')
  })

  it('handles artists with no tags gracefully', () => {
    const artistsWithEmpty = [
      { id: 'a1', tags: ['blackwork'] },
      { id: 'a2', tags: [] },
      { id: 'a3' }, // no tags field
    ]
    const idea = { tags: ['blackwork'] }
    const matched = matchArtistsToIdea(idea, artistsWithEmpty)
    expect(matched).toHaveLength(1)
    expect(matched[0].id).toBe('a1')
  })
})
