import { describe, it, expect } from 'vitest'
import * as planning from '../data/planning'
import {
  buildMatchRationale,
  getImageNote,
  getImageUrl,
  artistsForIdea,
  matchArtistsForIdea,
  normalizeReferenceImages,
  setImageNote,
} from '../data/planning'

// Artist status was removed from the app (#220 D): nothing may read it.
describe('artist status', () => {
  it('is no longer part of planning', () => {
    expect(planning.ARTIST_STATUSES).toBeUndefined()
    expect(planning.normalizeArtistStatus).toBeUndefined()
    expect(planning.buildPipelineSummary).toBeUndefined()
    expect(planning.buildDashboardSummary).toBeUndefined()
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
  it('scores by tag overlap, then rank', () => {
    const matches = matchArtistsForIdea(
      { tags: ['blackwork', 'surrealism'] },
      [
        { id: 'a', rank: 5, tags: ['blackwork'] },
        { id: 'b', rank: 20, tags: ['blackwork', 'surrealism'] },
        { id: 'c', rank: 8, tags: ['blackwork'] },
      ]
    )

    expect(matches.map((m) => m.artist.id)).toEqual(['b', 'a', 'c'])
    expect(matches[0].overlapTags).toEqual(['blackwork', 'surrealism'])
  })

  it('ignores a stored status', () => {
    const idea = { tags: ['blackwork'] }
    const matches = matchArtistsForIdea(idea, [
      { id: 'passed', rank: 1, status: 'pass', tags: ['blackwork'] },
      { id: 'next', rank: 2, status: 'contact-next', tags: ['blackwork'] },
    ])
    expect(matches.map((m) => m.artist.id)).toEqual(['passed', 'next'])
    expect(matches[0]).not.toHaveProperty('status')
  })

  it('returns no matches when the idea has no style tags', () => {
    expect(matchArtistsForIdea({ tags: [] }, [{ id: 'a', tags: ['blackwork'] }])).toEqual([])
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

describe('setImageNote (#114)', () => {
  const a = { url: '', note: '', key: 'user/u1/a.jpg' }
  const b = { url: '', note: '', key: 'user/u1/b.jpg' }

  it('sets the note on the targeted photo only, even when no url has resolved', () => {
    expect(setImageNote([a, b], b, 'linework').map((i) => i.note)).toEqual(['', 'linework'])
  })

  it('still finds the photo after its signed url changed', () => {
    const refreshed = { ...a, url: 'https://signed.example/a?t=2' }
    const stale = { ...a, url: 'https://signed.example/a?t=1' }
    expect(setImageNote([refreshed, b], stale, 'x').map((i) => i.note)).toEqual(['x', ''])
  })

  it('normalises plain url strings and matches them by url', () => {
    expect(setImageNote(['x.jpg', 'y.jpg'], { url: 'y.jpg', note: '' }, 'n')).toEqual([
      { url: 'x.jpg', note: '' },
      { url: 'y.jpg', note: 'n' },
    ])
  })
})

describe('artistsForIdea (#220 D)', () => {
  const art = (id, rank, tags = []) => ({ id, rank, tags })

  it('orders linked artists by shared styles, then rank, before any suggestion', () => {
    const artists = [art('r1', 1), art('r2', 2), art('r3', 3), art('r4', 4, ['blackwork', 'surrealism']), art('s', 5, ['blackwork'])]
    const idea = { tags: ['blackwork', 'surrealism'], linkedArtists: ['r1', 'r2', 'r3', 'r4'] }
    expect(artistsForIdea(idea, artists).map((r) => r.artist.id)).toEqual(['r4', 'r1', 'r2'])
  })

  it('fills up with matches that are not linked', () => {
    const artists = [art('a', 1, ['blackwork']), art('b', 2, ['blackwork']), art('c', 3, [])]
    const rows = artistsForIdea({ tags: ['blackwork'], linkedArtists: ['c'] }, artists)
    expect(rows.map((r) => [r.artist.id, r.linked])).toEqual([['c', true], ['a', false], ['b', false]])
  })
})

