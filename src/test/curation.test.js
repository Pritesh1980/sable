import { describe, it, expect } from 'vitest'
import {
  suggestTags,
  offStyleImages,
  SUGGESTIBLE_TAGS,
  OFF_STYLE_MIN_SIMILARITY,
} from '../data/curation'
import { refIdentity } from '../data/imageRef'

// Fixed 3-d vectors: one cluster along x, another along z.
const NEAR = [
  [1, 0.1, 0],
  [1, 0, 0.1],
  [1, 0.05, 0.05],
  [0.95, 0.1, 0.1],
]
const FAR = [0, 0, 1]
const STRAY = [0, 1, 0]

function lookup(map) {
  return (image) => map[typeof image === 'string' ? image : image?.key] || null
}

// An artist whose photos all sit at `vecs`, registered in `map`.
function artist(id, tags, vecs, map) {
  const images = vecs.map((v, i) => {
    const path = `images/artists/${id}/${i}.jpg`
    map[path] = v
    return path
  })
  return { id, handle: id, name: '', tags, images }
}

describe('suggestTags', () => {
  // Target plus five near neighbours and three far artists, all tagged.
  function library({ nearTags, farTags = ['fine-line', 'realism'], targetTags = ['dark-illustrative'] }) {
    const map = {}
    const target = artist('target', targetTags, NEAR, map)
    const near = nearTags.map((tags, i) => artist(`near${i}`, tags, NEAR.map((v) => v.map((x, k) => x + 0.01 * i * (k + 1))), map))
    const far = [0, 1, 2].map((i) => artist(`far${i}`, farTags, [FAR, FAR, FAR], map))
    return { artists: [target, ...near, ...far], target, near, getVec: lookup(map) }
  }

  it('suggests a tag that at least 3 of the 5 nearest tagged artists carry, naming them', () => {
    const { artists, target, near, getVec } = library({
      nearTags: [['realism'], ['realism'], ['realism', 'fine-line'], ['blackwork'], ['dark-fantasy']],
    })
    const out = suggestTags(target, artists, getVec)
    expect(out.map((s) => s.tag)).toEqual(['realism'])
    expect(out[0].because.map((a) => a.id)).toEqual([near[0].id, near[1].id, near[2].id])
  })

  it('needs a majority: 2 of 5 is not enough', () => {
    const { artists, target, getVec } = library({
      nearTags: [['realism'], ['realism'], ['blackwork'], ['blackwork'], ['dark-fantasy']],
    })
    expect(suggestTags(target, artists, getVec)).toEqual([])
  })

  it('never suggests a tag the artist already has', () => {
    const { artists, target, getVec } = library({
      targetTags: ['realism'],
      nearTags: [['realism'], ['realism'], ['realism'], ['realism'], ['realism']],
    })
    expect(suggestTags(target, artists, getVec)).toEqual([])
  })

  it('only suggests the tags the eval found reliable', () => {
    expect(SUGGESTIBLE_TAGS).toEqual(['fine-line', 'realism'])
    const { artists, target, getVec } = library({
      nearTags: [['blackwork', 'surrealism'], ['blackwork', 'surrealism'], ['blackwork', 'surrealism'], ['blackwork'], ['blackwork']],
    })
    expect(suggestTags(target, artists, getVec)).toEqual([])
  })

  it('suggests in the order of the tag list, both when both qualify', () => {
    const both = ['realism', 'fine-line']
    const { artists, target, getVec } = library({ nearTags: [both, both, both, both, both] })
    expect(suggestTags(target, artists, getVec).map((s) => s.tag)).toEqual(['fine-line', 'realism'])
  })

  it('ignores untagged artists as neighbours', () => {
    const { artists, target, getVec } = library({
      nearTags: [[], [], [], ['realism'], ['realism']],
      farTags: ['blackwork'],
    })
    // Neighbours with tags: near3, near4 (realism) + far0..2 (blackwork): 2 of 5.
    expect(suggestTags(target, artists, getVec)).toEqual([])
  })

  it('stays quiet without enough evidence', () => {
    const { artists, target, getVec } = library({
      nearTags: [['realism'], ['realism'], ['realism'], ['realism'], ['realism']],
    })
    // Fewer than 3 indexed photos for the artist.
    const thin = { ...target, images: target.images.slice(0, 2) }
    expect(suggestTags(thin, artists.map((a) => (a.id === 'target' ? thin : a)), getVec)).toEqual([])
    // Fewer than 5 tagged neighbours in the library.
    expect(suggestTags(target, artists.slice(0, 5), getVec)).toEqual([])
    // Nothing indexed at all.
    expect(suggestTags(target, artists, () => null)).toEqual([])
  })

  it('never changes the artist', () => {
    const { artists, target, getVec } = library({
      nearTags: [['realism'], ['realism'], ['realism'], ['realism'], ['realism']],
    })
    const before = JSON.stringify(target)
    suggestTags(target, artists, getVec)
    expect(JSON.stringify(target)).toBe(before)
  })
})

describe('offStyleImages', () => {
  function withStray() {
    const map = {}
    const a = artist('a', ['realism'], [...NEAR, STRAY], map)
    return { a, getVec: lookup(map) }
  }

  it('flags a photo far from the rest of the artist’s photos', () => {
    const { a, getVec } = withStray()
    const out = offStyleImages(a, getVec)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ image: a.images[4], index: 4 })
    expect(out[0].similarity).toBeLessThan(OFF_STYLE_MIN_SIMILARITY)
  })

  it('compares each photo with the others only, so a stray cannot hide itself', () => {
    const map = {}
    // Two strays out of six: each is still far from the centroid of the other five.
    const a = artist('a', [], [...NEAR, STRAY, [0, 0.9, 0.1]], map)
    const out = offStyleImages(a, lookup(map))
    expect(out.map((o) => o.index).sort()).toEqual([4, 5])
  })

  it('lists the furthest first', () => {
    const map = {}
    const a = artist('a', [], [...NEAR, [0.2, 1, 0], STRAY], map)
    const out = offStyleImages(a, lookup(map))
    expect(out.map((o) => o.index)).toEqual([5, 4])
    expect(out[0].similarity).toBeLessThanOrEqual(out[1].similarity)
  })

  it('needs at least 4 indexed photos', () => {
    const map = {}
    const a = artist('a', [], [NEAR[0], NEAR[1], STRAY], map)
    expect(offStyleImages(a, lookup(map))).toEqual([])
  })

  it('skips unindexed photos but keeps their positions', () => {
    const { a, getVec } = withStray()
    const images = ['images/artists/a/unindexed.jpg', ...a.images]
    const out = offStyleImages({ ...a, images }, getVec)
    expect(out.map((o) => o.index)).toEqual([5])
  })

  it('does not flag a photo the owner chose to keep', () => {
    const { a, getVec } = withStray()
    const kept = { ...a, keptImages: [refIdentity(a.images[4])] }
    expect(offStyleImages(kept, getVec)).toEqual([])
  })

  it('works for stored { key } photos', () => {
    const map = {}
    const images = [...NEAR, STRAY].map((v, i) => {
      map[`user/u1/artists/a/${i}.jpg`] = v
      return { key: `user/u1/artists/a/${i}.jpg` }
    })
    const out = offStyleImages({ id: 'a', tags: [], images }, lookup(map))
    expect(out.map((o) => o.index)).toEqual([4])
  })
})
