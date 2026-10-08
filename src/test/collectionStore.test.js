import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createCollectionStore, PUSH_DEBOUNCE_MS } from '../sync/collectionStore'
import { stageImage } from '../data/imageStaging'
import { readOutbox } from '../data/stagedImageStore'
import { backend as appBackend } from '../backend'
import {
  readPendingDeletes,
  readRowGenerations,
  writeRowGenerations,
  hasDirtyRows,
  isDirty,
  readStamp,
  readGeneration,
  writeGeneration,
} from '../backend/dirty'

// The local-first sync engine without React (#111). Each test drives one store
// against an in-memory backend, so every rule of the protocol is pinned on its
// own: what an edit stamps and makes durable, when the remote is read and
// written, and which late async results are thrown away.

const KEY = 'tattoo_ideas' // list collection `ideas`
const SINGLETON_KEY = 'tattoo_convention_attending' // singleton `conventionOverrides`
const DEVICE_KEY = 'tattoo_convention_lineups' // device-local, never synced
const USER = { id: 'local-owner@example.com', email: 'owner@example.com' }
const OLD = '2020-01-01T00:00:00.000Z'
const LATER = '2020-02-01T00:00:00.000Z'

function fakeBackend(seed = {}) {
  const tables = new Map(Object.entries(seed))
  const rows = (collection) => tables.get(collection) || []
  const store = {
    list: vi.fn(async (collection) => rows(collection).map((r) => ({ ...r }))),
    upsert: vi.fn(async (collection, next) => {
      const byId = new Map(rows(collection).map((r) => [r.id, r]))
      for (const r of next) byId.set(r.id, { ...r })
      tables.set(collection, [...byId.values()])
    }),
    remove: vi.fn(async (collection, ids) => {
      tables.set(collection, rows(collection).filter((r) => !ids.includes(r.id)))
    }),
  }
  return { store, rows }
}

// A promise the code under test parks on until the test releases it, plus a
// signal for when it got there.
function gate() {
  let release
  let arrive
  const released = new Promise((r) => { release = r })
  const reached = new Promise((r) => { arrive = r })
  return {
    release,
    reached,
    async wait() {
      arrive()
      await released
    },
  }
}

const cache = (key, value) => localStorage.setItem(key, JSON.stringify(value))
const cached = (key) => JSON.parse(localStorage.getItem(key))
const ids = (rows) => rows.map((r) => r.id)

const stores = []
function makeStore(config) {
  const store = createCollectionStore(config)
  stores.push(store)
  return store
}

beforeEach(() => {
  localStorage.clear()
  // Only the debounce timer is faked: promises, and the clock behind every
  // updatedAt stamp, stay real.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  stores.splice(0).forEach((s) => s.stop())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('creating a store', () => {
  it('reads the offline cache and does nothing else', () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const setItem = vi.spyOn(localStorage, 'setItem')
    const be = fakeBackend()
    const toDisplay = vi.fn(async (v) => v)
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: be,
      codec: { toCanonical: (v) => v, toDisplay, ensureUploaded: async (v) => ({ value: v, moved: 0 }) },
    })
    expect(store.getSnapshot()).toEqual([{ id: 'a', title: 'cached', updatedAt: OLD }])
    expect(setItem).not.toHaveBeenCalled()
    expect(toDisplay).not.toHaveBeenCalled()
    expect(be.store.list).not.toHaveBeenCalled()
  })

  it('falls back to the default for a missing or unreadable cache', () => {
    expect(makeStore({ key: KEY, defaultValue: [], backend: fakeBackend() }).getSnapshot()).toEqual([])
    localStorage.setItem(KEY, '{not json')
    expect(makeStore({ key: KEY, defaultValue: ['d'], backend: fakeBackend() }).getSnapshot()).toEqual(['d'])
  })
})

