import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createCollectionStore } from '../sync/collectionStore'
import { readPendingDeletes } from '../backend/dirty'

// The policy hooks a collection can hand the engine (#112). Artists are the
// one user today; each hook is pinned here against a throwaway collection so a
// regression points at the engine, not at artist data.

const KEY = 'tattoo_ideas' // list collection `ideas`
const USER = { id: 'local-owner@example.com', email: 'owner@example.com' }
const OLD = '2020-01-01T00:00:00.000Z'
const LATER = '2020-02-01T00:00:00.000Z'

function fakeBackend(seed = {}) {
  const tables = new Map(Object.entries(seed))
  const rows = (c) => tables.get(c) || []
  const calls = []
  const store = {
    list: vi.fn(async (c) => {
      calls.push('list')
      return rows(c).map((r) => ({ ...r }))
    }),
    upsert: vi.fn(async (c, next) => {
      calls.push('upsert')
      const byId = new Map(rows(c).map((r) => [r.id, r]))
      for (const r of next) byId.set(r.id, { ...r })
      tables.set(c, [...byId.values()])
    }),
    remove: vi.fn(async (c, ids) => {
      tables.set(c, rows(c).filter((r) => !ids.includes(r.id)))
    }),
  }
  return { store, rows, calls }
}

const cache = (value) => localStorage.setItem(KEY, JSON.stringify(value))
const cached = () => JSON.parse(localStorage.getItem(KEY))

const stores = []
function makeStore(config) {
  const s = createCollectionStore({ key: KEY, defaultValue: [], ...config })
  stores.push(s)
  return s
}

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => {
  stores.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('policy.initial', () => {
  it('shapes the first paint from the raw cache, with the creating user', () => {
    cache([{ id: 'a', updatedAt: OLD }])
    const initial = vi.fn((raw, ctx) => [...raw, { id: 'seed', owner: ctx.owner }])
    const store = makeStore({
      policy: { initial },
      initialUser: USER,
      backend: fakeBackend(),
    })
    expect(store.getSnapshot().map((r) => r.id)).toEqual(['a', 'seed'])
    expect(initial.mock.calls[0][1].owner).toBe(true)
  })

  it('gets null when nothing is cached, and writes nothing at creation', () => {
    const setItem = vi.spyOn(localStorage, 'setItem')
    const initial = vi.fn(() => [{ id: 'default' }])
    const store = makeStore({ policy: { initial }, backend: fakeBackend() })
    expect(initial.mock.calls[0][0]).toBeNull()
    expect(store.getSnapshot()).toEqual([{ id: 'default' }])
    expect(setItem).not.toHaveBeenCalled()
  })
})

describe('policy.onMount', () => {
  it('runs once, before hydration, signed in or not, and across restarts', async () => {
    const order = []
    const onMount = vi.fn(async () => { order.push('mount') })
    const store = makeStore({
      policy: { onMount },
      codec: {
        toCanonical: (v) => v,
        toDisplay: async (v) => { order.push('display'); return v },
        ensureUploaded: async () => 0,
      },
      backend: fakeBackend(),
    })
    await store.start(null)
    store.stop()
    await store.start(USER)
    expect(onMount).toHaveBeenCalledTimes(1)
    expect(order[0]).toBe('mount')
    expect(order[1]).toBe('display')
  })

  it('a failing onMount is logged and does not stop hydration', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const toDisplay = vi.fn(async (v) => v)
    const store = makeStore({
      policy: { onMount: async () => { throw new Error('boom') } },
      codec: { toCanonical: (v) => v, toDisplay, ensureUploaded: async () => 0 },
      backend: fakeBackend(),
    })
    await store.start(null)
    expect(toDisplay).toHaveBeenCalled()
  })
})

