import { describe, it, expect, beforeEach } from 'vitest'
import { createArtistsPolicy, applyDefaults, canonicalizeArtist } from '../data/artistsPolicy'
import { DEFAULT_ARTISTS } from '../data/artists'

// The artist-specific hooks the collection engine calls (#112), pinned one at a
// time so a regression names the rule it broke: owner seeding (#25), image
// tombstones (#55) and the empty-remote seed push.

const OWNER = { id: 'o', email: 'owner@example.com' }
const OLD = '2020-01-01T00:00:00.000Z'
const LATER = '2020-02-01T00:00:00.000Z'
const ctxOwner = { user: OWNER, owner: true }
const ctxOther = { user: { id: 'x', email: 'x@y.z' }, owner: false }

let policy
beforeEach(() => {
  localStorage.clear()
  ;({ policy } = createArtistsPolicy())
})

describe('initial (#25 first-paint parity)', () => {
  it('paints DEFAULT_ARTISTS for an owner with no cache, nothing for anyone else', () => {
    expect(policy.initial(null, ctxOwner)).toHaveLength(DEFAULT_ARTISTS.length)
    expect(policy.initial(null, ctxOther)).toEqual([])
  })

  it('folds defaults into an owner’s cache but leaves a non-owner’s cache alone', () => {
    const cache = [{ id: 'mine', rank: 1 }]
    expect(policy.initial(cache, ctxOwner).length).toBe(DEFAULT_ARTISTS.length + 1)
    expect(policy.initial(cache, ctxOther).map((a) => a.id)).toEqual(['mine'])
  })

  // #116: the stored refs are the state, so every photo is in place from the
  // first paint; nothing is held aside as "pending".
  it('paints the stored refs themselves, in place', () => {
    const [a] = policy.initial([{ id: 'mine', images: ['images/a.jpg', { key: 'user/u/k.jpg' }] }], ctxOther)
    expect(a.images).toEqual(['images/a.jpg', { key: 'user/u/k.jpg' }])
    expect(a).not.toHaveProperty('unresolvedImages')
  })
})

describe('onEdit (#55 tombstones)', () => {
  const prev = [{ id: 'a', images: ['images/x.jpg', 'images/y.jpg'], updatedAt: OLD }]

  it('tombstones a removed photo', () => {
    const next = [{ ...prev[0], images: ['images/x.jpg'], updatedAt: LATER }]
    const [out] = policy.onEdit(prev, next, LATER)
    expect(out.removedImages).toEqual([{ ref: 'images/y.jpg', removedAt: LATER }])
  })

  it('clears the tombstone when the same photo is re-added', () => {
    const tombstoned = [{ ...prev[0], images: ['images/x.jpg'], removedImages: [{ ref: 'images/y.jpg', removedAt: OLD }] }]
    const next = [{ ...tombstoned[0], images: ['images/x.jpg', 'images/y.jpg'] }]
    const [out] = policy.onEdit(tombstoned, next, LATER)
    expect(out.removedImages).toEqual([])
  })

  it('returns an untouched row as the same object', () => {
    const next = [{ ...prev[0], notes: 'n' }] // images array carried over
    next[0].images = prev[0].images
    const [out] = policy.onEdit(prev, next, LATER)
    expect(out).toBe(next[0])
  })

  it('ignores rows that are new', () => {
    const next = [...prev, { id: 'b', images: ['images/z.jpg'] }]
    next[0] = prev[0]
    expect(policy.onEdit(prev, next, LATER)[1].removedImages).toBeUndefined()
  })
})

