import { describe, it, expect, vi } from 'vitest'
import {
  collectPhotoUses,
  fingerprintPhotos,
  findDuplicateGroups,
  scanSummary,
  removalCheck,
  removeCopy,
  restoreCopy,
} from '../data/duplicatePhotos'

// #210: byte-identical photos under different keys, found on-device, and only
// ever consolidated inside one record, on request, with an undo.

const A = 'user/u1/artists/zoia/a.jpg'
const B = 'user/u1/artists/zoia/b.jpg'
const C = 'user/u1/ideas/moth/c.jpg'
const D = 'user/u1/ideas/moth/d.jpg'

const bytes = {
  [A]: 'skull-bytes',
  [B]: 'skull-bytes',
  [C]: 'skull-bytes',
  [D]: 'moth-bytes',
}
const reader = (table = bytes) => vi.fn(async (ref) => {
  const key = typeof ref === 'string' ? ref : ref.key
  return key in table ? new Blob([table[key]], { type: 'image/jpeg' }) : null
})

const library = (overrides = {}) => ({
  artists: [
    { id: 'zoia', name: 'Zoia', handle: 'zoia.ink', images: [{ key: A }, '/images/artists/zoia/1.jpg', { key: B }] },
    { id: 'kerem', handle: 'keremtattz', images: [] },
  ],
  ideas: [{ id: 'moth', title: 'Moth sleeve', images: [{ key: C, note: 'this shading' }, { key: D }] }],
  concepts: [],
  saved: [],
  ...overrides,
})

async function scan(lib = library(), read = reader()) {
  const uses = collectPhotoUses(lib)
  const prints = await fingerprintPhotos(uses.map((u) => u.ref), { readBlob: read })
  return { uses, prints, groups: findDuplicateGroups(uses, prints) }
}

describe('collectPhotoUses', () => {
  it('lists every photo slot with where it is used', () => {
    const uses = collectPhotoUses(library({
      concepts: [{ id: 'c1', title: 'Raven', imageUrl: 'user/u1/concepts/c1/x.png', variants: [{ id: 'v1', imageUrl: 'user/u1/concepts/c1/v.png' }] }],
      saved: [{ id: 's1', image: { key: 'user/u1/saved/s1/y.jpg' }, note: 'from a story' }],
    }))
    expect(uses.map((u) => [u.kind, u.recordId, u.label, u.position, u.of])).toEqual([
      ['artist', 'zoia', 'Zoia', 1, 3],
      ['artist', 'zoia', 'Zoia', 2, 3],
      ['artist', 'zoia', 'Zoia', 3, 3],
      ['idea', 'moth', 'Moth sleeve', 1, 2],
      ['idea', 'moth', 'Moth sleeve', 2, 2],
      ['concept', 'c1', 'Raven', 1, 1],
      ['variant', 'c1', 'Raven', 1, 1],
      ['saved', 's1', 'Saved photo', 1, 1],
    ])
    expect(uses[3].note).toBe('this shading')
    expect(uses[0].id).toBe(`key:${A}`)
  })

  it('names an artist by handle when there is no name, and an untitled idea plainly', () => {
    const uses = collectPhotoUses({
      artists: [{ id: 'k', handle: 'keremtattz', images: [{ key: A }] }],
      ideas: [{ id: 'i', title: '  ', images: [{ key: C }] }],
    })
    expect(uses.map((u) => u.label)).toEqual(['@keremtattz', 'Untitled idea'])
  })
})

