import { describe, it, expect, vi } from 'vitest'
import { buildBoardBrief, buildIdeaBrief, createBackup, parseBackup, replaceLibraryQuestion, requestBackupDownload } from '../data/export'

it('initiates a date-named download from an attached anchor before deferred URL cleanup', () => {
  vi.useFakeTimers()
  const oldCreate = URL.createObjectURL
  const oldRevoke = URL.revokeObjectURL
  URL.createObjectURL = vi.fn(() => 'blob:backup')
  URL.revokeObjectURL = vi.fn()
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    expect(document.body.contains(this)).toBe(true)
    expect(this.download).toBe('tattoo-backup-2026-09-28.json')
  })
  try {
    requestBackupDownload({ exportedAt: '2026-09-28T12:00:00.000Z', data: {} })
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:backup')
  } finally {
    click.mockRestore()
    URL.createObjectURL = oldCreate
    URL.revokeObjectURL = oldRevoke
    vi.useRealTimers()
  }
})

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

// #158: importing replaces everything, so the confirm names both sides.
describe('replaceLibraryQuestion', () => {
  const rows = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }))
  const library = (counts = {}, conventionOverrides = {}) => ({
    artists: rows(counts.artists || 0, 'a'),
    ideas: rows(counts.ideas || 0, 'i'),
    boards: rows(counts.boards || 0, 'b'),
    concepts: rows(counts.concepts || 0, 'c'),
    conventionOverrides,
  })
  // Midday UTC, so the date reads the same in any test-runner time zone.
  const OCT_1 = '2026-10-01T12:00:00.000Z'

  it('asks nothing when the current library is empty', () => {
    expect(replaceLibraryQuestion(library(), library({ artists: 8 }), OCT_1)).toBeNull()
  })

  it('names both sides with counts and the backup date', () => {
    expect(replaceLibraryQuestion(library({ artists: 12, ideas: 4 }), library({ artists: 8, ideas: 2 }), OCT_1))
      .toBe("Replace your library (12 artists, 4 ideas) with this backup from 1 Oct 2026 (8 artists, 2 ideas)? This can't be undone.")
  })

  it('lists a collection on both sides when either side has it, so a loss shows as 0', () => {
    expect(replaceLibraryQuestion(library({ artists: 1, concepts: 3 }), library({ artists: 2, boards: 1 }), OCT_1))
      .toBe("Replace your library (1 artist, 0 boards, 3 concepts) with this backup from 1 Oct 2026 (2 artists, 1 board, 0 concepts)? This can't be undone.")
  })

  it('leaves the date out when the file has none or it is not a date', () => {
    const question = 'Replace your library (1 idea) with this backup (0 ideas)? This can\'t be undone.'
    expect(replaceLibraryQuestion(library({ ideas: 1 }), library(), undefined)).toBe(question)
    expect(replaceLibraryQuestion(library({ ideas: 1 }), library(), 'yesterday')).toBe(question)
  })

  it('counts recorded convention attendance as library content', () => {
    expect(replaceLibraryQuestion(library({}, { 'big-london': ['a0'] }), library(), OCT_1))
      .toBe("Replace your library (attendance at 1 convention) with this backup from 1 Oct 2026 (attendance at 0 conventions)? This can't be undone.")
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
