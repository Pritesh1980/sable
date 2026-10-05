import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { Blob } from 'node:buffer'
import { createHash, webcrypto } from 'node:crypto'
import { IDBFactory } from 'fake-indexeddb'
import { createOwnerScope } from '../backend/ownerScope'
import { createPendingJobs } from '../data/imageJobs/pendingJobs'
import { compileRefinementPrompt } from '../../shared/imageJobs'
import { prepareRefinementSource } from '../data/imageJobs/prepareSource'
import { importAndAcknowledge, useConceptRefinement } from '../hooks/useConceptRefinement'

vi.mock('../data/imageJobs/prepareSource', () => ({ prepareRefinementSource: vi.fn() }))
const id = '00000000-0000-4000-8000-000000000001'
const createdAt = '2027-01-15T08:00:00.000Z'
const fields = { change: 'More red / પ્રીતેશ', keep: 'Original shape', palette: 'colour' }
const request = { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
  ...fields, prompt: compileRefinementPrompt(fields) }
const job = { id, requestId: `v1.1800000000000.${id}`, state: 'accepted', createdAt,
  completedAt: null, expiresAt: null, errorCode: null, sourceImageDigest: 'b'.repeat(64), request,
  generation: { version: 1, jobId: id, provider: 'openai', model: 'resolved-model',
    profileId: 'openai-refine-v1', createdAt, provenance: 'relay' } }
const succeeded = { ...job, state: 'succeeded', completedAt: createdAt, expiresAt: '2027-01-16T08:00:00.000Z' }
const png = () => new Blob([Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR42mMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64'))], { type: 'image/png' })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
let owner, ownerScope, rows, journal, relay, blobs, commitConcepts, hook, saved, revoke

beforeEach(() => {
  owner = 'A'
  rows = [{ id: 'c', imageUrl: 'source-display', variants: [{ id: 'old', imageUrl: 'old-display', notes: 'keep', isBest: true, rating: 4 }] }]
  ownerScope = createOwnerScope({ privateMode: true, getOwnerId: () => owner })
  journal = createPendingJobs({ indexedDB: new IDBFactory(), now: () => 1_800_000_000_000 })
  vi.stubGlobal('crypto', webcrypto)
  vi.stubGlobal('navigator', { storage: { persisted: async () => true, persist: async () => true } })
  revoke = vi.fn()
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke)
  prepareRefinementSource.mockReset().mockImplementation(async source => ({ blob: source,
    digest: createHash('sha256').update(new Uint8Array(await source.arrayBuffer())).digest('hex'), previewUrl: 'blob:prepared' }))
  saved = new Map()
  blobs = { upload: vi.fn(async (_owner, key, blob) => { saved.set(key, blob) }),
    getUrl: vi.fn(async key => `data:image/png;base64,${Buffer.from(await saved.get(key).arrayBuffer()).toString('base64')}`) }
  commitConcepts = vi.fn(async (updater, expected) => {
    rows = updater(rows)
    hook?.rerender({ concepts: rows, ownerId: owner })
    return { ...expected, committed: true }
  })
  commitConcepts.supported = true
  relay = { capabilities: vi.fn().mockResolvedValue({ enabled: true, operations: ['refine'], provider: 'openai',
    profile: { id: 'openai-refine-v1', model: 'resolved-model' }, quota: { active: 0, dailyRemaining: 10 } }),
    serverNow: () => 1_800_000_000_000, list: vi.fn().mockResolvedValue([]),
    submit: vi.fn(async pending => ({ ...job, requestId: pending.requestId, request: pending.request })),
    status: vi.fn().mockResolvedValue(job), result: vi.fn().mockResolvedValue({ blob: png(), digest: 'c'.repeat(64) }),
    ack: vi.fn().mockResolvedValue(job), discard: vi.fn().mockResolvedValue({ ...job, state: 'cancelled' }) }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); hook = null })

