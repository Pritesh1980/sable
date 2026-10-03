import { afterEach, expect, it, vi } from 'vitest'
import { createPortableBackup, requestPortableExport } from '../data/portableBackup'
import { parseBackup } from '../data/export'
import { readBackupStatus } from '../data/backupStatus'
import { clearBlobUrls, registerBlobUrl } from '../data/blobUrls'

afterEach(() => clearBlobUrls())

it('materializes canonical local images and keeps lineage on fresh restore', async () => {
  const dataUrl = 'data:image/png;base64,aW1hZ2U='
  const backup = await createPortableBackup({ concepts: [{ id: 'c', variants: [{
    id: 'relay:job', imageUrl: 'user/A/concepts/c/job.png', parentVariantId: null,
    generation: { version: 1, provenance: 'relay', jobId: 'job' },
  }] }] }, { ownerId: 'A', blobs: { getUrl: vi.fn().mockResolvedValue(dataUrl) } })
  const restored = parseBackup(JSON.stringify(backup))
  expect(restored.concepts[0].variants[0]).toMatchObject({ imageUrl: dataUrl,
    generation: { provenance: 'relay' } })
})

it('rejects a missing canonical image rather than returning a partial backup', async () => {
  await expect(createPortableBackup({ concepts: [{ id: 'c', imageUrl: 'user/A/concepts/c/missing.png' }] },
    { ownerId: 'A', blobs: { getUrl: async () => '' } })).rejects.toThrow(/image/i)
})

it('does not surface raw storage errors from a failed image read', async () => {
  await expect(createPortableBackup({ concepts: [{ imageUrl: 'user/A/concepts/c/a.png' }] },
    { ownerId: 'A', blobs: { getUrl: async () => { throw Error('private signed token abc123') } } }))
    .rejects.toThrow('A local image could not be read for backup.')
})

it('rejects a foreign owner key', async () => {
  await expect(createPortableBackup({ concepts: [{ imageUrl: 'user/B/concepts/c/a.png' }] },
    { ownerId: 'A', blobs: { getUrl: vi.fn() } })).rejects.toThrow(/owner/i)
})

it('records external references without fetching portfolio URLs', async () => {
  const fetchImpl = vi.fn()
  const backup = await createPortableBackup({ artists: [{ id: 'a', images: ['https://example.test/work.jpg'] }] },
    { ownerId: 'A', blobs: { getUrl: vi.fn() }, fetchImpl })
  expect(backup.externalImageReferences).toContain('https://example.test/work.jpg')
  expect(fetchImpl).not.toHaveBeenCalled()
})

it('materializes artist, idea, board and unresolved concept slots with Unicode notes', async () => {
  const bytes = 'data:image/jpeg;base64,aW1hZ2U='
  const backup = await createPortableBackup({
    artists: [{ id: 'a', images: [{ key: 'user/A/artists/a/1.jpg' }], unresolvedImages: [{ ref: { key: 'user/A/artists/a/2.jpg' }, index: 1 }] }],
    ideas: [{ id: 'i', images: [{ key: 'user/A/ideas/i/1.jpg', note: '花 — keep this shade' }] }],
    boards: [{ id: 'b', cover: 'user/A/boards/b/1.jpg' }],
    concepts: [{ id: 'c', imageUrl: '', unresolvedImageKey: 'user/A/concepts/c/1.jpg' }],
  }, { ownerId: 'A', blobs: { getUrl: async () => bytes } })
  const restored = parseBackup(JSON.stringify(backup))
  expect(restored.artists[0].images).toEqual([bytes, bytes])
  expect(restored.artists[0].unresolvedImages).toBeUndefined()
  expect(restored.ideas[0].images).toEqual([{ url: bytes, note: '花 — keep this shade' }])
  expect(restored.boards[0].cover).toBe(bytes)
  expect(restored.concepts[0].imageUrl).toBe(bytes)
  expect(restored.concepts[0].unresolvedImageKey).toBeUndefined()
})

it('preserves artist photo timing metadata while replacing a canonical key', async () => {
  const bytes = 'data:image/webp;base64,aW1hZ2U='
  const backup = await createPortableBackup({ artists: [{ id: 'a', images: [{ key: 'user/A/artists/a/1.webp', addedAt: '2026-09-28T12:00:00.000Z' }] }] },
    { ownerId: 'A', blobs: { getUrl: async () => bytes } })
  expect(parseBackup(backup).artists[0].images).toEqual([{ url: bytes, addedAt: '2026-09-28T12:00:00.000Z' }])
})