describe('an edit', () => {
  it('stamps only the rows it changed', () => {
    cache(KEY, [
      { id: 'a', title: 'one', updatedAt: OLD },
      { id: 'b', title: 'two', updatedAt: OLD },
    ])
    const store = makeStore({ key: KEY, defaultValue: [], backend: fakeBackend() })
    const untouched = store.getSnapshot()[1]

    store.set((prev) => prev.map((r) => (r.id === 'a' ? { ...r, title: 'edited' } : r)))

    const [a, b] = store.getSnapshot()
    expect(a.updatedAt).not.toBe(OLD)
    expect(a.editGen).toBeTruthy()
    expect(b).toBe(untouched)
    expect(Object.keys(readRowGenerations(KEY))).toEqual(['a'])
  })

  it('writes the offline cache before it returns', () => {
    const store = makeStore({ key: KEY, defaultValue: [], backend: fakeBackend() })
    store.set([{ id: 'a', title: 'Dragon' }])
    expect(cached(KEY)).toMatchObject([{ id: 'a', title: 'Dragon' }])
  })

  it('caches the canonical form, through the codec', () => {
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: fakeBackend(),
      codec: {
        toCanonical: (rows) => rows.map(({ url, ...r }) => ({ ...r, key: `k:${url}` })),
        toDisplay: async (v) => v,
        ensureUploaded: async (v) => ({ value: v, moved: 0 }),
      },
    })
    store.set([{ id: 'a', url: 'blob:1' }])
    expect(cached(KEY)).toMatchObject([{ id: 'a', key: 'k:blob:1' }])
    expect(store.getSnapshot()[0].url).toBe('blob:1')
  })

  it('makes a delete durable before it returns, and drops its tracked generation', () => {
    cache(KEY, [
      { id: 'a', title: 'keep', updatedAt: OLD },
      { id: 'b', title: 'drop', updatedAt: OLD },
    ])
    writeRowGenerations(KEY, [{ id: 'b', editGen: 'g-b' }])
    const store = makeStore({ key: KEY, defaultValue: [], backend: fakeBackend() })

    store.set((prev) => prev.filter((r) => r.id !== 'b'))

    expect(readPendingDeletes(KEY)).toEqual(['b'])
    expect(readRowGenerations(KEY)).toEqual({})
  })

  it('does not rewrite an untouched row’s stale generation over another tab’s newer one', () => {
    cache(KEY, [{ id: 'y', title: 'pushed long ago', updatedAt: OLD, editGen: 'stale' }])
    writeRowGenerations(KEY, [{ id: 'y', editGen: 'g-tabB' }])
    const store = makeStore({ key: KEY, defaultValue: [], backend: fakeBackend() })

    store.set((prev) => [...prev, { id: 'x', title: 'unrelated' }])

    expect(readRowGenerations(KEY).y).toBe('g-tabB')
  })

  it('marks the singleton dirty, with its own stamp and generation, and leaves the map unstamped', () => {
    const store = makeStore({ key: SINGLETON_KEY, defaultValue: {}, backend: fakeBackend() })
    store.set({ 'conv-1': true })
    expect(store.getSnapshot()).toEqual({ 'conv-1': true })
    expect(isDirty(SINGLETON_KEY)).toBe(true)
    expect(readStamp(SINGLETON_KEY)).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(readGeneration(SINGLETON_KEY)).not.toBe('')
  })

  it('in a device-local store only persists', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: DEVICE_KEY, defaultValue: {}, backend: be })
    await store.start(USER)
    store.set({ show: { entries: [{ handle: 'x' }] } })
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2)

    expect(cached(DEVICE_KEY)).toEqual({ show: { entries: [{ handle: 'x' }] } })
    expect(be.store.list).not.toHaveBeenCalled()
    expect(be.store.upsert).not.toHaveBeenCalled()
    expect(isDirty(DEVICE_KEY)).toBe(false)
    expect(readGeneration(DEVICE_KEY)).toBe('')
  })

  it('notifies subscribers, and each updater sees the previous edit', () => {
    const store = makeStore({ key: KEY, defaultValue: [], backend: fakeBackend() })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.set((prev) => [...prev, { id: 'a' }])
    store.set((prev) => [...prev, { id: 'b' }])
    expect(ids(store.getSnapshot())).toEqual(['a', 'b'])
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    store.set([])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('without a signed-in user, never reaches the remote', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(null)
    store.set([{ id: 'a' }])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2)
    expect(be.store.list).not.toHaveBeenCalled()
    expect(be.store.upsert).not.toHaveBeenCalled()
  })

  it('signed in, schedules one debounced push for a burst of edits', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    store.set([{ id: 'a', title: '1' }])
    store.set([{ id: 'a', title: '2' }])
    store.set([{ id: 'a', title: '3' }])

    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS - 1)
    expect(be.store.upsert).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    await vi.waitFor(() => expect(be.store.upsert).toHaveBeenCalledTimes(1))
    expect(be.rows('ideas').map((r) => r.title)).toEqual(['3'])
  })
})

