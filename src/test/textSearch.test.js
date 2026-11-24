import { describe, it, expect } from 'vitest'
import { normaliseQuery, searchPhotosByText, groupByArtist, TEXT_MIN_SCORE } from '../data/textSearch'
import { refIdentity } from '../data/imageRef'

// Unit vectors at a chosen cosine to the query [1, 0].
const at = (cos) => [cos, Math.sqrt(1 - cos * cos)]

const item = (artistId, image, extra = {}) => ({ artistId, artistName: artistId.toUpperCase(), handle: artistId, image, imageIndex: 0, ...extra })

describe('normaliseQuery', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseQuery('  a   wolf \n')).toBe('a wolf')
  })

  it('lower-cases, so the same search hits the same cached vector', () => {
    expect(normaliseQuery('Skull')).toBe('skull')
  })

  it('caps the length at 100 characters', () => {
    expect(normaliseQuery('x'.repeat(300))).toHaveLength(100)
  })

  it('returns an empty string for nothing', () => {
    expect(normaliseQuery(undefined)).toBe('')
    expect(normaliseQuery('   ')).toBe('')
  })
})

describe('searchPhotosByText', () => {
  const vectors = new Map([
    [refIdentity('/a1.jpg'), at(0.31)],
    [refIdentity('/a2.jpg'), at(0.27)],
    [refIdentity('/b1.jpg'), at(0.29)],
    [refIdentity('/b2.jpg'), at(0.2)], // below the cut-off
  ])
  const getVec = (image) => vectors.get(refIdentity(image)) || null
  const items = [item('a', '/a1.jpg'), item('a', '/a2.jpg'), item('b', '/b1.jpg'), item('b', '/b2.jpg'), item('c', '/c1.jpg')]

  it('ranks photos best first and drops anything under the cut-off', () => {
    const results = searchPhotosByText([1, 0], items, getVec)
    expect(results.map((r) => r.item.image)).toEqual(['/a1.jpg', '/b1.jpg', '/a2.jpg'])
  })

  it('uses a cut-off calibrated by the #186 spike', () => {
    // Nonsense queries topped out at 0.243 on the real library; real subjects at 0.263+.
    expect(TEXT_MIN_SCORE).toBe(0.25)
  })

  it('caps the number of results', () => {
    expect(searchPhotosByText([1, 0], items, getVec, { limit: 2 })).toHaveLength(2)
  })

  it('counts a photo seen twice once', () => {
    const twice = [...items, item('a', '/a1.jpg', { imageIndex: 3 })]
    expect(searchPhotosByText([1, 0], twice, getVec).filter((r) => r.item.image === '/a1.jpg')).toHaveLength(1)
  })

  it('returns nothing without a query vector', () => {
    expect(searchPhotosByText(null, items, getVec)).toEqual([])
  })
})

describe('groupByArtist', () => {
  it('groups matches by artist, ordered by each artist\'s best photo', () => {
    const matches = [
      { item: item('a', '/a1.jpg'), similarity: 0.31 },
      { item: item('b', '/b1.jpg'), similarity: 0.29 },
      { item: item('a', '/a2.jpg'), similarity: 0.27 },
    ]
    const groups = groupByArtist(matches)
    expect(groups.map((g) => g.artistId)).toEqual(['a', 'b'])
    expect(groups[0]).toMatchObject({ artistName: 'A', handle: 'a' })
    expect(groups[0].matches.map((m) => m.item.image)).toEqual(['/a1.jpg', '/a2.jpg'])
  })

  it('puts photos saved without an artist in one group of their own', () => {
    const matches = [
      { item: { savedId: 's1', artistId: null, artistName: 'Saved', image: { key: 'user/u/s1.jpg' } }, similarity: 0.3 },
      { item: { savedId: 's2', artistId: null, artistName: 'Saved', image: { key: 'user/u/s2.jpg' } }, similarity: 0.26 },
    ]
    const groups = groupByArtist(matches)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({ artistId: null })
    expect(groups[0].matches).toHaveLength(2)
  })

  it('keeps saved photos apart from an artist whose handle is "saved"', () => {
    const matches = [
      { item: { savedId: 's1', artistId: null, artistName: 'Saved', image: { key: 'user/u/s1.jpg' } }, similarity: 0.3 },
      { item: item('saved', '/saved1.jpg'), similarity: 0.28 },
    ]
    expect(groupByArtist(matches).map((g) => g.artistId)).toEqual([null, 'saved'])
  })
})