describe('fingerprintPhotos', () => {
  it('matches identical bytes across distinct keys and keeps differing bytes apart', async () => {
    const { groups } = await scan()
    expect(groups).toHaveLength(1)
    expect(groups[0].copies.map((c) => c.id)).toEqual([`key:${A}`, `key:${B}`, `key:${C}`])
  })

  it('reads each photo once, even when it is used in several places', async () => {
    const read = reader()
    const lib = library({ saved: [{ id: 's1', image: { key: A } }] })
    await scan(lib, read)
    expect(read.mock.calls.filter(([ref]) => (ref.key || ref) === A)).toHaveLength(1)
  })

  it('does not call one photo used twice a duplicate', async () => {
    const lib = library({
      artists: [{ id: 'zoia', name: 'Zoia', images: [{ key: A }] }],
      ideas: [{ id: 'moth', title: 'Moth', images: [{ key: A, note: 'same ref' }] }],
    })
    const { groups } = await scan(lib)
    expect(groups).toEqual([])
  })

  it('leaves unreadable photos unscanned rather than unique', async () => {
    // B, D and the static path can't be read (offline, a missing blob).
    const read = reader({ [A]: 'skull-bytes', [C]: 'skull-bytes' })
    const { prints, uses, groups } = await scan(library(), read)
    expect(prints.get(`key:${B}`)).toEqual({ skipped: 'unavailable' })
    expect(scanSummary(uses, prints)).toMatchObject({ total: 5, checked: 2, unavailable: 3, external: 0, unchecked: 0 })
    // A and C still match each other; B is simply not part of the answer.
    expect(groups[0].copies.map((c) => c.id)).toEqual([`key:${A}`, `key:${C}`])
  })

  it('treats an empty file as unreadable, not as a match for other empty files', async () => {
    const read = reader({ [A]: '', [B]: '' })
    const { groups, prints } = await scan(library({ ideas: [] }), read)
    expect(groups).toEqual([])
    expect(prints.get(`key:${A}`)).toEqual({ skipped: 'unavailable' })
  })

  it('never fetches photos hosted on other sites', async () => {
    const read = reader()
    const lib = library({ artists: [{ id: 'x', name: 'X', images: [{ url: 'https://cdn.example.com/p.jpg', addedAt: '2026-01-01' }] }], ideas: [] })
    const { prints, uses } = await scan(lib, read)
    expect(read).not.toHaveBeenCalled()
    expect(prints.get('url:https://cdn.example.com/p.jpg')).toEqual({ skipped: 'external' })
    expect(scanSummary(uses, prints)).toMatchObject({ total: 1, external: 1, checked: 0 })
  })

  it('reads same-origin static photos', async () => {
    const read = vi.fn(async () => new Blob(['static']))
    const lib = { artists: [{ id: 'z', name: 'Z', images: ['/images/artists/z/1.jpg', '/images/artists/z/1-copy.jpg'] }] }
    const { groups } = await scan(lib, read)
    expect(read).toHaveBeenCalledTimes(2)
    expect(groups).toHaveLength(1)
  })

  it('reports progress and stops when cancelled', async () => {
    const controller = new AbortController()
    const onProgress = vi.fn((done) => { if (done === 2) controller.abort() })
    const uses = collectPhotoUses(library())
    await expect(fingerprintPhotos(uses.map((u) => u.ref), { readBlob: reader(), signal: controller.signal, onProgress }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(onProgress).toHaveBeenCalledWith(1, 5)
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('survives a reader that throws', async () => {
    const read = vi.fn(async () => { throw new Error('boom') })
    const { prints } = await scan(library({ ideas: [] }), read)
    expect(prints.get(`key:${A}`)).toEqual({ skipped: 'unavailable' })
  })
})

describe('scanSummary', () => {
  it('counts photos added since the check as not yet checked', async () => {
    const { prints } = await scan()
    const later = collectPhotoUses(library({ saved: [{ id: 's9', image: { key: 'user/u1/saved/s9/new.jpg' } }] }))
    // The stub reader can't read the static path, so it stays unavailable.
    expect(scanSummary(later, prints)).toEqual({ total: 6, checked: 4, external: 0, unavailable: 1, unchecked: 1 })
  })
})

describe('removalCheck', () => {
  const findUse = (groups, kind, key) => {
    for (const group of groups) {
      for (const copy of group.copies) {
        const use = copy.uses.find((u) => u.kind === kind && refKeyOf(u.ref) === key)
        if (use) return { group, copy, use }
      }
    }
    throw new Error('no such use')
  }
  const refKeyOf = (ref) => (typeof ref === 'string' ? ref : ref.key)

  it('offers removal when the same record keeps another copy', async () => {
    const { groups } = await scan()
    const { group, copy, use } = findUse(groups, 'artist', B)
    expect(removalCheck(group, copy, use, { favourites: [] })).toEqual({ removable: true, keepId: `key:${A}` })
  })

  it('never offers removal across records: a repeat elsewhere may be intentional', async () => {
    const { groups } = await scan()
    const { group, copy, use } = findUse(groups, 'idea', C)
    expect(removalCheck(group, copy, use, { favourites: [] })).toEqual({ removable: false, reason: null })
  })

  it('never offers removal between two artists: a shared photo says nothing about who made it', async () => {
    const lib = { artists: [
      { id: 'zoia', name: 'Zoia', images: [{ key: A }] },
      { id: 'kerem', name: 'Kerem', images: [{ key: B }] },
    ] }
    const { groups } = await scan(lib)
    expect(groups).toHaveLength(1)
    expect(groups[0].sameRecord).toBe(false)
    for (const copy of groups[0].copies) {
      expect(removalCheck(groups[0], copy, copy.uses[0], { favourites: [] })).toEqual({ removable: false, reason: null })
    }
  })

  it('never offers removal inside a concept, even between two identical variants', async () => {
    const V1 = 'user/u1/concepts/c1/v1.png'
    const V2 = 'user/u1/concepts/c1/v2.png'
    const lib = { concepts: [{ id: 'c1', title: 'Raven', imageUrl: '', variants: [{ imageUrl: V1 }, { imageUrl: V2 }] }] }
    const { groups } = await scan(lib, reader({ [V1]: 'raven', [V2]: 'raven' }))
    expect(groups).toHaveLength(1)
    for (const copy of groups[0].copies) {
      expect(removalCheck(groups[0], copy, copy.uses[0], { favourites: [] })).toEqual({ removable: false, reason: null })
    }
  })

  it('keeps a favourited copy', async () => {
    const { groups } = await scan()
    const { group, copy, use } = findUse(groups, 'artist', B)
    const favourites = [{ id: 'f1', image: { key: B }, addedAt: '2026-11-01' }]
    expect(removalCheck(group, copy, use, { favourites })).toEqual({ removable: false, reason: 'favourite' })
  })

  it('keeps a copy whose note the other copy does not share', async () => {
    const E = 'user/u1/ideas/moth/e.jpg'
    const lib = library({ ideas: [{ id: 'moth', title: 'Moth', images: [{ key: C, note: 'this shading' }, { key: E, note: 'the wings' }, { key: D }] }] })
    const { groups } = await scan(lib, reader({ ...bytes, [E]: 'skull-bytes' }))
    const noted = findUse(groups, 'idea', E)
    expect(removalCheck(noted.group, noted.copy, noted.use, { favourites: [] })).toEqual({ removable: false, reason: 'note' })
  })

  it('allows removal when the notes match or the removed copy has none', async () => {
    const E = 'user/u1/ideas/moth/e.jpg'
    const lib = library({ ideas: [{ id: 'moth', title: 'Moth', images: [{ key: C, note: 'this shading' }, { key: E }, { key: D, note: 'x' }] }] })
    const { groups } = await scan(lib, reader({ ...bytes, [E]: 'skull-bytes' }))
    const bare = findUse(groups, 'idea', E)
    expect(removalCheck(bare.group, bare.copy, bare.use, { favourites: [] })).toEqual({ removable: true, keepId: `key:${C}` })
  })

  it('does not offer removal from a concept or a saved photo, whose photo is the record', async () => {
    const S = 'user/u1/saved/s1/y.jpg'
    const lib = library({ saved: [{ id: 's1', image: { key: S } }, { id: 's2', image: { key: `${S}2` } }] })
    const { groups } = await scan(lib, reader({ ...bytes, [S]: 'saved', [`${S}2`]: 'saved' }))
    const group = groups.find((g) => g.copies.some((c) => c.uses[0].kind === 'saved'))
    for (const copy of group.copies) {
      expect(removalCheck(group, copy, copy.uses[0], { favourites: [] })).toEqual({ removable: false, reason: null })
    }
  })
})

describe('removeCopy / restoreCopy', () => {
  const zoia = () => library().artists

  it('removes one copy from one record and leaves every other record as it was', () => {
    const artists = zoia()
    const result = removeCopy(artists, { recordId: 'zoia', id: `key:${B}`, keepId: `key:${A}` })
    expect(result.records[0].images).toEqual([{ key: A }, '/images/artists/zoia/1.jpg'])
    expect(result.records[1]).toBe(artists[1])
    expect(result.undo).toMatchObject({ recordId: 'zoia', index: 2, ref: { key: B } })
  })

  it('moves a Keep flag to the copy that stays', () => {
    const artists = zoia().map((a) => (a.id === 'zoia' ? { ...a, keptImages: [`key:${B}`] } : a))
    const { records, undo } = removeCopy(artists, { recordId: 'zoia', id: `key:${B}`, keepId: `key:${A}` })
    expect(records[0].keptImages).toEqual([`key:${A}`])
    const restored = restoreCopy(records, undo)
    expect(restored[0].keptImages).toEqual([`key:${B}`])
  })

  it('refuses when the record changed since the check', () => {
    const artists = zoia().map((a) => (a.id === 'zoia' ? { ...a, images: [{ key: B }] } : a))
    expect(removeCopy(artists, { recordId: 'zoia', id: `key:${B}`, keepId: `key:${A}` })).toBeNull()
    expect(removeCopy(artists, { recordId: 'gone', id: `key:${B}`, keepId: `key:${A}` })).toBeNull()
  })

  it('undo puts the copy back where it was, with its note', () => {
    const E = 'user/u1/ideas/moth/e.jpg'
    const ideas = [{ id: 'moth', title: 'Moth', images: [{ key: C, note: 'n' }, { key: E, note: 'n' }, { key: D }] }]
    const { records, undo } = removeCopy(ideas, { recordId: 'moth', id: `key:${E}`, keepId: `key:${C}` })
    expect(records[0].images).toEqual([{ key: C, note: 'n' }, { key: D }])
    expect(restoreCopy(records, undo)[0].images).toEqual(ideas[0].images)
  })

  it('undo does not add a second copy if it is already back', () => {
    const ideas = [{ id: 'moth', images: [{ key: C }, { key: D }] }]
    const undo = { recordId: 'moth', index: 0, ref: { key: C } }
    expect(restoreCopy(ideas, undo)).toBe(ideas)
  })
})
