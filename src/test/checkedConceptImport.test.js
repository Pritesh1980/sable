import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { importCheckedConceptResult } from '../data/checkedConceptImport'
import { uploadConceptResult } from '../data/conceptResultUpload'
import { createOwnerScope } from '../backend/ownerScope'
import { createLocalBlobs } from '../backend/local/localBlobs'
import { clearBlobUrls, keyForUrl } from '../data/blobUrls'

const id = '00000000-0000-4000-8000-000000000001'
const destination = { ownerId: 'A', conceptId: 'c', parentVariantId: null, draftRevision: 1 }
const job = { id, sourceImageDigest: 'a'.repeat(64), request: { version: 1, change: 'Less red', keep: 'Shape', palette: 'black' }, generation: {
  version: 1, jobId: id, provider: 'openai', model: 'gpt-image-2.5-sunburst', profileId: 'openai-refine-v1', createdAt: '2026-09-28T00:00:00.000Z', provenance: 'relay',
} }
let ownerScope
beforeEach(() => {
  ownerScope = createOwnerScope({ privateMode: true, getOwnerId: () => 'A' })
  vi.stubGlobal('crypto', webcrypto)
  clearBlobUrls()
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('propagates quota failure and never returns a receipt', async () => {
  const blobs = { upload: vi.fn().mockRejectedValue(Object.assign(new Error('Storage full'), { code: 'storage_full' })) }
  const commitConcepts = vi.fn()
  await expect(importCheckedConceptResult({ blob: new NodeBlob(['png'], { type: 'image/png' }), job, destination, ownerScope, blobs, commitConcepts })).rejects.toMatchObject({ code: 'storage_full' })
  expect(commitConcepts).not.toHaveBeenCalled()
})

it.each([['image/png', 'png'], ['image/webp', 'webp'], ['image/jpeg', 'jpg']])('preserves exact %s bytes and MIME through checked readback', async (type, extension) => {
  const bytes = new Uint8Array([137, 80, 78, 71, 0, 255, 0, 42])
  let stored
  const blobs = { upload: async (_owner, _key, blob, mime) => { stored = blob; expect(mime).toBe(type) }, getUrl: async () => 'https://local.invalid/result' }
  vi.stubGlobal('fetch', async () => new Response(await stored.arrayBuffer(), { headers: { 'Content-Type': type } }))
  const result = await uploadConceptResult(new NodeBlob([bytes], { type }), { ...destination, jobId: id, ownerScope, blobs })
  expect(result.imageKey).toBe(`user/A/concepts/c/${id}.${extension}`)
  expect(new Uint8Array(await stored.arrayBuffer())).toEqual(bytes)
  expect(keyForUrl(result.imageUrl)).toBe(result.imageKey)
})

it.each(['empty', 'different', 'unreadable', 'owner'])('rejects %s readback before registering a URL', async (mode) => {
  const blobs = { upload: async () => {}, getUrl: async () => { if (mode === 'owner') ownerScope.invalidate(); return 'https://local.invalid/result' } }
  vi.stubGlobal('fetch', async () => {
    if (mode === 'unreadable') throw new Error('offline')
    return new Response(mode === 'empty' ? '' : 'wrong')
  })
  await expect(uploadConceptResult(new NodeBlob(['png'], { type: 'image/png' }), { ...destination, jobId: id, ownerScope, blobs })).rejects.toMatchObject({ code: mode === 'owner' ? 'owner_changed' : 'invalid_result' })
  expect(keyForUrl('https://local.invalid/result')).toBeNull()
})

it.each([{ ownerId: '../A' }, { conceptId: '' }, { jobId: '../job' }, { type: 'image/gif' }])('rejects invalid upload input before writing %j', async (override) => {
  const blobs = { upload: vi.fn() }
  await expect(uploadConceptResult(new NodeBlob(['png'], { type: override.type || 'image/png' }), { ...destination, jobId: id, ownerScope, blobs, ...override })).rejects.toBeTruthy()
  expect(blobs.upload).not.toHaveBeenCalled()
})

it.each([undefined, { sourceConceptId: 'original', parentVariantId: 'parent' }])('keeps honest source lineage when explicitly recovering to another target', async (sourceLineage) => {
  const blobs = { upload: async () => {}, getUrl: async () => 'https://local.invalid/result' }
  vi.stubGlobal('fetch', async () => new Response('png'))
  let rows = [{ id: 'new-target', variants: [] }]
  const commitConcepts = async (updater, expected) => { rows = updater(rows); return { ...expected, committed: true } }
  const receipt = await importCheckedConceptResult({ blob: new NodeBlob(['png'], { type: 'image/png' }), job, destination: { ...destination, conceptId: 'new-target' }, sourceLineage, ownerScope, blobs, commitConcepts })
  expect(receipt.committed).toBe(true)
  expect(rows[0].variants[0].sourceConceptId).toBe(sourceLineage?.sourceConceptId)
  expect(rows[0].variants[0].parentVariantId).toBe(sourceLineage?.parentVariantId)
  expect(rows[0].variants[0].generation.provenance).toBe('relay')
})

it('roundtrips an alpha PNG through real local IndexedDB blob storage without transcoding', async () => {
  const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR42mMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64'))
  const blobs = createLocalBlobs({ ownerScope, allowLegacy: false })
  const result = await uploadConceptResult(new Blob([png], { type: 'image/png' }), { ...destination, jobId: id, ownerScope, blobs })
  const readback = await (await fetch(result.imageUrl)).blob()
  expect(readback.type).toBe('image/png')
  expect(new Uint8Array(await readback.arrayBuffer())).toEqual(png)
  expect(png[25]).toBe(6) // PNG colour type RGBA: alpha channel is retained.
})

it('does not return a receipt when bytes are saved but the destination record cannot be committed', async () => {
  let saved = false
  const blobs = { upload: async () => { saved = true }, getUrl: async () => 'https://local.invalid/result' }
  vi.stubGlobal('fetch', async () => new Response('png'))
  const commitConcepts = async () => { throw Object.assign(new Error('Deleted'), { code: 'commit_conflict' }) }
  await expect(importCheckedConceptResult({ blob: new NodeBlob(['png'], { type: 'image/png' }), job, destination, ownerScope, blobs, commitConcepts })).rejects.toMatchObject({ code: 'commit_conflict' })
  expect(saved).toBe(true)
})

it('rejects mismatched service job metadata instead of saving invented attribution', async () => {
  const blobs = { upload: async () => {}, getUrl: async () => 'https://local.invalid/result' }
  vi.stubGlobal('fetch', async () => new Response('png'))
  const commitConcepts = async (_updater, expected) => ({ ...expected, committed: true })
  await expect(importCheckedConceptResult({ blob: new NodeBlob(['png'], { type: 'image/png' }), job: { ...job, generation: { ...job.generation, jobId: '00000000-0000-4000-8000-000000000002' } }, destination, ownerScope, blobs, commitConcepts })).rejects.toBeTruthy()
})