async function mount() {
  hook = renderHook(props => useConceptRefinement({ ...props, ownerScope, commitConcepts, blobs, relay, journal }),
    { initialProps: { concepts: rows, ownerId: owner } })
  await waitFor(() => expect(hook.result.current.state.recovering).toBe(false))
  return hook
}
async function open() {
  await act(async () => { await hook.result.current.openSource({ ownerId: owner, conceptId: 'c', parentVariantId: 'old' }, png()) })
  act(() => hook.result.current.setDraft(fields))
}
async function submit() {
  let value
  await act(async () => { value = await hook.result.current.submit({ storageWarningAccepted: true }) })
  return value
}
async function addMarker({ accepted = true, conceptId = 'c' } = {}) {
  const row = { requestId: job.requestId, ownerId: owner, source: png(), sourceImageDigest: 'a'.repeat(64), request,
    destination: { ownerId: owner, conceptId, parentVariantId: 'old', draftRevision: 1 },
    createdAt: 1_800_000_000_000, jobId: null, accepted: false }
  await journal.put(row)
  if (accepted) await journal.markAccepted(owner, row.requestId, id)
  return row
}

it('does not acknowledge when checked save fails or returns an unverified receipt', async () => {
  const ack = vi.fn()
  const commit = vi.fn().mockRejectedValue(Object.assign(new Error('Full'), { code: 'storage_full' }))
  await expect(importAndAcknowledge({ commit, ack, jobId: id })).rejects.toMatchObject({ code: 'storage_full' })
  commit.mockResolvedValue({ committed: true, variantId: 'wrong' })
  await expect(importAndAcknowledge({ commit, ack, jobId: id })).rejects.toMatchObject({ code: 'commit_unverified' })
  expect(ack).not.toHaveBeenCalled()
})

it('acknowledges after the verified receipt and returns it unchanged', async () => {
  const order = []
  const receipt = { ownerId: 'A', conceptId: 'c', variantId: `relay:${id}`, imageKey: 'key', committed: true }
  expect(await importAndAcknowledge({ commit: async () => { order.push('commit'); return receipt },
    ack: async jobId => { expect(jobId).toBe(id); order.push('ack') }, jobId: id })).toBe(receipt)
  expect(order).toEqual(['commit', 'ack'])
})

it('blocks POST if the exact input cannot be journaled', async () => {
  await mount(); await open()
  vi.spyOn(journal, 'put').mockRejectedValue(Object.assign(new Error('quota'), { code: 'journal_unavailable' }))
  expect(await submit()).toBeNull()
  expect(hook.result.current.state.error.code).toBe('journal_unavailable')
  expect(relay.submit).not.toHaveBeenCalled()
})

it('journals before POST, prevents double submission and drops source bytes only on acceptance', async () => {
  await mount(); await open()
  const gate = deferred()
  relay.submit.mockImplementation(async input => {
    const durable = await journal.get('A', input.requestId)
    expect(await durable.source.arrayBuffer()).toEqual(await input.source.arrayBuffer())
    await gate.promise
    return { ...job, requestId: input.requestId, request: input.request }
  })
  let sending
  act(() => { sending = hook.result.current.submit({ storageWarningAccepted: true }) })
  await waitFor(() => expect(relay.submit).toHaveBeenCalledOnce())
  await act(async () => { expect(await hook.result.current.submit({ storageWarningAccepted: true })).toBeNull() })
  await act(async () => { gate.resolve(); await sending })
  const marker = (await journal.list('A'))[0]
  expect(marker).toMatchObject({ accepted: true, jobId: id, source: null, request })
  expect(relay.submit).toHaveBeenCalledOnce()
})

it('keeps denied-persistence composer usable but requires acknowledgement before payment', async () => {
  navigator.storage.persisted = async () => false
  navigator.storage.persist = async () => false
  await mount(); await open()
  await act(async () => { expect(await hook.result.current.submit({ storageWarningAccepted: false })).toBeNull() })
  expect(hook.result.current.state.error.code).toBe('storage_warning_required')
  expect(hook.result.current.state.source.blob.size).toBeGreaterThan(0)
  expect(hook.result.current.state.draft).toEqual(fields)
  expect(relay.submit).not.toHaveBeenCalled()
  await submit()
  expect(relay.submit).toHaveBeenCalledOnce()
})

it('blocks paid submission when checked commits are unsupported', async () => {
  commitConcepts.supported = false
  await mount(); await open(); await submit()
  expect(hook.result.current.state.error.code).toBe('commit_unavailable')
  expect(relay.submit).not.toHaveBeenCalled()
})