describe('a flush', () => {
  it('pushes rows without their editGen and confirms its own generations', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    store.set([{ id: 'a', title: 'Dragon' }])
    expect(hasDirtyRows(KEY)).toBe(true)

    await store.flush()

    expect(be.rows('ideas')).toEqual([{ id: 'a', title: 'Dragon', updatedAt: store.getSnapshot()[0].updatedAt }])
    expect(hasDirtyRows(KEY)).toBe(false)
  })

  it('confirms only the generations it carried, never another tab’s', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    // Another tab's edit to a different row: one already tracked, one landing mid-flush.
    writeRowGenerations(KEY, [{ id: 'before', editGen: 'g-before' }])
    const upsert = be.store.upsert.getMockImplementation()
    be.store.upsert.mockImplementationOnce(async (...args) => {
      writeRowGenerations(KEY, [{ id: 'during', editGen: 'g-during' }])
      return upsert(...args)
    })

    store.set([{ id: 'a', title: 'mine' }])
    await store.flush()

    expect(readRowGenerations(KEY)).toEqual({ before: 'g-before', during: 'g-during' })
  })

  it('stays dirty when the push fails, and the next flush retries it', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    be.store.upsert.mockRejectedValueOnce(new Error('offline'))
    store.set([{ id: 'a', title: 'Dragon' }])

    await expect(store.flush()).rejects.toThrow('offline')
    expect(hasDirtyRows(KEY)).toBe(true)

    await store.flush()
    expect(ids(be.rows('ideas'))).toEqual(['a'])
    expect(hasDirtyRows(KEY)).toBe(false)
  })

  it('removes a deleted row remotely and clears its pending delete once that lands', async () => {
    const be = fakeBackend({
      ideas: [
        { id: 'a', title: 'keep', updatedAt: OLD },
        { id: 'b', title: 'drop', updatedAt: OLD },
      ],
    })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    store.set((prev) => prev.filter((r) => r.id !== 'b'))

    await store.flush()

    expect(ids(be.rows('ideas'))).toEqual(['a'])
    expect(readPendingDeletes(KEY)).toEqual([])
  })

  it('is chained behind the one in flight, so a stale push can never land last', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    const upsert = be.store.upsert.getMockImplementation()
    const slow = gate()
    let inFlight = 0
    let maxInFlight = 0
    be.store.upsert.mockImplementation(async (...args) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      if (be.store.upsert.mock.calls.length === 1) await slow.wait()
      await upsert(...args)
      inFlight -= 1
    })

    store.set([{ id: 'a', title: 'first' }])
    const first = store.flush()
    await slow.reached
    store.set([{ id: 'a', title: 'second' }])
    const second = store.flush()
    await Promise.resolve()
    expect(be.store.upsert).toHaveBeenCalledTimes(1)

    slow.release()
    await Promise.all([first, second])
    expect(maxInFlight).toBe(1)
    expect(be.rows('ideas').map((r) => r.title)).toEqual(['second'])
  })

  it('re-reads the value after a slow upload and never pushes the stale snapshot (#86)', async () => {
    const be = fakeBackend()
    const upload = gate()
    let armed = false
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: be,
      codec: {
        toCanonical: (v) => v,
        toDisplay: async (v) => v,
        ensureUploaded: async (v) => {
          if (armed) {
            armed = false
            await upload.wait()
          }
          return { value: v, moved: 0 }
        },
      },
    })
    await store.start(USER)
    armed = true // park this flush's first upload, not the pull's

    store.set([{ id: 'a', title: 'v1' }])
    const flushing = store.flush()
    await upload.reached
    store.set([{ id: 'a', title: 'v2' }])
    upload.release()
    await flushing

    expect(be.store.upsert).toHaveBeenCalledTimes(1)
    expect(be.rows('ideas').map((r) => r.title)).toEqual(['v2'])
    expect(cached(KEY).map((r) => r.title)).toEqual(['v2'])
  })

  it('pushes the singleton under its own edit stamp, and stays dirty if another tab edits mid-flush', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: SINGLETON_KEY, defaultValue: {}, backend: be })
    await store.start(USER)
    store.set({ 'conv-1': true })
    const editStamp = readStamp(SINGLETON_KEY)
    // Another tab: a newer shared stamp, then an edit while this push is in flight.
    localStorage.setItem(`tattoo_stamp_${SINGLETON_KEY}`, '2099-01-01T00:00:00.000Z')
    const upsert = be.store.upsert.getMockImplementation()
    be.store.upsert.mockImplementationOnce(async (...args) => {
      writeGeneration(SINGLETON_KEY)
      return upsert(...args)
    })

    await store.flush()

    expect(be.rows('conventionOverrides')).toEqual([
      { id: 'singleton', updatedAt: editStamp, data: { 'conv-1': true } },
    ])
    expect(isDirty(SINGLETON_KEY)).toBe(true)

    // With nothing landing in between, the next flush confirms it.
    await store.flush()
    expect(isDirty(SINGLETON_KEY)).toBe(false)
  })
})

