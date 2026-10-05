import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { Blob } from 'node:buffer'
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { compileRefinementPrompt } from '../../shared/imageJobs'
import { createPendingJobs } from '../data/imageJobs/pendingJobs'

const clock = 1_800_000_000_000
const jobId = '00000000-0000-4000-8000-000000000002'
let factory, journal
function record(overrides = {}) {
  const fields = { change: 'પ્રીતેશ / プリテシュ', keep: 'Ink', palette: 'colour' }
  return {
    requestId: `v1.${clock}.00000000-0000-4000-8000-000000000001`, ownerId: 'A',
    source: new Blob(['exact original bytes'], { type: 'image/png' }), sourceImageDigest: 'a'.repeat(64),
    request: { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
      ...fields, prompt: compileRefinementPrompt(fields) },
    destination: { ownerId: 'A', conceptId: 'concept', parentVariantId: null, draftRevision: 1 },
    createdAt: clock, jobId: null, accepted: false, ...overrides,
  }
}
beforeEach(() => {
  factory = new IDBFactory()
  journal = createPendingJobs({ indexedDB: factory, now: () => clock })
})
afterEach(() => vi.restoreAllMocks())

it('persists exact bytes and Unicode across instances, clearing bytes only after acceptance', async () => {
  const input = record()
  await journal.put(input)
  const reopened = createPendingJobs({ indexedDB: factory })
  const saved = await reopened.get('A', input.requestId)
  expect(await saved.source.text()).toBe('exact original bytes')
  expect(saved.request).toEqual(input.request)
  expect(saved.destination).toEqual(input.destination)
  expect(await journal.get('B', input.requestId)).toBeNull()
  await reopened.markAccepted('A', input.requestId, jobId)
  expect(await journal.get('A', input.requestId)).toEqual({ ...input, source: null, jobId, accepted: true })
})

it('scopes listing, deletion and acceptance to the supplied owner', async () => {
  const input = record()
  await journal.put(input)
  expect(await journal.list('B')).toEqual([])
  await expect(journal.markAccepted('B', input.requestId, jobId)).rejects.toMatchObject({ code: 'pending_not_found' })
  await journal.remove('B', input.requestId)
  expect(await journal.list('A')).toHaveLength(1)
  await journal.remove('A', input.requestId)
  expect(await journal.list('A')).toEqual([])
})

it('snapshots caller metadata before asynchronous persistence', async () => {
  const input = record()
  const saved = journal.put(input)
  input.request.change = 'mutated'
  input.destination.conceptId = 'different'
  await saved
  const row = await journal.get('A', input.requestId)
  expect(row.request.change).toBe('પ્રીતેશ / プリテシュ')
  expect(row.destination.conceptId).toBe('concept')
})

it('never restores source bytes by replaying a previously accepted record', async () => {
  const input = record()
  await journal.put(input)
  await journal.markAccepted('A', input.requestId, jobId)
  await journal.put(input)
  expect((await journal.get('A', input.requestId)).source).toBeNull()
  await expect(journal.markAccepted('A', input.requestId, '00000000-0000-4000-8000-000000000003'))
    .rejects.toMatchObject({ code: 'idempotency_conflict' })
})

it('rejects reuse of an ID with different input or destination metadata', async () => {
  const input = record()
  await journal.put(input)
  await expect(journal.put({ ...input, sourceImageDigest: 'b'.repeat(64) }))
    .rejects.toMatchObject({ code: 'idempotency_conflict' })
  await expect(journal.put({ ...input, destination: { ...input.destination, conceptId: 'other' } }))
    .rejects.toMatchObject({ code: 'idempotency_conflict' })
})

it('expires unconfirmed source bytes at 24h but keeps accepted recovery records', async () => {
  const input = record()
  await journal.put(input)
  const accepted = record({ requestId: `v1.${clock}.00000000-0000-4000-8000-000000000004` })
  await journal.put(accepted)
  await journal.markAccepted('A', accepted.requestId, jobId)
  let now = clock + 86_399_999
  const timed = createPendingJobs({ indexedDB: factory, now: () => now })
  await timed.expire()
  expect(await timed.list('A')).toHaveLength(2)
  now += 1
  await timed.expire()
  expect((await timed.list('A')).map(row => row.requestId)).toEqual([accepted.requestId])
})

it('purge clears all owners and fences a write waiting for its database to open', async () => {
  const input = record()
  const write = journal.put(input)
  const rejected = expect(write).rejects.toMatchObject({ code: 'owner_changed' })
  await journal.clearAll()
  await rejected
  expect(await journal.list('A')).toEqual([])
})

it('a transaction abort after a successful put is not a persistence receipt', async () => {
  const put = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (...args) {
    const req = put.apply(this, args)
    req.addEventListener('success', () => this.transaction.abort())
    return req
  })
  await expect(journal.put(record())).rejects.toMatchObject({ code: 'journal_unavailable' })
  expect(await journal.list('A')).toEqual([])
})

it('unavailable IndexedDB and failed writes block persistence', async () => {
  await expect(createPendingJobs({ indexedDB: null }).put(record()))
    .rejects.toMatchObject({ code: 'journal_unavailable' })
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new Error('quota details') })
  await expect(journal.put(record())).rejects.toMatchObject({ code: 'journal_unavailable' })
})

it.each([
  { ownerId: '' }, { sourceImageDigest: 'invalid' }, { accepted: true }, { source: null },
  { source: new Blob(['svg'], { type: 'image/svg+xml' }) },
  { destination: { ownerId: 'B', conceptId: 'other', parentVariantId: null, draftRevision: 0 } },
  { createdAt: -1 }, { previewUrl: 'blob:ephemeral' },
])('rejects malformed or ephemeral journal data %j', async overrides => {
  await expect(journal.put(record(overrides))).rejects.toMatchObject({ code: 'invalid_pending_job' })
})
