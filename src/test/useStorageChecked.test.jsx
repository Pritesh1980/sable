import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useStorage } from '../hooks/useStorage'
import { backend } from '../backend'
import { createLocalStore } from '../backend/local/localStore'
import { createOwnerScope } from '../backend/ownerScope'
import { hasDirtyRows, readRowGenerations } from '../backend/dirty'

vi.mock('../context/useAuth', () => { const auth = { user: { id: 'A' } }; return { useAuth: () => auth } })
const originalBackend = { ...backend }
const initial = { id: 'c', title: 'Original', updatedAt: '2026-01-01T00:00:00.000Z', variants: [{ id: 'old', notes: '', isBest: true }] }
const expected = { ownerId: 'A', conceptId: 'c', variantId: 'paid', imageKey: 'user/A/concepts/c/job.png' }
const add = (rows) => rows.map((r) => r.id !== 'c' || r.variants.some((v) => v.id === 'paid') ? r : { ...r, variants: [...r.variants, { id: 'paid', imageUrl: expected.imageKey, notes: '', isBest: false }] })
let scope
let owner
let lockChain
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
async function mount() {
  const hook = renderHook(() => useStorage('tattoo_concepts', []))
  await waitFor(() => expect(hook.result.current[0]).toHaveLength(1))
  return hook
}
async function commit(hook) {
  let receipt
  await act(async () => { receipt = await hook.result.current[2](add, expected) })
  return receipt
}
beforeEach(async () => {
  localStorage.clear()
  owner = 'A'
  scope = createOwnerScope({ privateMode: true, getOwnerId: () => owner })
  lockChain = Promise.resolve()
  vi.stubGlobal('navigator', { locks: { request: (_name, callback) => {
    const p = lockChain.then(callback); lockChain = p.catch(() => {}); return p
  } } })
  Object.assign(backend, { kind: 'local', capabilities: { realAuth: true, offlineAuth: false }, ownerScope: scope,
    store: createLocalStore({ ownerScope: scope, allowLegacy: false }) })
  await backend.store.upsert('concepts', [initial])
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.assign(backend, originalBackend) })

it('returns a receipt only after the canonical record contains the requested key', async () => {
  const h = await mount()
  expect(h.result.current[2].supported).toBe(true)
  expect(await commit(h)).toEqual({ ...expected, committed: true })
  expect((await backend.store.list('concepts'))[0].variants[1].imageUrl).toBe(expected.imageKey)
})

it('a stale ordinary flush preserves another tab paid variant and untouched notes/Best', async () => {
  const a = await mount(); const b = await mount()
  await commit(b)
  act(() => b.result.current[1]((rows) => rows.map((r) => ({ ...r, variants: r.variants.map((v) => ({ ...v, notes: v.id === 'paid' ? 'saved notes' : v.notes, isBest: v.id === 'paid' })) }))))
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].variants.find((v) => v.id === 'paid')?.notes).toBe('saved notes'), { timeout: 2000 })
  act(() => a.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Stale tab title' }))))
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].title).toBe('Stale tab title'), { timeout: 2000 })
  const row = (await backend.store.list('concepts'))[0]
  expect(row.variants.find((v) => v.id === 'paid')).toMatchObject({ notes: 'saved notes', isBest: true })
  expect(row.variants.find((v) => v.id === 'old').isBest).toBe(false)
})

it('serializes duplicate checked imports from two tabs and retains saved annotations', async () => {
  const a = await mount(); const b = await mount()
  await act(async () => { await Promise.all([a.result.current[2](add, expected), b.result.current[2](add, expected)]) })
  expect((await backend.store.list('concepts'))[0].variants.filter((v) => v.id === 'paid')).toHaveLength(1)
  act(() => a.result.current[1]((rows) => rows.map((r) => ({ ...r, variants: r.variants.map((v) => v.id === 'paid' ? { ...v, notes: 'keep', isBest: true } : { ...v, isBest: false }) }))))
  await commit(a)
  await commit(b)
  expect((await backend.store.list('concepts'))[0].variants.find((v) => v.id === 'paid')).toMatchObject({ notes: 'keep', isBest: true })
})

it('retains edits arriving while a checked canonical write is awaiting', async () => {
  const h = await mount(); const gate = deferred(); const real = backend.store.upsertChecked.bind(backend.store)
  vi.spyOn(backend.store, 'upsertChecked').mockImplementation(async (...args) => { const rows = await real(...args); await gate.promise; return rows })
  let pending
  act(() => { pending = h.result.current[2](add, expected) })
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].variants).toHaveLength(2))
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'During await' }))))
  await act(async () => { gate.resolve(); await pending })
  expect(h.result.current[0][0].title).toBe('During await')
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].title).toBe('During await'), { timeout: 2000 })
})