describe('a flush and the upload outbox (#115)', () => {
  it('retries a queued photo upload, with no launch and no online event', async () => {
    const PHOTO = 'data:image/jpeg;base64,cXVldWVkIHBob3Rv'
    const upload = vi.spyOn(appBackend.blobs, 'upload').mockRejectedValue(new Error('offline'))
    await stageImage(PHOTO, { userId: USER.id, scope: 'ideas', id: 'a' })
    await vi.waitFor(() => expect(upload).toHaveBeenCalled())
    await vi.waitFor(() => expect(readOutbox()).toHaveLength(1))
    upload.mockReset()
    upload.mockResolvedValue(undefined)

    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    store.set([{ id: 'a', title: 'Dragon' }])
    await store.flush()

    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(readOutbox()).toEqual([]))
  })
})

describe('the first pull', () => {
  it('reconciles by last-write-wins, caches the result, and pushes nothing when clean', async () => {
    cache(KEY, [{ id: 'a', title: 'local', updatedAt: OLD }])
    const be = fakeBackend({
      ideas: [
        { id: 'a', title: 'remote', updatedAt: LATER },
        { id: 'r', title: 'from another device', updatedAt: OLD },
      ],
    })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    await store.start(USER)

    expect(store.getSnapshot().map((r) => r.title)).toEqual(['remote', 'from another device'])
    expect(cached(KEY).map((r) => r.title)).toEqual(['remote', 'from another device'])
    expect(be.store.upsert).not.toHaveBeenCalled()
    expect(be.store.remove).not.toHaveBeenCalled()
  })

  it('pushes when an edit never reached the remote', async () => {
    cache(KEY, [{ id: 'a', title: 'edited offline', updatedAt: LATER, editGen: 'g1' }])
    writeRowGenerations(KEY, [{ id: 'a', editGen: 'g1' }])
    const be = fakeBackend({ ideas: [{ id: 'a', title: 'old', updatedAt: OLD }] })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    await store.start(USER)

    expect(be.rows('ideas')).toEqual([{ id: 'a', title: 'edited offline', updatedAt: LATER }])
    expect(hasDirtyRows(KEY)).toBe(false)
  })

  it('pushes when the codec moved inline images to blob storage', async () => {
    cache(KEY, [{ id: 'a', title: 'clean', updatedAt: OLD }])
    let moved = 1
    const be = fakeBackend({ ideas: [{ id: 'a', title: 'clean', updatedAt: OLD }] })
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: be,
      codec: { toCanonical: (v) => v, toDisplay: async (v) => v, ensureUploaded: async (v) => ({ value: v, moved: moved-- }) },
    })

    await store.start(USER)

    expect(be.store.upsert).toHaveBeenCalledTimes(1)
  })

  it('reads pending deletes after the list returns, so a delete made mid-pull holds (#86)', async () => {
    const rows = [
      { id: 'a', title: 'Dragon', updatedAt: OLD },
      { id: 'y', title: 'Moth', updatedAt: OLD },
    ]
    cache(KEY, rows)
    const be = fakeBackend({ ideas: rows })
    const listing = gate()
    const list = be.store.list.getMockImplementation()
    be.store.list.mockImplementationOnce(async (...args) => {
      const result = await list(...args)
      await listing.wait()
      return result
    })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    const started = store.start(USER)
    await listing.reached
    store.set((prev) => prev.filter((r) => r.id !== 'y'))
    listing.release()
    await started

    expect(ids(store.getSnapshot())).toEqual(['a'])
    expect(be.store.remove).toHaveBeenCalledWith('ideas', ['y'])
    expect(ids(be.rows('ideas'))).toEqual(['a'])
  })

  it('retries a delete that never landed instead of resurrecting the row', async () => {
    cache(KEY, [{ id: 'keep', title: 'keep', updatedAt: OLD }])
    localStorage.setItem(`tattoo_pending_delete_${KEY}`, JSON.stringify(['drop']))
    const be = fakeBackend({
      ideas: [
        { id: 'keep', title: 'keep', updatedAt: OLD },
        { id: 'drop', title: 'drop', updatedAt: OLD },
      ],
    })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    await store.start(USER)

    expect(ids(store.getSnapshot())).toEqual(['keep'])
    expect(ids(be.rows('ideas'))).toEqual(['keep'])
    expect(readPendingDeletes(KEY)).toEqual([])
  })

  it('drops a pending delete that a re-add superseded', async () => {
    cache(KEY, [{ id: 'a', title: 'recreated', updatedAt: LATER }])
    localStorage.setItem(`tattoo_pending_delete_${KEY}`, JSON.stringify(['a']))
    const be = fakeBackend({ ideas: [{ id: 'a', title: 'original', updatedAt: OLD }] })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    await store.start(USER)

    expect(store.getSnapshot().map((r) => r.title)).toEqual(['recreated'])
    expect(readPendingDeletes(KEY)).toEqual([])
    expect(be.store.remove).not.toHaveBeenCalled()
  })

  it('stamps rows that predate edit-time stamping, once', async () => {
    cache(KEY, [{ id: 'legacy', title: 'no stamp' }])
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    await store.start(USER)

    expect(store.getSnapshot()[0].updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect(be.store.upsert).not.toHaveBeenCalled()
  })

  it('reconciles the singleton by its stamp', async () => {
    cache(SINGLETON_KEY, { 'conv-1': true })
    localStorage.setItem(`tattoo_stamp_${SINGLETON_KEY}`, OLD)
    const be = fakeBackend({
      conventionOverrides: [{ id: 'singleton', updatedAt: LATER, data: { 'conv-2': true } }],
    })
    const store = makeStore({ key: SINGLETON_KEY, defaultValue: {}, backend: be })

    await store.start(USER)

    expect(store.getSnapshot()).toEqual({ 'conv-2': true })
    expect(be.store.upsert).not.toHaveBeenCalled()
  })
})

