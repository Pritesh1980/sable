import { describe, it, expect } from 'vitest'
import { nextStep, topArtists } from '../data/homeNext'

const artist = (id, rank, extra = {}) => ({ id, handle: id, name: '', rank, images: [`images/${id}/1.webp`], tags: [], ...extra })
const idea = (id, extra = {}) => ({ id, title: `Idea ${id}`, linkedArtists: [], images: [], status: 'idea', ...extra })
const TODAY = '2026-11-14'

describe('nextStep', () => {
  it('asks for a first artist when the collection is empty', () => {
    expect(nextStep({ artists: [], ideas: [], concepts: [], today: TODAY }))
      .toMatchObject({ kind: 'add-artist', to: '/gallery' })
  })

  it('puts a nearby guest spot first: it is the only step with a date on it', () => {
    const artists = [artist('a', 1, {
      name: 'Mora Vane',
      guestSpots: [{ id: 's1', city: 'London', startDate: '2026-11-20', endDate: '2026-11-22' }],
    })]
    const step = nextStep({ artists, ideas: [], concepts: [], today: TODAY })
    expect(step.kind).toBe('nearby')
    expect(step.label).toMatch(/Mora Vane/)
    expect(step.label).toMatch(/London/)
    expect(step.to).toBe('/gallery?artist=a#guest-spots')
  })

  it('asks for a first idea once there are artists', () => {
    expect(nextStep({ artists: [artist('a', 1)], ideas: [], concepts: [], today: TODAY }))
      .toMatchObject({ kind: 'add-idea', to: '/brief?new=1' })
  })

  it('points at the first open idea that has no artist yet', () => {
    const ideas = [
      idea('done', { status: 'done' }),
      idea('linked', { linkedArtists: ['a'] }),
      idea('open', { title: 'Fern sleeve' }),
    ]
    const step = nextStep({ artists: [artist('a', 1)], ideas, concepts: [], today: TODAY })
    expect(step).toMatchObject({ kind: 'match-idea', to: '/brief?idea=open' })
    expect(step.label).toMatch(/Fern sleeve/)
  })

  it('suggests a first concept when every idea has an artist', () => {
    const ideas = [idea('linked', { linkedArtists: ['a'] })]
    expect(nextStep({ artists: [artist('a', 1)], ideas, concepts: [], today: TODAY }))
      .toMatchObject({ kind: 'add-concept', to: '/concepts?new=1' })
  })

  it('falls back to the wall when nothing is outstanding', () => {
    const ideas = [idea('linked', { linkedArtists: ['a'] })]
    expect(nextStep({ artists: [artist('a', 1)], ideas, concepts: [{ id: 'c' }], today: TODAY }))
      .toMatchObject({ kind: 'browse', to: '/gallery' })
  })

  it('survives missing collections', () => {
    expect(nextStep().kind).toBe('add-artist')
  })
})

describe('topArtists', () => {
  it('orders by rank and prefers artists with a photo to show', () => {
    const list = [artist('c', 3), artist('bare', 1, { images: [] }), artist('a', 2)]
    expect(topArtists(list, 2).map((a) => a.id)).toEqual(['a', 'c'])
  })

  it('fills with photo-less artists rather than showing fewer', () => {
    const list = [artist('bare', 1, { images: [] }), artist('a', 2)]
    expect(topArtists(list, 6).map((a) => a.id)).toEqual(['a', 'bare'])
  })
})