it('rejects deletion during the checked await without resurrecting the destination', async () => {
  const h = await mount(); const gate = deferred(); const real = backend.store.upsertChecked.bind(backend.store)
  vi.spyOn(backend.store, 'upsertChecked').mockImplementation(async (...args) => { const rows = await real(...args); await gate.promise; return rows })
  let pending
  act(() => { pending = h.result.current[2](add, expected).catch((e) => e) })
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].variants).toHaveLength(2))
  act(() => h.result.current[1]([]))
  await act(async () => { gate.resolve(); expect(await pending).toMatchObject({ code: 'commit_conflict' }) })
  expect(h.result.current[0]).toEqual([])
})

it('fails closed on cache quota errors and never returns a receipt', async () => {
  const h = await mount()
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toBeTruthy() })
})

it('disables checked support without Web Locks but still permits ordinary edits', async () => {
  vi.stubGlobal('navigator', {})
  const h = await mount()
  expect(h.result.current[2].supported).toBe(false)
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'commit_unavailable' }) })
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Manual' }))))
  expect(h.result.current[0][0].title).toBe('Manual')
})

it('rejects missing canonical readback even if local state has the imported image', async () => {
  const h = await mount()
  vi.spyOn(backend.store, 'upsertChecked').mockResolvedValue([])
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'commit_conflict' }) })
})

it('rejects an owner epoch change during a checked write', async () => {
  const h = await mount(); const real = backend.store.upsertChecked.bind(backend.store)
  vi.spyOn(backend.store, 'upsertChecked').mockImplementation(async (...args) => { const rows = await real(...args); scope.invalidate(); return rows })
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'owner_changed' }) })
})

it('keeps variant deletion through stale flush, reload and retry; permits explicit re-add', async () => {
  const a = await mount(); await commit(a); const b = await mount()
  act(() => a.result.current[1]((rows) => rows.map((r) => ({ ...r, variants: r.variants.filter((v) => v.id !== 'paid') }))))
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].variants).toHaveLength(1), { timeout: 2000 })
  act(() => b.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Stale title' }))))
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].title).toBe('Stale title'), { timeout: 2000 })
  expect((await backend.store.list('concepts'))[0].variants).toHaveLength(1)
  a.unmount(); b.unmount()
  const c = await mount()
  await act(async () => { await expect(c.result.current[2](add, expected)).rejects.toMatchObject({ code: 'commit_conflict' }) })
  act(() => c.result.current[1](add))
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].variants).toHaveLength(2), { timeout: 2000 })
  expect(await commit(c)).toMatchObject({ committed: true })
})

it('keeps concept deletion through stale flush/reload and permits explicit re-add', async () => {
  const a = await mount(); const b = await mount()
  act(() => a.result.current[1]([]))
  await waitFor(async () => expect(await backend.store.list('concepts')).toEqual([]), { timeout: 2000 })
  act(() => b.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Stale' }))))
  await waitFor(() => expect(b.result.current[0]).toEqual([]), { timeout: 2000 })
  b.unmount(); a.unmount()
  const c = renderHook(() => useStorage('tattoo_concepts', []))
  await act(async () => { await expect(c.result.current[2](add, expected)).rejects.toMatchObject({ code: 'commit_conflict' }) })
  expect(c.result.current[0]).toEqual([])
  act(() => c.result.current[1]([initial]))
  await waitFor(async () => expect(await backend.store.list('concepts')).toHaveLength(1), { timeout: 2000 })
  expect(await commit(c)).toMatchObject({ committed: true })
})

it('rebases durable pending edits after reload without erasing a paid variant', async () => {
  const a = await mount(); const b = await mount()
  act(() => a.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Unflushed before crash' }))))
  a.unmount()
  await commit(b)
  b.unmount()
  const c = await mount()
  await waitFor(() => expect(c.result.current[0][0].title).toBe('Unflushed before crash'))
  expect(c.result.current[0][0].variants).toHaveLength(2)
  expect((await backend.store.list('concepts'))[0].variants).toHaveLength(2)
})

it('applies the updater to the latest state after waiting to acquire the lock', async () => {
  const h = await mount(); const gate = deferred()
  lockChain = gate.promise
  let pending
  act(() => { pending = h.result.current[2](add, expected) })
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Before lock' }))))
  await act(async () => { gate.resolve(); await pending })
  expect((await backend.store.list('concepts'))[0].title).toBe('Before lock')
})

it('rejects a canonical setItem failure instead of acknowledging a cache-only result', async () => {
  const h = await mount(); const real = localStorage.setItem.bind(localStorage)
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === 'tattoo_remote_A_concepts') throw new Error('quota')
    real(key, value)
  })
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'storage_failed' }) })
  expect((await backend.store.list('concepts'))[0].variants).toHaveLength(1)
})