it('reconciles a lost response on reload without automatically resubmitting or preparing new bytes', async () => {
  const marker = await addMarker({ accepted: false })
  await mount()
  expect(relay.submit).not.toHaveBeenCalled()
  expect(prepareRefinementSource).not.toHaveBeenCalled()
  await act(async () => { await hook.result.current.retryUnaccepted({ confirmed: false }) })
  expect(relay.submit).toHaveBeenCalledOnce()
  const sent = relay.submit.mock.calls[0][0]
  expect(sent.requestId).toBe(marker.requestId)
  expect(await sent.source.arrayBuffer()).toEqual(await marker.source.arrayBuffer())
})

it('does not allocate a replacement key for expired unknown acceptance without explicit confirmation', async () => {
  await addMarker({ accepted: false })
  relay.submit.mockRejectedValueOnce(Object.assign(new Error('expired'), { code: 'request_expired' }))
  await mount()
  await act(async () => { await hook.result.current.retryUnaccepted({ confirmed: false }) })
  expect(hook.result.current.state.error.code).toBe('request_expired')
  await act(async () => { await hook.result.current.retryUnaccepted({ confirmed: false }) })
  expect(relay.submit).toHaveBeenCalledOnce()
  await act(async () => { await hook.result.current.retryUnaccepted({ confirmed: true }) })
  expect(relay.submit).toHaveBeenCalledTimes(2)
  expect(relay.submit.mock.calls[1][0].requestId).not.toBe(job.requestId)
})

it('preserves a newer draft while importing a completed captured job', async () => {
  await mount(); await open(); await submit()
  act(() => hook.result.current.setDraft({ change: 'A newer draft' }))
  relay.status.mockResolvedValue({ ...succeeded, requestId: hook.result.current.state.job.requestId })
  await act(async () => { await hook.result.current.importRecovered(id) })
  expect(hook.result.current.state.draft.change).toBe('A newer draft')
  expect(rows[0].variants).toHaveLength(2)
  expect(rows[0].variants.find(v => v.id === `relay:${id}`)).toMatchObject({ operation: 'refine', sourceConceptId: 'c', parentVariantId: 'old' })
  expect(rows[0].variants.find(v => v.id === 'old')).toMatchObject({ notes: 'keep', isBest: true, rating: 4 })
  expect(relay.ack).toHaveBeenCalledOnce()
})

it('requires an explicit destination for an orphan service job', async () => {
  relay.list.mockResolvedValue([succeeded]); relay.status.mockResolvedValue(succeeded)
  await mount()
  expect(relay.result).not.toHaveBeenCalled()
  await act(async () => { await hook.result.current.importRecovered(id) })
  expect(relay.result).not.toHaveBeenCalled()
  expect(hook.result.current.state.error.code).toBe('destination_required')
  await act(async () => { await hook.result.current.importRecovered(id, 'c') })
  expect(rows[0].variants.find(v => v.id === `relay:${id}`).sourceConceptId).toBeUndefined()
})

it('keeps original lineage when a deleted destination is explicitly replaced', async () => {
  await addMarker({ conceptId: 'deleted' })
  relay.list.mockResolvedValue([succeeded]); relay.status.mockResolvedValue(succeeded)
  await mount()
  expect(relay.result).not.toHaveBeenCalled()
  await act(async () => { await hook.result.current.importRecovered(id, 'c') })
  expect(rows[0].variants.find(v => v.id === `relay:${id}`)).toMatchObject({ sourceConceptId: 'deleted', parentVariantId: 'old' })
})

it('does not acknowledge checked quota failures and retains the accepted marker', async () => {
  await addMarker(); relay.status.mockResolvedValue(succeeded)
  commitConcepts.mockRejectedValue(Object.assign(new Error('Full'), { code: 'storage_full' }))
  await mount()
  await act(async () => { await hook.result.current.importRecovered(id) })
  expect(relay.ack).not.toHaveBeenCalled()
  expect((await journal.list('A'))[0].jobId).toBe(id)
  expect(hook.result.current.state.error.code).toBe('storage_full')
})

