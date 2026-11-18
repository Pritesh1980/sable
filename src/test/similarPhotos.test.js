import { describe, it, expect } from 'vitest'
import { similarPhotos, vectorLookup } from '../data/embeddings'
import { buildWallItems } from '../data/wall'
import { refIdentity } from '../data/imageRef'

const artists = [
  { id: 'a', name: 'A', handle: 'a', images: ['/a1.jpg', '/a2.jpg'] },
  { id: 'b', name: 'B', handle: 'b', images: ['/b1.jpg'] },
]
const saved = [{ id: 's1', image: { key: 'user/u/s1.jpg' }, addedAt: '2026-11-01T00:00:00Z' }]
const vectors = new Map([
  [refIdentity('/a1.jpg'), [1, 0]],
  [refIdentity('/a2.jpg'), [0.9, 0.1]],
  [refIdentity('/b1.jpg'), [0, 1]],
  [refIdentity({ key: 'user/u/s1.jpg' }), [0.95, 0.05]],
])
const getVec = vectorLookup(vectors)
const items = buildWallItems(artists, { saved })

describe('similarPhotos', () => {
  it('ranks by similarity, excludes the source photo and includes saved photos', () => {
    const out = similarPhotos([1, 0], items, getVec, { excludeImage: '/a1.jpg' })
    expect(out.map((o) => o.item.savedId || o.item.image)).toEqual(['s1', '/a2.jpg', '/b1.jpg'])
    expect(out[0].similarity).toBeGreaterThan(out[1].similarity)
  })

  it('skips photos with no vector', () => {
    const partial = vectorLookup(new Map([[refIdentity('/a2.jpg'), [1, 0]]]))
    const out = similarPhotos([1, 0], items, partial, { excludeImage: '/a1.jpg' })
    expect(out).toHaveLength(1)
  })

  it('honours the limit and returns [] without a source vector', () => {
    expect(similarPhotos([1, 0], items, getVec, { limit: 2 })).toHaveLength(2)
    expect(similarPhotos(null, items, getVec)).toEqual([])
  })

  it('lists a photo once even if it appears twice', () => {
    const dup = [...items, items[1]]
    const out = similarPhotos([1, 0], dup, getVec, { excludeImage: '/a1.jpg' })
    expect(out.filter((o) => o.item.image === '/a2.jpg')).toHaveLength(1)
  })
})