it('preserves an already embedded non-base64 image data URL', async () => {
  const inline = 'data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E'
  const backup = await createPortableBackup({ concepts: [{ id: 'c', imageUrl: inline }] },
    { ownerId: 'A', blobs: { getUrl: vi.fn() } })
  expect(parseBackup(backup).concepts[0].imageUrl).toBe(inline)
})

it('does not advance request status when one image fails or download initiation throws', async () => {
  localStorage.clear()
  const data = { concepts: [{ id: 'c', variants: [{ id: 'relay:a', imageUrl: 'user/A/concepts/c/a.png', generation: { provenance: 'relay' } }] }] }
  const blobs = { getUrl: async () => '' }
  const download = vi.fn()
  await expect(requestPortableExport(data, { ownerId: 'A', blobs, download })).rejects.toThrow()
  expect(download).not.toHaveBeenCalled()
  expect(readBackupStatus('A')).toBeNull()
  blobs.getUrl = async () => 'data:image/png;base64,aW1hZ2U='
  await expect(requestPortableExport(data, { ownerId: 'A', blobs, download: () => { throw Error('blocked') } })).rejects.toThrow()
  expect(readBackupStatus('A')).toBeNull()
  await requestPortableExport(data, { ownerId: 'A', blobs, download })
  expect(readBackupStatus('A').paidVariantIds).toEqual(['relay:a'])
})

it.each([
  ['artist unresolved image', { artists: [{ id: 'a', images: [], unresolvedImages: [{ ref: { key: 'damaged-key' }, index: 0 }] }] }],
  ['idea image', { ideas: [{ id: 'i', images: [{ key: 'damaged-key', note: 'Keep this' }] }] }],
])('rejects a malformed canonical %s before download or status advancement', async (_label, data) => {
  localStorage.clear()
  const download = vi.fn()
  const blobs = { getUrl: vi.fn() }
  await expect(requestPortableExport(data, { ownerId: 'A', blobs, download })).rejects.toThrow(/canonical|key|malformed/i)
  expect(download).not.toHaveBeenCalled()
  expect(readBackupStatus('A')).toBeNull()
  expect(blobs.getUrl).not.toHaveBeenCalled()
})

it('still exports valid canonical refs and external image references together', async () => {
  localStorage.clear()
  const bytes = 'data:image/png;base64,aW1hZ2U='
  const download = vi.fn()
  const backup = await requestPortableExport({
    artists: [{ id: 'a', images: [{ key: 'user/A/artists/a/1.png' }, 'https://portfolio.example/work.png'] }],
    ideas: [{ id: 'i', images: [{ key: 'user/A/ideas/i/1.png', note: 'Shape' }] }],
  }, { ownerId: 'A', blobs: { getUrl: async () => bytes }, download })
  expect(backup.data.artists[0].images).toEqual([bytes, 'https://portfolio.example/work.png'])
  expect(backup.data.ideas[0].images).toEqual([{ url: bytes, note: 'Shape' }])
  expect(backup.externalImageReferences).toEqual(['https://portfolio.example/work.png'])
  expect(download).toHaveBeenCalledOnce()
  expect(readBackupStatus('A').requestedAt).toBeTruthy()
})

it('materializes a superseded signed display URL through its session key, then fails closed after owner cache clear', async () => {
  const key = 'user/A/concepts/c/old.png'
  const stale = 'https://signed.example/storage/v1/object/sign/tattoo-images/user/A/concepts/c/old.png?token=old'
  const fresh = 'https://signed.example/storage/v1/object/sign/tattoo-images/user/A/concepts/c/old.png?token=new'
  registerBlobUrl(key, stale)
  registerBlobUrl(key, fresh)
  const bytes = 'data:image/png;base64,aW1hZ2U='
  const blobs = { getUrl: vi.fn().mockResolvedValue(bytes) }
  const data = { concepts: [{ id: 'c', imageUrl: stale }] }
  const backup = await createPortableBackup(data, { ownerId: 'A', blobs })
  expect(parseBackup(backup).concepts[0].imageUrl).toBe(bytes)
  expect(data.concepts[0].imageUrl).toBe(stale)
  expect(backup.externalImageReferences).not.toContain(stale)
  clearBlobUrls()
  await expect(createPortableBackup(data, { ownerId: 'A', blobs })).rejects.toThrow(/canonical key|signed/i)
})
