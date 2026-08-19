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
        conventionOverrides: {},
      },
    })
  })
})

// #84 cross-model review: `editGen` is internal sync bookkeeping (#84) that
// must never leak into a user-facing artifact — a backup export reads
// straight from in-memory state, which still carries it until confirmed.
describe('createBackup (editGen stripping, #84 review)', () => {
  it('strips editGen from every collection before it reaches the backup', () => {
    const backup = createBackup({
      artists: [{ id: 'artist-1', editGen: 'g1' }],
      ideas: [{ id: 'idea-1', editGen: 'g2' }],
      boards: [{ id: 'board-1', editGen: 'g3' }],
      concepts: [{ id: 'concept-1', editGen: 'g4' }],
    })

    expect(backup.data.artists).toEqual([{ id: 'artist-1' }])
    expect(backup.data.ideas).toEqual([{ id: 'idea-1' }])
    expect(backup.data.boards).toEqual([{ id: 'board-1' }])
    expect(backup.data.concepts).toEqual([{ id: 'concept-1' }])
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
        images: [{ url: 'https://example.com/moth.jpg', note: 'Use the wing shape, not the exact flower.' }],
        linkedArtists: ['a1'],
      },
      [{ id: 'a1', handle: 'artist_one', name: 'Artist One', tags: ['blackwork'], status: 'contact-next', notes: 'Strong insects.' }]
    )

    expect(text).toContain('Tattoo idea: Moth study')
    expect(text).toContain('Placement: forearm')
    expect(text).toContain('Note: Use the wing shape, not the exact flower.')
    expect(text).toContain('- Artist One (@artist_one) - blackwork')
    expect(text).toContain('Status: contact-next')
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