describe('start and stop', () => {
  it('runs exactly one live pull for a start → stop → start in one tick (StrictMode in dev)', async () => {
    cache(KEY, [{ id: 'keep', title: 'keep', updatedAt: OLD }])
    localStorage.setItem(`tattoo_pending_delete_${KEY}`, JSON.stringify(['drop']))
    const be = fakeBackend({
      ideas: [
        { id: 'keep', title: 'keep', updatedAt: OLD },
        { id: 'drop', title: 'drop', updatedAt: OLD },
      ],
    })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    const first = store.start(USER)
    store.stop()
    const second = store.start(USER)
    await Promise.all([first, second])

    expect(be.store.list).toHaveBeenCalledTimes(1)
    expect(be.store.remove).toHaveBeenCalledTimes(1)
    expect(ids(store.getSnapshot())).toEqual(['keep'])
  })

  it('discards a pull from a start that was stopped', async () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const be = fakeBackend({ ideas: [{ id: 'a', title: 'fresh', updatedAt: LATER }] })
    const stale = gate()
    be.store.list.mockImplementationOnce(async () => {
      await stale.wait()
      return [{ id: 'a', title: 'stale', updatedAt: '2099-01-01T00:00:00.000Z' }]
    })
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    const first = store.start(USER)
    await stale.reached
    store.stop()
    await store.start(USER)
    expect(store.getSnapshot()[0].title).toBe('fresh')

    stale.release()
    await first
    expect(store.getSnapshot()[0].title).toBe('fresh')
    expect(cached(KEY)[0].title).toBe('fresh')
  })

  it('does not publish a stopped pull’s rows as the synced baseline', async () => {
    const be = fakeBackend({ ideas: [{ id: 'r', title: 'remote', updatedAt: LATER }] })
    const slow = gate()
    const codec = {
      toCanonical: (v) => v,
      toDisplay: async (v) => {
        if (Array.isArray(v) && v.some((r) => r.id === 'r')) await slow.wait()
        return v
      },
      ensureUploaded: async (v) => ({ value: v, moved: 0 }),
    }
    const store = makeStore({ key: KEY, defaultValue: [], backend: be, codec })

    const first = store.start(USER)
    await slow.reached
    store.stop()
    // The next start never hears back from the remote.
    be.store.list.mockImplementationOnce(() => new Promise(() => {}))
    store.start(USER)
    store.set([{ id: 'a', title: 'mine' }])
    await store.flush()
    // A polluted baseline would read row `r` as deleted here and remove it.
    expect(be.store.remove).not.toHaveBeenCalled()

    slow.release()
    await first
  })

  it('keeps an edit made while the pull converts its rows, and still brings the remote in', async () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const be = fakeBackend({ ideas: [{ id: 'r', title: 'remote', updatedAt: LATER }] })
    const slow = gate()
    let armed = true
    const codec = {
      toCanonical: (v) => v,
      toDisplay: async (v) => {
        if (armed && Array.isArray(v) && v.some((r) => r.id === 'r')) {
          armed = false
          await slow.wait()
        }
        return v
      },
      ensureUploaded: async (v) => ({ value: v, moved: 0 }),
    }
    const store = makeStore({ key: KEY, defaultValue: [], backend: be, codec })

    const started = store.start(USER)
    await slow.reached
    store.set((rows) => [...rows, { id: 'b', title: 'edited meanwhile' }])
    slow.release()
    await started

    expect(ids(store.getSnapshot()).sort()).toEqual(['a', 'b', 'r'])
    expect(ids(cached(KEY)).sort()).toEqual(['a', 'b', 'r'])
  })

  it('discards a hydration from a start that was stopped', async () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const gates = [gate(), gate()]
    let calls = 0
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: fakeBackend(),
      codec: {
        toCanonical: (v) => v,
        toDisplay: async (v) => {
          const n = calls
          calls += 1
          await gates[n].wait()
          return v.map((r) => ({ ...r, shown: n === 0 ? 'stale' : 'fresh' }))
        },
        ensureUploaded: async (v) => ({ value: v, moved: 0 }),
      },
    })

    const first = store.start(null)
    await gates[0].reached
    store.stop()
    const second = store.start(null)
    await gates[1].reached

    gates[0].release()
    await first
    expect(store.getSnapshot()[0].shown).toBeUndefined()

    gates[1].release()
    await second
    expect(store.getSnapshot()[0].shown).toBe('fresh')
  })

  it('hydrates from the cache even while the first pull hangs offline', async () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const be = fakeBackend()
    be.store.list.mockImplementation(() => new Promise(() => {}))
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: be,
      codec: {
        toCanonical: (v) => v,
        toDisplay: async (v) => v.map((r) => ({ ...r, shown: true })),
        ensureUploaded: async (v) => ({ value: v, moved: 0 }),
      },
    })
    const changed = new Promise((r) => store.subscribe(r))

    store.start(USER)
    await changed

    expect(store.getSnapshot()[0].shown).toBe(true)
    expect(be.store.list).toHaveBeenCalledTimes(1)
  })

  it('hydrates only once across restarts', async () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const toDisplay = vi.fn(async (v) => v.map((r) => ({ ...r, shown: true })))
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: fakeBackend(),
      codec: { toCanonical: (v) => v, toDisplay, ensureUploaded: async (v) => ({ value: v, moved: 0 }) },
    })
    await store.start(null)
    store.stop()
    await store.start(null)
    expect(toDisplay).toHaveBeenCalledTimes(1)
  })

  it('never lets a late hydration undo an edit made while it resolved', async () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const hydrating = gate()
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: fakeBackend(),
      codec: {
        toCanonical: (v) => v,
        toDisplay: async (v) => {
          await hydrating.wait()
          return v.map((r) => ({ ...r, shown: true }))
        },
        ensureUploaded: async (v) => ({ value: v, moved: 0 }),
      },
    })

    const started = store.start(null)
    await hydrating.reached
    store.set((prev) => [...prev, { id: 'new', title: 'added during hydration' }])
    hydrating.release()
    await started

    expect(ids(store.getSnapshot())).toEqual(['a', 'new'])
    expect(ids(cached(KEY))).toEqual(['a', 'new'])
  })

  it('never lets a late hydration drop rows the first pull brought in', async () => {
    cache(KEY, [{ id: 'a', title: 'cached', updatedAt: OLD }])
    const be = fakeBackend({
      ideas: [
        { id: 'a', title: 'cached', updatedAt: OLD },
        { id: 'r', title: 'from another device', updatedAt: OLD },
      ],
    })
    const hydrating = gate()
    let calls = 0
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: be,
      codec: {
        toCanonical: (v) => v,
        toDisplay: async (v) => {
          calls += 1
          if (calls === 1) await hydrating.wait() // mount-time hydration; the pull's is quick
          return v
        },
        ensureUploaded: async (v) => ({ value: v, moved: 0 }),
      },
    })

    const started = store.start(USER)
    await hydrating.reached
    await vi.waitFor(() => expect(ids(store.getSnapshot())).toEqual(['a', 'r']))
    hydrating.release()
    await started

    expect(ids(store.getSnapshot())).toEqual(['a', 'r'])
    expect(ids(cached(KEY))).toEqual(['a', 'r'])
  })

  it('accepts edits before its first start — a child’s mount effect runs before its parent’s', () => {
    const store = makeStore({ key: KEY, defaultValue: [], backend: fakeBackend() })
    store.set([{ id: 'a' }])
    expect(ids(store.getSnapshot())).toEqual(['a'])
    expect(ids(cached(KEY))).toEqual(['a'])
  })

  it('arms the push for an edit made before the first start, once a user arrives', async () => {
    const be = fakeBackend()
    // The first pull never answers, so only the debounced push can reach the remote.
    be.store.list.mockImplementationOnce(() => new Promise(() => {}))
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })

    store.set([{ id: 'a', title: 'early' }])
    store.start(USER)
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS)
    expect(be.store.upsert).toHaveBeenCalledTimes(1)
    expect(ids(await be.store.list('ideas'))).toEqual(['a'])
  })

  it('applies an edit made while stopped when it restarts — StrictMode re-runs child effects first', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)

    // The dev double mount: the shell's store stops, a child's mount effect
    // writes, and only then does the shell's own effect start the store again.
    store.stop()
    store.set((prev) => [...prev, { id: 'a', title: 'from a child effect' }])
    expect(store.getSnapshot()).toEqual([])
    const restarted = store.start(USER)

    expect(ids(store.getSnapshot())).toEqual(['a'])
    expect(ids(cached(KEY))).toEqual(['a'])
    await restarted
    await store.flush()
    expect(ids(be.rows('ideas'))).toEqual(['a'])
  })

  it('drops edits once stopped, as React drops a state update after unmount', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    store.stop()

    // e.g. a slow generation finishing after sign-out: it must not write the
    // signed-out user's data into the cache the next account reads.
    store.set([{ id: 'late', title: 'after sign-out' }])
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2)

    expect(store.getSnapshot()).toEqual([])
    expect(cached(KEY)).toEqual([])
    expect(readRowGenerations(KEY)).toEqual({})
    expect(be.store.upsert).not.toHaveBeenCalled()
  })

  it('stop cancels a pending push', async () => {
    const be = fakeBackend()
    const store = makeStore({ key: KEY, defaultValue: [], backend: be })
    await store.start(USER)
    store.set([{ id: 'a' }])
    store.stop()
    await vi.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS * 2)
    expect(be.store.upsert).not.toHaveBeenCalled()
    // The edit is still durable locally, for the next start's pull to push.
    expect(hasDirtyRows(KEY)).toBe(true)
    expect(ids(cached(KEY))).toEqual(['a'])
  })

  it('lets a flush already in flight finish after stop', async () => {
    const be = fakeBackend()
    const upload = gate()
    let armed = false
    const store = makeStore({
      key: KEY,
      defaultValue: [],
      backend: be,
      codec: {
        toCanonical: (v) => v,
        toDisplay: async (v) => v,
        ensureUploaded: async (v) => {
          if (armed) {
            armed = false
            await upload.wait()
          }
          return { value: v, moved: 0 }
        },
      },
    })
    await store.start(USER)
    armed = true
    store.set([{ id: 'a', title: 'Dragon' }])
    const flushing = store.flush()
    await upload.reached

    store.stop()
    upload.release()
    await flushing

    expect(ids(be.rows('ideas'))).toEqual(['a'])
  })
})