it('deduplicates saved results after failed acknowledgement and retains annotations', async () => {
  await addMarker(); relay.status.mockResolvedValue(succeeded)
  relay.ack.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'relay_unavailable' }))
  await mount()
  await act(async () => { await hook.result.current.importRecovered(id) })
  expect((await journal.list('A'))).toHaveLength(1)
  rows[0].variants.find(v => v.id === `relay:${id}`).notes = 'After save'
  await act(async () => { await hook.result.current.importRecovered(id) })
  expect(rows[0].variants.filter(v => v.id === `relay:${id}`)).toHaveLength(1)
  expect(rows[0].variants.find(v => v.id === `relay:${id}`).notes).toBe('After save')
  expect(await journal.list('A')).toEqual([])
})

it.each(['prepare', 'status', 'download', 'commit'])('fences logout during %s before publishing or acknowledgement', async stage => {
  const gate = deferred()
  await mount()
  let work
  if (stage === 'prepare') {
    prepareRefinementSource.mockImplementationOnce(async source => { await gate.promise; return { blob: source, digest: 'a'.repeat(64), previewUrl: 'blob:late' } })
    act(() => { work = hook.result.current.openSource({ ownerId: owner, conceptId: 'c', parentVariantId: null }, png()) })
    await waitFor(() => expect(prepareRefinementSource).toHaveBeenCalled())
  } else {
    await addMarker()
    relay.status.mockResolvedValue(succeeded)
    const target = stage === 'status' ? relay.status : stage === 'download' ? relay.result : commitConcepts
    const answer = stage === 'status' ? succeeded : stage === 'download' ? { blob: png(), digest: 'c'.repeat(64) }
      : { ownerId: 'A', conceptId: 'c', variantId: `relay:${id}`, imageKey: `user/A/concepts/c/${id}.png`, committed: true }
    target.mockImplementationOnce(async () => { await gate.promise; return answer })
    act(() => { work = hook.result.current.importRecovered(id) })
    await waitFor(() => expect(target).toHaveBeenCalled())
  }
  owner = 'B'; ownerScope.invalidate()
  act(() => hook.rerender({ ownerId: owner, concepts: [] }))
  await act(async () => { gate.resolve(); await work })
  expect(relay.ack).not.toHaveBeenCalled()
  expect(hook.result.current.state.source).toBeNull()
  expect(hook.result.current.state.comparison).toBeNull()
  if (stage === 'prepare') expect(revoke).toHaveBeenCalledWith('blob:late')
  if (stage === 'status') expect(relay.result).not.toHaveBeenCalled()
  if (stage === 'download') expect(blobs.upload).not.toHaveBeenCalled()
})

it('closing the drawer does not cancel accepted provider work', async () => {
  await mount(); await open(); await submit()
  act(() => hook.result.current.close())
  expect(hook.result.current.state.open).toBe(false)
  expect(hook.result.current.state.job.id).toBe(id)
  expect(relay.discard).not.toHaveBeenCalled()
})

it('reconciles a lost successful ack using the existing checked canonical variant without redownloading', async () => {
  await addMarker(); relay.status.mockResolvedValue(succeeded)
  relay.ack.mockRejectedValueOnce(Object.assign(new Error('lost ack'), { code: 'relay_unavailable' }))
  await mount()
  await act(async () => { await hook.result.current.importRecovered(id) })
  relay.result.mockClear()
  relay.status.mockResolvedValue({ ...succeeded, request: null })
  await act(async () => { await hook.result.current.importRecovered(id) })
  expect(relay.result).not.toHaveBeenCalled()
  expect(relay.ack).toHaveBeenCalledTimes(2)
  expect(await journal.list('A')).toEqual([])
  expect(rows[0].variants.filter(v => v.id === `relay:${id}`)).toHaveLength(1)
})

it('requires explicit new-payment confirmation after an unknown provider outcome', async () => {
  await mount(); await open()
  relay.submit.mockImplementationOnce(async pending => ({ ...job, requestId: pending.requestId, request: pending.request, state: 'outcome_unknown' }))
  await submit()
  const originalKey = relay.submit.mock.calls[0][0].requestId
  await act(async () => { await hook.result.current.retryUnaccepted({ confirmed: false }) })
  expect(relay.submit).toHaveBeenCalledOnce()
  expect(hook.result.current.state.error.code).toBe('confirmation_required')
  await act(async () => { await hook.result.current.retryUnaccepted({ confirmed: true }) })
  expect(relay.submit).toHaveBeenCalledTimes(2)
  expect(relay.submit.mock.calls[1][0].requestId).not.toBe(originalKey)
  expect(prepareRefinementSource).toHaveBeenCalledOnce()
})