it('fails closed when canonical readback is corrupt', async () => {
  const h = await mount(); const real = localStorage.getItem.bind(localStorage)
  let count = 0
  vi.spyOn(localStorage, 'getItem').mockImplementation((key) => {
    if (key === 'tattoo_remote_A_concepts' && ++count > 1) return 'broken'
    return real(key)
  })
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'storage_failed' }) })
})

it('keeps same-field LWW with authoritative ties and preserves independent edits', async () => {
  const a = await mount(); const b = await mount()
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-03T01:00:00.000Z'))
  act(() => a.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'First wins tie' }))))
  await commit(a)
  act(() => b.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Other same time', notes: 'Independent' }))))
  await commit(b)
  expect((await backend.store.list('concepts'))[0]).toMatchObject({ title: 'First wins tie', notes: 'Independent' })
})

it('confirms only the submitted private edit generation', async () => {
  const h = await mount()
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Edited' }))))
  expect(hasDirtyRows('tattoo_concepts')).toBe(true)
  await commit(h)
  expect(hasDirtyRows('tattoo_concepts')).toBe(false)
  expect(readRowGenerations('tattoo_concepts')).toEqual({})
})

it('fences checked work queued before an owner epoch transition', async () => {
  const h = await mount(); const gate = deferred()
  const real = backend.store.upsertChecked.bind(backend.store)
  let first = true
  vi.spyOn(backend.store, 'upsertChecked').mockImplementation(async (...args) => {
    const rows = await real(...args)
    if (first) { first = false; await gate.promise }
    return rows
  })
  let p1, p2
  act(() => {
    p1 = h.result.current[2](add, expected).catch((e) => e)
    p2 = h.result.current[2](add, expected).catch((e) => e)
  })
  await waitFor(() => expect(first).toBe(false))
  scope.invalidate()
  await act(async () => {
    gate.resolve()
    expect(await p1).toMatchObject({ code: 'owner_changed' })
    expect(await p2).toMatchObject({ code: 'owner_changed' })
  })
})

it('canonicalizes pending manual image edits after upload before writing records', async () => {
  let uploaded = false
  const codec = {
    toCanonical: (rows) => rows.map((r) => ({ ...r, imageUrl: uploaded && r.imageUrl === 'data:image/png;base64,eA==' ? 'user/A/manual.png' : r.imageUrl })),
    toDisplay: async (rows) => rows,
    ensureUploaded: async () => { uploaded = true },
  }
  const h = renderHook(() => useStorage('tattoo_concepts', [], codec))
  await waitFor(() => expect(h.result.current[0]).toHaveLength(1))
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, imageUrl: 'data:image/png;base64,eA==' }))))
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].imageUrl).toBe('user/A/manual.png'), { timeout: 2000 })
})

it('retains edits at display resolution and fails recoverably if no stable receipt is possible', async () => {
  let interfere = false
  let h
  let calls = 0
  const codec = {
    toCanonical: (rows) => rows,
    toDisplay: async (rows) => {
      if (interfere) {
        calls += 1
        h.result.current[1]((current) => current.map((r) => ({ ...r, title: `Edit ${calls}` })))
      }
      return rows
    },
    ensureUploaded: async () => {},
  }
  h = renderHook(() => useStorage('tattoo_concepts', [], codec))
  await waitFor(() => expect(h.result.current[0]).toHaveLength(1))
  interfere = true
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'commit_conflict' }) })
  interfere = false
  expect(calls).toBe(3)
  expect(h.result.current[0][0].title).toBe('Edit 3')
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].title).toBe('Edit 3'), { timeout: 2000 })
})

it('does not execute a debounced private edit after its owner epoch ends', async () => {
  const h = await mount()
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'Old session edit' }))))
  scope.invalidate()
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)) })
  expect((await backend.store.list('concepts'))[0].title).toBe('Original')
})

it('preserves a changed variant at a delayed display boundary', async () => {
  const gate = deferred(); let delay = false
  const codec = { toCanonical: (r) => r, toDisplay: async (r) => { if (delay) { delay = false; await gate.promise } return r }, ensureUploaded: async () => {} }
  const h = renderHook(() => useStorage('tattoo_concepts', [], codec))
  await waitFor(() => expect(h.result.current[0]).toHaveLength(1))
  delay = true
  let pending
  act(() => { pending = h.result.current[2](add, expected) })
  await waitFor(() => expect(delay).toBe(false))
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, variants: r.variants.map((v) => v.id === 'paid' ? { ...v, notes: 'After readback' } : v) }))))
  await act(async () => { gate.resolve(); await pending })
  expect(h.result.current[0][0].variants.find((v) => v.id === 'paid').notes).toBe('After readback')
  expect(hasDirtyRows('tattoo_concepts')).toBe(true)
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].variants.find((v) => v.id === 'paid').notes).toBe('After readback'), { timeout: 2000 })
})

