import { describe, it, expect } from 'vitest'
import { buildBoardBrief, buildIdeaBrief, createBackup, parseBackup } from '../data/export'

describe('createBackup', () => {
  it('wraps app data with version and timestamp', () => {
    const backup = createBackup(
      {
        artists: [{ id: 'artist-1' }],
        ideas: [{ id: 'idea-1' }],
        boards: [{ id: 'board-1' }],
        concepts: [{ id: 'concept-1' }],
      },
      '2026-05-19T12:00:00.000Z'
    )

    expect(backup).toEqual({
      version: 1,
      exportedAt: '2026-05-19T12:00:00.000Z',
      data: {
        artists: [{ id: 'artist-1' }],
        ideas: [{ id: 'idea-1' }],
        boards: [{ id: 'board-1' }],
        concepts: [{ id: 'concept-1' }],
      },
    })
  })
})

describe('parseBackup', () => {
  it('accepts current backup shape', () => {
    const result = parseBackup(JSON.stringify(createBackup({ artists: [{ id: 'a' }] })))
    expect(result.artists).toEqual([{ id: 'a' }])
    expect(result.ideas).toEqual([])
  })

  it('accepts raw data shape for manual recovery', () => {
    const result = parseBackup({ artists: [], ideas: [{ id: 'i' }], boards: [], concepts: [] })
    expect(result.ideas).toEqual([{ id: 'i' }])
  })

  it('rejects non-array fields', () => {
    expect(() => parseBackup({ data: { artists: {} } })).toThrow('artists')
  })
})

describe('buildIdeaBrief', () => {
  it('formats idea details and linked artists for sharing', () => {
    const text = buildIdeaBrief(
      {
        title: 'Moth study',
        status: 'idea',
        placement: 'forearm',
        tags: ['blackwork', 'surrealism'],
        description: 'A moth emerging from dark botanicals.',
        images: ['https://example.com/moth.jpg'],
        linkedArtists: ['a1'],
      },
      [{ id: 'a1', handle: 'artist_one', name: 'Artist One', tags: ['blackwork'], notes: 'Strong insects.' }]
    )

    expect(text).toContain('Tattoo idea: Moth study')
    expect(text).toContain('Placement: forearm')
    expect(text).toContain('- Artist One (@artist_one) - blackwork')
    expect(text).toContain('Notes: Strong insects.')
  })
})

describe('buildBoardBrief', () => {
  it('formats board ideas in board order', () => {
    const text = buildBoardBrief(
      { name: 'Sleeve', description: 'Dark botanical sleeve.', ideaIds: ['b', 'a'] },
      [
        { id: 'a', title: 'Second', tags: ['fine-line'], linkedArtists: [] },
        { id: 'b', title: 'First', placement: 'upper arm', linkedArtists: ['artist'] },
      ],
      [{ id: 'artist', handle: 'artist_one', name: 'Artist One' }]
    )

    expect(text).toContain('Tattoo board: Sleeve')
    expect(text.indexOf('1. First')).toBeLessThan(text.indexOf('2. Second'))
    expect(text).toContain('Artists: Artist One')
  })
})