describe('merge', () => {
  const local = [{ id: 'a', notes: 'local', images: ['images/x.jpg'], updatedAt: LATER }]

  it('keeps a photo removed on either side out of the winning record (#55)', () => {
    const remote = [{
      id: 'a', notes: 'stale', images: ['images/x.jpg'], updatedAt: OLD,
      removedImages: [{ ref: 'images/x.jpg', removedAt: LATER }],
    }]
    const { value } = policy.merge({ local, remote, prep: undefined, ctx: ctxOther })
    expect(value[0].notes).toBe('local')
    expect(value[0].images).toEqual([])
  })

  it('adds DEFAULT_ARTISTS for the owner only', () => {
    const remote = [{ id: 'r', updatedAt: OLD }]
    expect(policy.merge({ local: [], remote, ctx: ctxOwner }).value.length).toBe(DEFAULT_ARTISTS.length + 1)
    expect(policy.merge({ local: [], remote, ctx: ctxOther }).value.map((a) => a.id)).toEqual(['r'])
  })

  it('stamps rows that predate edit-time stamping, once, in the value and nowhere else', () => {
    const { value } = policy.merge({ local: [{ id: 'n' }], remote: [{ id: 'r', updatedAt: OLD }], ctx: ctxOther })
    expect(value.find((a) => a.id === 'n').updatedAt).toBeTruthy()
    expect(value.find((a) => a.id === 'r').updatedAt).toBe(OLD)
  })

  describe('with an empty remote (seed push)', () => {
    it('seeds the owner’s defaults, preserving local edits, with stamps on every row', () => {
      const edited = [{ ...DEFAULT_ARTISTS[0], notes: 'mine', updatedAt: LATER, editGen: 'g' }]
      const { value, push } = policy.merge({ local: edited, remote: [], ctx: ctxOwner })
      expect(value).toHaveLength(DEFAULT_ARTISTS.length)
      expect(value.find((a) => a.id === DEFAULT_ARTISTS[0].id).notes).toBe('mine')
      expect(push).toBe(value)
      expect(value.every((a) => a.updatedAt)).toBe(true)
    })

    it('never pushes a pulled list back up when the remote has rows', () => {
      const out = policy.merge({ local: [{ id: 'm', updatedAt: OLD }], remote: [{ id: 'r', updatedAt: OLD }], ctx: ctxOwner })
      expect(out.push).toBeUndefined()
    })

    it('seeds a fresh owner with the defaults alone', () => {
      const { value, push } = policy.merge({ local: [], remote: [], ctx: ctxOwner })
      expect(value).toHaveLength(DEFAULT_ARTISTS.length)
      expect(push).toBe(value)
    })

    it('pushes a non-owner’s own data up, and nothing when they have none', () => {
      const own = [{ id: 'm', updatedAt: OLD }]
      expect(policy.merge({ local: own, remote: [], ctx: ctxOther }).push).toMatchObject(own)
      expect(policy.merge({ local: [], remote: [], ctx: ctxOther }).push).toBeFalsy()
    })
  })

  // The legacy photo sweep's second, restamping push went with the sweep (#149).
  it('never asks for a push after the value is published', () => {
    const merged = policy.merge({
      local: [{ id: 'a', images: [], updatedAt: OLD }],
      remote: [{ id: 'z', updatedAt: OLD }],
      ctx: ctxOther,
    })
    expect(merged.pushDisplay).toBeUndefined()
  })
})

describe('canonicalizeArtist (the persisted form)', () => {
  it('round-trips a row of stored refs unchanged', () => {
    const row = { id: 'a', notes: 'n', images: [{ key: 'user/u/artists/a/1.jpg', addedAt: OLD }, 'images/x.jpg'] }
    expect(canonicalizeArtist(row)).toEqual(row)
    expect(canonicalizeArtist(canonicalizeArtist(row))).toEqual(row)
  })

  it('strips an un-keyed inline data url, which is never stored', () => {
    const row = { id: 'a', images: ['data:image/png;base64,AAA', 'images/x.jpg'] }
    expect(canonicalizeArtist(row).images).toEqual(['images/x.jpg'])
  })
})

describe('applyDefaults', () => {
  it('appends missing defaults after the highest stored rank', () => {
    const out = applyDefaults([{ id: 'mine', rank: 99 }])
    expect(out[0].id).toBe('mine')
    expect(out[1].rank).toBe(100)
  })
})