it('blocks POST if the draft changes while its exact input transaction is committing', async () => {
  await mount(); await open()
  const gate = deferred(), put = journal.put.bind(journal)
  vi.spyOn(journal, 'put').mockImplementationOnce(async row => { await put(row); await gate.promise })
  let work
  act(() => { work = hook.result.current.submit({ storageWarningAccepted: true }) })
  await waitFor(() => expect(journal.put).toHaveBeenCalled())
  act(() => hook.result.current.setDraft({ change: 'Edited before upload' }))
  await act(async () => { gate.resolve(); await work })
  expect(relay.submit).not.toHaveBeenCalled()
  expect(hook.result.current.state.error.code).toBe('draft_changed')
  expect(hook.result.current.state.draft.change).toBe('Edited before upload')
})

it('does not upload or acknowledge after destination deletion during a result download', async () => {
  await mount(); await addMarker(); relay.status.mockResolvedValue(succeeded)
  const gate = deferred()
  relay.result.mockImplementationOnce(async () => { await gate.promise; return { blob: png(), digest: 'c'.repeat(64) } })
  let work
  act(() => { work = hook.result.current.importRecovered(id) })
  await waitFor(() => expect(relay.result).toHaveBeenCalled())
  rows = []
  act(() => hook.rerender({ ownerId: owner, concepts: rows }))
  await act(async () => { gate.resolve(); await work })
  expect(blobs.upload).not.toHaveBeenCalled()
  expect(relay.ack).not.toHaveBeenCalled()
  expect(hook.result.current.state.error.code).toBe('destination_required')
})

it('polls with backoff, imports a known completed destination, and stops after terminal state', async () => {
  await mount(); await open()
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  await submit()
  relay.status.mockResolvedValue({ ...succeeded, requestId: hook.result.current.state.job.requestId })
  await act(async () => { await vi.advanceTimersByTimeAsync(1001) })
  vi.useRealTimers()
  await waitFor(() => expect(relay.ack).toHaveBeenCalledOnce())
  expect(rows[0].variants.filter(v => v.id === `relay:${id}`)).toHaveLength(1)
})

it('deduplicates concurrent recovery in two tabs against the same canonical record', async () => {
  await addMarker(); relay.status.mockResolvedValue(succeeded)
  const a = await mount(), b = await mount()
  await act(async () => { await Promise.all([a.result.current.importRecovered(id), b.result.current.importRecovered(id)]) })
  expect(rows[0].variants.filter(v => v.id === `relay:${id}`)).toHaveLength(1)
  expect(rows[0].variants.find(v => v.id === 'old')).toMatchObject({ notes: 'keep', isBest: true, rating: 4 })
  expect(relay.ack).toHaveBeenCalledTimes(2)
})

it('retains a completed child when its captured parent was removed while waiting', async () => {
  await addMarker(); await mount(); relay.status.mockResolvedValue(succeeded)
  rows = [{ ...rows[0], variants: [] }]
  act(() => hook.rerender({ ownerId: owner, concepts: rows }))
  await act(async () => { await hook.result.current.importRecovered(id) })
  expect(rows[0].variants).toHaveLength(1)
  expect(rows[0].variants[0]).toMatchObject({ id: `relay:${id}`, parentVariantId: 'old', sourceConceptId: 'c' })
  expect(hook.result.current.state.comparison.sourceUrl).toBeNull()
})

it('retains fresh unconfirmed bytes when the calibrated server clock differs from the device clock', async () => {
  const localNow = Date.now()
  journal = createPendingJobs({ indexedDB: new IDBFactory(), now: () => localNow })
  relay.serverNow = () => localNow - 2 * 86_400_000
  relay.submit.mockRejectedValue(Object.assign(new Error('lost response'), { code: 'acceptance_unknown' }))
  await mount(); await open(); await submit()
  await act(async () => { await hook.result.current.recover() })
  expect(await journal.list('A')).toHaveLength(1)
  expect(relay.submit).toHaveBeenCalledOnce()
})
