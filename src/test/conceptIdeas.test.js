import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { buildConceptIdeaDraft, appendConceptIdeaImage, stageConceptIdeaImage } from '../data/conceptIdeas'
import { stageImage } from '../data/imageStaging'
import { clearBlobUrls, keyForUrl, registerBlobUrl, resolveBlobKey } from '../data/blobUrls'
import { readOutbox, readStagedImage, STAGED_IMAGES_DB } from '../data/stagedImageStore'
import { backend } from '../backend'

const PHOTO = 'data:image/png;base64,Y2hvc2VuLXZhcmlhbnQ='
const concept = { id: 'c', prompt: '  A   moon\nabove a temple ', response: 'Original response', tags: ['blackwork'] }
const variant = { id: 'v', title: '3D arm preview', response: 'Chosen response', notes: 'Keep the wrist clear',
  refinement: { change: 'Larger moon', keep: 'Temple', palette: 'black' } }

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  await new Promise(resolve => {
    const request = indexedDB.deleteDatabase(STAGED_IMAGES_DB)
    request.onsuccess = request.onerror = request.onblocked = resolve
  })
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(backend.blobs, 'upload').mockRejectedValue(new Error('offline'))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('prefills a new idea from the chosen result, not the original response', () => {
  const draft = buildConceptIdeaDraft(concept, variant, { id: 'reserved', image: { key: 'user/u/ideas/reserved/photo' } })
  expect(draft).toEqual({ id: 'reserved', title: 'A moon above a temple', status: 'idea', placement: '',
    description: 'A   moon\nabove a temple\n\nChosen response\n\nKeep the wrist clear\n\nChange: Larger moon\nKeep: Temple\nPalette: black',
    tags: ['blackwork'], linkedArtists: [], images: [{ key: 'user/u/ideas/reserved/photo', note: '3D arm preview' }] })
  expect(draft.tags).not.toBe(concept.tags)
})

it('uses original notes, a short title and an editable reference note', () => {
  const draft = buildConceptIdeaDraft({ ...concept, prompt: 'x'.repeat(100) }, null,
    { id: 'i', image: { key: 'user/u/ideas/i/p' }, note: 'For my forearm' })
  expect(draft.title).toBe('x'.repeat(80))
  expect(draft.description).toContain('Original response')
  expect(draft.images[0].note).toBe('For my forearm')
  expect(buildConceptIdeaDraft({}, null, { id: 'i', image: { key: 'user/u/ideas/i/p' } }).title).toBe('AI concept')
})

it('appends to the latest idea without altering its other fields or reference metadata', () => {
  const rows = [{ id: 'i', title: 'Concurrent title', images: [{ key: 'user/u/ideas/i/a', note: 'A',
    briefCrop: { x: 1, y: 0, zoom: 2 } }, { url: '/b.jpg', note: 'B' }], tags: ['fine-line'] }]
  const next = appendConceptIdeaImage(rows, 'i', { key: 'user/u/ideas/i/c', note: 'Chosen' })
  expect(next[0]).toEqual({ ...rows[0], images: [...rows[0].images, { key: 'user/u/ideas/i/c', note: 'Chosen' }] })
  expect(rows[0].images).toHaveLength(2)
  expect(appendConceptIdeaImage(rows, 'deleted', { key: 'user/u/ideas/i/c' })).toBe(rows)
})

it('makes an independent, byte-identical idea copy that remains available offline', async () => {
  const original = await stageImage(PHOTO, { userId: 'u', scope: 'concepts', id: 'c' })
  clearBlobUrls()
  // Node fetch handles data URLs; jsdom Blob/FileReader retain the real bytes.
  const image = await stageConceptIdeaImage(original.key, { userId: 'u', ideaId: 'i', assertCurrent() {} })
  expect(image.key).toMatch(/^user\/u\/ideas\/i\/[^/]+\.jpg$/)
  expect(image.key).not.toBe(original.key)
  expect(keyForUrl(PHOTO)).toBe(original.key)
  expect(await readStagedImage(image.key)).toBe(PHOTO)
  expect(await readStagedImage(original.key)).toBe(PHOTO)
  clearBlobUrls()
  expect(await resolveBlobKey(image.key)).toBe(PHOTO)
})

it.each(['user/other/concepts/c/p', 'user/u/concepts/../p', 'user/u/ideas/i/p'])(
  'rejects a foreign or malformed source key: %s', async source => {
    await expect(stageConceptIdeaImage(source, { userId: 'u', ideaId: 'i', assertCurrent() {} })).rejects.toThrow()
  })

it('does not let a cached display URL hide a foreign key', async () => {
  registerBlobUrl('user/other/concepts/c/p', PHOTO)
  await expect(stageConceptIdeaImage(PHOTO, { userId: 'u', ideaId: 'i', assertCurrent() {} })).rejects.toThrow()
})

it('does not make an unkeyed legacy concept canonicalize to its new idea copy', async () => {
  const copy = await stageConceptIdeaImage(PHOTO, { userId: 'u', ideaId: 'i', assertCurrent() {} })
  expect(keyForUrl(PHOTO)).toBeNull()
  const original = await stageImage(PHOTO, { userId: 'u', scope: 'concepts', id: 'legacy' })
  expect(keyForUrl(PHOTO)).toBe(original.key)
  expect(await resolveBlobKey(copy.key)).toBe(PHOTO)
  expect(keyForUrl(PHOTO)).toBe(original.key)
})

it('rejects unreadable or non-image bytes without returning an inline ref', async () => {
  await expect(stageConceptIdeaImage('data:text/plain;base64,YmFk', { userId: 'u', ideaId: 'i', assertCurrent() {} })).rejects.toThrow()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { headers: { 'content-type': 'text/plain' } })))
  await expect(stageConceptIdeaImage('/bad.png', { userId: 'u', ideaId: 'i', assertCurrent() {} })).rejects.toThrow()
})

it('rechecks ownership after resolving bytes and after staging', async () => {
  let changed = false
  const assertCurrent = () => { if (changed) throw new Error('owner_changed') }
  const realFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (...args) => { const response = await realFetch(...args); changed = true; return response })
  await expect(stageConceptIdeaImage(PHOTO, { userId: 'u', ideaId: 'i', assertCurrent })).rejects.toThrow('owner_changed')
  expect(readOutbox()).toEqual([])
  vi.stubGlobal('fetch', realFetch)
  changed = false
  backend.blobs.upload.mockImplementation(async () => { changed = true; throw new Error('offline') })
  await expect(stageConceptIdeaImage(PHOTO, { userId: 'u', ideaId: 'i', assertCurrent })).rejects.toThrow('owner_changed')
})

it('cancellation during FileReader conversion cannot enqueue an old-owner upload', async () => {
  let active = true
  const pending = stageImage(new Blob(['copy'], { type: 'image/png' }), {
    userId: 'u', scope: 'ideas', id: 'i',
    assertCurrent() { if (!active) throw Object.assign(new Error('cancelled'), { code: 'owner_changed' }) },
  })
  active = false
  expect(await pending).toMatchObject({ failed: true })
  expect(readOutbox()).toEqual([])
})

it('independent copies never replace the source display URL identity', async () => {
  const source = await stageImage(PHOTO, { userId: 'u', scope: 'concepts', id: 'c' })
  const copy = await stageImage(PHOTO, { userId: 'u', scope: 'ideas', id: 'i' })
  expect(copy.key).not.toBe(source.key)
  expect(keyForUrl(PHOTO)).toBe(source.key)
})