describe('policy.beforeFirstPull and policy.merge', () => {
  it('beforeFirstPull runs before the list, and its result reaches merge', async () => {
    const be = fakeBackend({ ideas: [{ id: 'r', updatedAt: OLD }] })
    const beforeFirstPull = vi.fn(async () => {
      be.calls.push('before')
      return { tag: 'prep' }
    })
    const merge = vi.fn(({ remote, prep }) => ({
      value: [...remote, { id: 'prep', tag: prep.tag, updatedAt: LATER }],
    }))
    const store = makeStore({ policy: { beforeFirstPull, merge }, backend: be })
    await store.start(USER)
    expect(be.calls.slice(0, 2)).toEqual(['before', 'list'])
    expect(merge.mock.calls[0][0].ctx.user).toBe(USER)
    expect(store.getSnapshot().map((r) => r.id)).toEqual(['r', 'prep'])
  })

  it('merge gets the local value, and the remote rows minus pending deletes', async () => {
    cache([{ id: 'a', updatedAt: LATER }])
    const be = fakeBackend({
      ideas: [{ id: 'a', updatedAt: OLD }, { id: 'gone', updatedAt: OLD }],
    })
    localStorage.setItem('tattoo_pending_delete_' + KEY, JSON.stringify(['gone']))
    const merge = vi.fn(({ local, remote }) => ({ value: local, seen: remote }))
    const store = makeStore({ policy: { merge }, backend: be })
    await store.start(USER)
    const args = merge.mock.calls[0][0]
    expect(args.local.map((r) => r.id)).toEqual(['a'])
    expect(args.remote.map((r) => r.id)).toEqual(['a'])
  })

  it('merge replaces the generic reconcile and stamping (the policy owns both)', async () => {
    const be = fakeBackend({ ideas: [{ id: 'r', updatedAt: LATER }] })
    const store = makeStore({
      policy: { merge: () => ({ value: [{ id: 'x' }] }) },
      backend: be,
    })
    await store.start(USER)
    expect(store.getSnapshot()).toEqual([{ id: 'x' }])
    expect(cached()).toEqual([{ id: 'x' }])
  })

  it('a seed push is upserted before the value is published, and becomes the baseline', async () => {
    const be = fakeBackend()
    let publishedAtUpsert = null
    const store = makeStore({
      policy: {
        merge: () => ({ value: [{ id: 's', updatedAt: LATER, editGen: 'g' }], push: [{ id: 's', updatedAt: LATER, editGen: 'g' }] }),
      },
      backend: be,
    })
    be.store.upsert.mockImplementationOnce(async () => {
      publishedAtUpsert = store.getSnapshot()
    })
    await store.start(USER)
    expect(publishedAtUpsert).toEqual([])
    expect(be.store.upsert).toHaveBeenCalledTimes(1)
    // editGen never reaches the remote
    expect(be.store.upsert.mock.calls[0][1]).toEqual([{ id: 's', updatedAt: LATER }])
    // The baseline: deleting the seeded row later removes it remotely.
    store.set([])
    await store.flush()
    expect(be.store.remove).toHaveBeenCalledWith('ideas', ['s'])
  })

  it('pushDisplay builds a second push from the published display value', async () => {
    const be = fakeBackend({ ideas: [{ id: 'r', updatedAt: OLD }] })
    const pushDisplay = vi.fn((display) => display.map((r) => ({ ...r, updatedAt: LATER })))
    const store = makeStore({
      policy: { merge: ({ remote }) => ({ value: remote, pushDisplay }) },
      backend: be,
    })
    await store.start(USER)
    expect(pushDisplay).toHaveBeenCalledTimes(1)
    expect(be.rows('ideas')).toEqual([{ id: 'r', updatedAt: LATER }])
  })

  it('a stopped start publishes and pushes nothing from merge', async () => {
    const be = fakeBackend()
    let release
    const parked = new Promise((r) => { release = r })
    const store = makeStore({
      policy: {
        beforeFirstPull: async () => { await parked },
        merge: () => ({ value: [{ id: 's', updatedAt: LATER }], push: [{ id: 's', updatedAt: LATER }] }),
      },
      backend: be,
    })
    const started = store.start(USER)
    await Promise.resolve()
    store.stop()
    release()
    await started
    expect(be.store.upsert).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toEqual([])
  })
})

describe('policy.onEdit', () => {
  it('runs on the stamped rows before anything is made durable, with the previous value', () => {
    cache([{ id: 'a', n: 1, updatedAt: OLD }])
    const onEdit = vi.fn((prev, next) => next.map((r) => ({ ...r, touched: true })))
    const store = makeStore({ policy: { onEdit }, backend: fakeBackend() })
    store.set((prev) => prev.map((r) => ({ ...r, n: 2 })))
    expect(onEdit).toHaveBeenCalledTimes(1)
    const [prev, next, at] = onEdit.mock.calls[0]
    expect(prev[0].n).toBe(1)
    expect(next[0].updatedAt).not.toBe(OLD) // already stamped
    expect(typeof at).toBe('string')
    expect(cached()[0].touched).toBe(true)
    expect(store.getSnapshot()[0].touched).toBe(true)
  })

  it('still records deletes the edit made', () => {
    cache([{ id: 'a', updatedAt: OLD }, { id: 'b', updatedAt: OLD }])
    const store = makeStore({ policy: { onEdit: (p, n) => n }, backend: fakeBackend() })
    store.set((prev) => prev.filter((r) => r.id !== 'a'))
    expect(readPendingDeletes(KEY)).toEqual(['a'])
  })

  it('applies once per edit, not once per replay of an updater', () => {
    const onEdit = vi.fn((p, n) => n)
    const store = makeStore({ policy: { onEdit }, backend: fakeBackend() })
    store.set([{ id: 'a' }])
    store.set([{ id: 'a' }, { id: 'b' }])
    expect(onEdit).toHaveBeenCalledTimes(2)
  })
})

describe('the policy context', () => {
  it('passes the start user and the owner flag to the codec', async () => {
    const toDisplay = vi.fn(async (v) => v)
    const store = makeStore({
      codec: { toCanonical: (v) => v, toDisplay, ensureUploaded: async () => 0 },
      backend: fakeBackend(),
    })
    await store.start(USER)
    expect(toDisplay.mock.calls[0][1]).toMatchObject({ user: USER })
    expect(typeof toDisplay.mock.calls[0][1].owner).toBe('boolean')
  })
})