it('does not let delayed initial display hydration erase a checked import', async () => {
  const gate = deferred(); let call = 0
  const codec = { toCanonical: (r) => r, toDisplay: async (r) => { if (++call === 1) await gate.promise; return r }, ensureUploaded: async () => {} }
  const h = renderHook(() => useStorage('tattoo_concepts', [], codec))
  await waitFor(() => expect(h.result.current[0]).toHaveLength(1))
  await commit(h)
  await act(async () => { gate.resolve() })
  expect(h.result.current[0][0].variants).toHaveLength(2)
})

it('uses the existing rejecting remote writer plus readback, without a second checked writer', async () => {
  backend.kind = 'supabase'
  const h = await mount()
  const wrongWriter = vi.spyOn(backend.store, 'upsertChecked')
  expect(await commit(h)).toEqual({ ...expected, committed: true })
  expect(wrongWriter).not.toHaveBeenCalled()
  expect((await backend.store.list('concepts'))[0].variants).toHaveLength(2)
})

it('rejects a remote writer failure and a remote readback missing the image', async () => {
  backend.kind = 'supabase'
  const h = await mount()
  const writer = vi.spyOn(backend.store, 'upsert').mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }))
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'unavailable' }) })
  writer.mockRestore()
  vi.spyOn(backend.store, 'list').mockResolvedValue([])
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'commit_conflict' }) })
})

it('does not write after an owner switch during remote upload preparation', async () => {
  backend.kind = 'supabase'
  let interrupt = false
  const codec = { toCanonical: (r) => r, toDisplay: async (r) => r, ensureUploaded: async () => { if (interrupt) scope.invalidate() } }
  const h = renderHook(() => useStorage('tattoo_concepts', [], codec))
  await waitFor(() => expect(h.result.current[0]).toHaveLength(1))
  interrupt = true
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'owner_changed' }) })
  expect((await backend.store.list('concepts'))[0].variants).toHaveLength(1)
})

it('rejects a stale private setter before writing edits into a different owner namespace', async () => {
  const h = await mount()
  owner = 'B'; scope.invalidate()
  expect(() => act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, title: 'A private title' }))))).toThrow(expect.objectContaining({ code: 'owner_changed' }))
  expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).some((key) => key.startsWith('tattoo_private_concept_edit_B_'))).toBe(false)
})

it('uploads and canonicalizes a pending manual image edit recovered after a reload', async () => {
  let uploaded = false
  const codec = {
    toCanonical: (rows) => rows.map((r) => ({ ...r, imageUrl: uploaded && r.imageUrl === 'data:image/png;base64,eA==' ? 'user/A/recovered.png' : r.imageUrl })),
    toDisplay: async (rows) => rows,
    ensureUploaded: async () => { uploaded = true },
  }
  const h = renderHook(() => useStorage('tattoo_concepts', [], codec))
  await waitFor(() => expect(h.result.current[0]).toHaveLength(1))
  uploaded = false
  act(() => h.result.current[1]((rows) => rows.map((r) => ({ ...r, imageUrl: 'data:image/png;base64,eA==' }))))
  h.unmount()
  const reloaded = renderHook(() => useStorage('tattoo_concepts', [], codec))
  await waitFor(async () => expect((await backend.store.list('concepts'))[0].imageUrl).toBe('user/A/recovered.png'), { timeout: 2000 })
  expect(reloaded.result.current[0][0].imageUrl).toBe('user/A/recovered.png')
})

it('does not recreate a destination deleted remotely before a checked non-local import', async () => {
  backend.kind = 'supabase'
  // No local tombstone protection: model the remote adapter's rejecting
  // upsert/list contract without claiming a cross-device transaction.
  localStorage.setItem('tattoo_remote_A_concepts', JSON.stringify([initial]))
  backend.store = createLocalStore({ ownerScope: scope, allowLegacy: true })
  const h = await mount()
  await backend.store.remove('concepts', ['c'])
  await act(async () => { await expect(h.result.current[2](add, expected)).rejects.toMatchObject({ code: 'commit_conflict' }) })
  expect(await backend.store.list('concepts')).toEqual([])
})
