import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCollectionStore } from '../sync/collectionStore'
import { createLocalStore } from '../backend/local/localStore'
import { hasDirtyRows, readPendingDeletes } from '../backend/dirty'

const KEY = 'tattoo_ideas'
const USER = { id: 'formal-audit-owner', email: 'formal@example.invalid' }
const ROW = { id: 'a', title: 'Original idea', updatedAt: '2020-01-01T00:00:00.000Z' }
const stores = []
const gates = []

function gate() {
  let release
  let arrive
  const released = new Promise((resolve) => { release = resolve })
  const reached = new Promise((resolve) => { arrive = resolve })
  const result = { release, reached, async wait() { arrive(); await released } }
  gates.push(result)
  return result
}

function makeStore(remote) {
  const store = createCollectionStore({
    key: KEY,
    defaultValue: [],
    backend: { kind: 'local', capabilities: { offlineAuth: true }, store: remote },
  })
  stores.push(store)
  return store
}

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('tattoo_local_session', JSON.stringify({ user: USER }))
  // Freeze only debounce timers; backend promises and their ordering stay real.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
  gates.splice(0).forEach((g) => g.release())
  stores.splice(0).forEach((store) => store.stop())
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TLC counterexamples against the real collection engine and local adapter', () => {
  it('does not resurrect a confirmed deletion from an older list response (StalePull)', async () => {
    localStorage.setItem(KEY, JSON.stringify([ROW]))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    const listing = gate()
    const list = remote.list.bind(remote)
    vi.spyOn(remote, 'list').mockImplementationOnce(async (...args) => {
      const snapshot = await list(...args)
      await listing.wait()
      return snapshot
    })
    const store = makeStore(remote)

    const started = store.start(USER)
    await listing.reached
    store.set([])
    await store.flush()
    expect(await remote.list('ideas')).toEqual([])
    expect(readPendingDeletes(KEY)).toEqual([])
    listing.release()
    await started

    expect({
      memory: store.getSnapshot(),
      cache: JSON.parse(localStorage.getItem(KEY)),
    }).toEqual({ memory: [], cache: [] })
  })

  it('keeps a confirmed re-add when an earlier pull delete finishes late (DeleteRetry)', async () => {
    localStorage.setItem(KEY, '[]')
    localStorage.setItem(`tattoo_pending_delete_${KEY}`, JSON.stringify(['a']))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    const deleting = gate()
    const remove = remote.remove.bind(remote)
    vi.spyOn(remote, 'remove').mockImplementationOnce(async (...args) => {
      await deleting.wait()
      return remove(...args)
    })
    const store = makeStore(remote)

    const started = store.start(USER)
    await deleting.reached
    store.set([{ id: 'a', title: 'Re-added idea' }])
    const flushing = store.flush()
    // Drain ready work without advancing the debounce: the old implementation
    // saves now; a correctly serialized save waits for the pending remove.
    await vi.advanceTimersByTimeAsync(0)
    deleting.release()
    await Promise.all([started, flushing])

    expect(store.getSnapshot().map((row) => row.title)).toEqual(['Re-added idea'])
    expect(hasDirtyRows(KEY)).toBe(false)
    expect(readPendingDeletes(KEY)).toEqual([])
    expect((await remote.list('ideas')).map((row) => row.title)).toEqual(['Re-added idea'])
  })

  it('remembers a pre-existing tombstone while an older list response is outstanding', async () => {
    localStorage.setItem(KEY, '[]')
    localStorage.setItem(`tattoo_pending_delete_${KEY}`, JSON.stringify(['a']))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    const listing = gate()
    const list = remote.list.bind(remote)
    vi.spyOn(remote, 'list').mockImplementationOnce(async (...args) => {
      const snapshot = await list(...args)
      await listing.wait()
      return snapshot
    })
    const store = makeStore(remote)

    const started = store.start(USER)
    await listing.reached
    await store.flush()
    expect(readPendingDeletes(KEY)).toEqual([])
    listing.release()
    await started

    expect(store.getSnapshot()).toEqual([])
    expect(await remote.list('ideas')).toEqual([])
  })

  it('allows an intentional re-add to supersede a pull\'s deletion history', async () => {
    localStorage.setItem(KEY, JSON.stringify([ROW]))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    const listing = gate()
    const list = remote.list.bind(remote)
    vi.spyOn(remote, 'list').mockImplementationOnce(async (...args) => {
      const snapshot = await list(...args)
      await listing.wait()
      return snapshot
    })
    const store = makeStore(remote)

    const started = store.start(USER)
    await listing.reached
    store.set([])
    await store.flush()
    store.set([{ id: 'a', title: 'Intentional restore' }])
    await store.flush()
    listing.release()
    await started

    expect(store.getSnapshot().map((row) => row.title)).toEqual(['Intentional restore'])
    expect((await remote.list('ideas')).map((row) => row.title)).toEqual(['Intentional restore'])
  })

  it('keeps a failed retry durable so a subsequent flush can finish the deletion', async () => {
    localStorage.setItem(KEY, '[]')
    localStorage.setItem(`tattoo_pending_delete_${KEY}`, JSON.stringify(['a']))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(remote, 'remove').mockRejectedValueOnce(new Error('offline'))
    const store = makeStore(remote)

    await store.start(USER)
    expect(store.getSnapshot()).toEqual([])
    expect(readPendingDeletes(KEY)).toEqual(['a'])
    await store.flush()

    expect(await remote.list('ideas')).toEqual([])
    expect(readPendingDeletes(KEY)).toEqual([])
  })

  it('waits for a failed flush\'s sibling delete before saving a re-add', async () => {
    localStorage.setItem(KEY, JSON.stringify([ROW]))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    const store = makeStore(remote)
    await store.start(USER)
    const deleting = gate()
    const remove = remote.remove.bind(remote)
    vi.spyOn(remote, 'remove').mockImplementationOnce(async (...args) => {
      await deleting.wait()
      return remove(...args)
    })
    vi.spyOn(remote, 'upsert').mockRejectedValueOnce(new Error('upsert failed'))

    store.set([])
    const failedFlush = store.flush().catch((error) => error)
    await deleting.reached
    store.set([{ id: 'a', title: 'Restored after failure' }])
    const restored = store.flush()
    await vi.advanceTimersByTimeAsync(0)
    deleting.release()
    const [failure] = await Promise.all([failedFlush, restored])

    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toBe('upsert failed')
    expect((await remote.list('ideas')).map((row) => row.title)).toEqual(['Restored after failure'])
    expect(hasDirtyRows(KEY)).toBe(false)
    expect(readPendingDeletes(KEY)).toEqual([])
  })

  it('filters an old list response while the deletion is still pending (control)', async () => {
    localStorage.setItem(KEY, JSON.stringify([ROW]))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    const listing = gate()
    const list = remote.list.bind(remote)
    vi.spyOn(remote, 'list').mockImplementationOnce(async (...args) => {
      const snapshot = await list(...args)
      await listing.wait()
      return snapshot
    })
    const store = makeStore(remote)

    const started = store.start(USER)
    await listing.reached
    store.set([])
    listing.release()
    await started

    expect(store.getSnapshot()).toEqual([])
    expect(await remote.list('ideas')).toEqual([])
  })

  it('preserves a re-add made after the retry deletion finishes (control)', async () => {
    localStorage.setItem(KEY, '[]')
    localStorage.setItem(`tattoo_pending_delete_${KEY}`, JSON.stringify(['a']))
    const remote = createLocalStore()
    await remote.upsert('ideas', [ROW])
    const store = makeStore(remote)

    await store.start(USER)
    store.set([{ id: 'a', title: 'Re-added idea' }])
    await store.flush()

    expect((await remote.list('ideas')).map((row) => row.title)).toEqual(['Re-added idea'])
    expect(hasDirtyRows(KEY)).toBe(false)
    expect(readPendingDeletes(KEY)).toEqual([])
  })
})
