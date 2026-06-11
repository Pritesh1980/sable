import { describe, it, expect } from 'vitest'
import {
  buildDashboardSummary,
  buildPipelineSummary,
  buildMatchRationale,
  getImageNote,
  getImageUrl,
  matchArtistsForIdea,
  normalizeArtistStatus,
  normalizeReferenceImages,
} from '../data/planning'

describe('normalizeArtistStatus', () => {
  it('defaults unknown statuses to researching', () => {
    expect(normalizeArtistStatus()).toBe('researching')
    expect(normalizeArtistStatus('unknown')).toBe('researching')
  })

  it('preserves known statuses', () => {
    expect(normalizeArtistStatus('contact-next')).toBe('contact-next')
  })
})

describe('normalizeReferenceImages', () => {
  it('supports legacy string URLs and note objects', () => {
    const images = normalizeReferenceImages([
      'https://example.com/a.jpg',
      { url: 'https://example.com/b.jpg', note: 'Line weight' },
      { note: 'missing url' },
    ])

    expect(images).toEqual([
      { url: 'https://example.com/a.jpg', note: '' },
      { url: 'https://example.com/b.jpg', note: 'Line weight' },
    ])
    expect(getImageUrl(images[1])).toBe('https://example.com/b.jpg')
    expect(getImageNote(images[1])).toBe('Line weight')
  })
})

describe('matchArtistsForIdea', () => {
  it('scores by tag overlap, status, and rank', () => {
    const matches = matchArtistsForIdea(
      { tags: ['blackwork', 'surrealism'] },
      [
        { id: 'a', rank: 5, status: 'researching', tags: ['blackwork'] },
        { id: 'b', rank: 20, status: 'pass', tags: ['blackwork', 'surrealism'] },
        { id: 'c', rank: 8, status: 'contact-next', tags: ['blackwork'] },
      ]
    )

    expect(matches.map((m) => m.artist.id)).toEqual(['b', 'c', 'a'])
    expect(matches[0].overlapTags).toEqual(['blackwork', 'surrealism'])
  })

  it('returns no matches when the idea has no style tags', () => {
    expect(matchArtistsForIdea({ tags: [] }, [{ id: 'a', tags: ['blackwork'] }])).toEqual([])
  })
})

describe('buildDashboardSummary', () => {
  it('summarizes active ideas, ready briefs, next artists, and boards', () => {
    const summary = buildDashboardSummary({
      artists: [
        { id: 'top', rank: 1 },
        { id: 'later', rank: 2, status: 'contact-next' },
      ],
      ideas: [
        { id: 'draft', title: 'Draft', status: 'idea' },
        { id: 'ready', title: 'Ready', status: 'booked', description: 'Full', linkedArtists: ['top'] },
        { id: 'done', title: 'Done', status: 'done' },
      ],
      boards: [
        { id: 'empty', ideaIds: [] },
        { id: 'board', ideaIds: ['ready'] },
      ],
    })

    expect(summary.activeIdeas.map((i) => i.id)).toEqual(['draft', 'ready'])
    expect(summary.exportReadyIdeas.map((i) => i.id)).toEqual(['ready'])
    expect(summary.nextArtists.map((a) => a.id)).toEqual(['later'])
    expect(summary.openBoards.map((b) => b.id)).toEqual(['board'])
    expect(summary.topArtists.map((a) => a.id)).toEqual(['top', 'later'])
  })
})

describe('buildMatchRationale', () => {
  const artist = { id: 'zoia.ink', styleDescriptor: 'black-and-grey, fine-line geometry, dotwork shading' }

  it('composes shared tags + first two descriptor phrases + placement', () => {
    const idea = { tags: ['dark-illustrative', 'fine-line'], placement: 'sleeve' }
    const match = { artist, overlapTags: ['dark-illustrative', 'fine-line'] }
    expect(buildMatchRationale(idea, match)).toBe(
      'Shares dark-illustrative + fine-line — their black-and-grey and fine-line geometry suit this sleeve.'
    )
  })

  it('falls back to "this idea" when there is no placement', () => {
    const idea = { tags: ['fine-line'] }
    const match = { artist, overlapTags: ['fine-line'] }
    expect(buildMatchRationale(idea, match)).toBe(
      'Shares fine-line — their black-and-grey and fine-line geometry suit this idea.'
    )
  })

  it('drops the descriptor clause when the artist has no styleDescriptor', () => {
    const idea = { placement: 'forearm' }
    const match = { artist: { id: 'x' }, overlapTags: ['blackwork'] }
    expect(buildMatchRationale(idea, match)).toBe('Shares blackwork with this forearm.')
  })

  it('returns empty string for a null match or no signal', () => {
    expect(buildMatchRationale({}, null)).toBe('')
    expect(buildMatchRationale({}, { artist: { id: 'x' }, overlapTags: [] })).toBe('')
  })
})

describe('buildPipelineSummary', () => {
  const a = (id, status, rank) => ({ id, handle: id, status, rank })

  it('returns the four active stages in workflow order with counts', () => {
    const artists = [
      a('r1', 'researching', 5),
      a('s1', 'shortlisted', 2),
      a('c1', 'contact-next', 1),
      a('c2', 'contact-next', 3),
      a('d1', 'contacted', 4),
    ]
    const { stages } = buildPipelineSummary(artists)
    expect(stages.map((s) => s.status)).toEqual(['researching', 'shortlisted', 'contact-next', 'contacted'])
    expect(stages.map((s) => s.count)).toEqual([1, 1, 2, 1])
    expect(stages.map((s) => s.label)).toEqual(['Researching', 'Shortlisted', 'Contact next', 'Contacted'])
  })

  it('rank-sorts artists within a stage', () => {
    const artists = [a('low', 'contact-next', 9), a('top', 'contact-next', 1)]
    const { stages } = buildPipelineSummary(artists)
    const contactNext = stages.find((s) => s.status === 'contact-next')
    expect(contactNext.artists.map((x) => x.id)).toEqual(['top', 'low'])
  })

  it('normalizes unknown statuses to researching', () => {
    const { stages } = buildPipelineSummary([a('x', 'banana', 1), a('y', undefined, 2)])
    expect(stages.find((s) => s.status === 'researching').count).toBe(2)
  })

  it('parks maybe/pass artists out of the strip with a count', () => {
    const artists = [a('m', 'maybe', 1), a('p', 'pass', 2), a('r', 'researching', 3)]
    const { stages, parked } = buildPipelineSummary(artists)
    expect(parked).toBe(2)
    expect(stages.reduce((n, s) => n + s.count, 0)).toBe(1)
  })

  it('handles an empty list', () => {
    const { stages, parked } = buildPipelineSummary([])
    expect(stages.every((s) => s.count === 0)).toBe(true)
    expect(parked).toBe(0)
  })
})
