import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Backup v2 (#114): a backup used to dump in-memory display values, so a
// Supabase backup held signed URLs that expire within the hour — restoring it
// elsewhere gave dead photos. v2 embeds the bytes (data URLs); import accepts
// v1 and v2 and sends embedded photos through the normal staging/upload path.

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))

const stageImage = vi.fn()
vi.mock('../data/imageStaging', async (importOriginal) => ({
  ...(await importOriginal()),
  stageImage: (...args) => stageImage(...args),
}))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { createBackup, createBackupWithImages, parseBackup, restoreBackupImages, BACKUP_VERSION } =
  await import('../data/export')

const PNG = 'data:image/png;base64,iVBORw0KGgo='
const bytesFor = { 'https://signed.example/a?t=1': 'AAAA', 'blob:http://localhost/b': 'BBBB' }

beforeEach(() => {
  clearBlobUrls()
  getUrl.mockReset()
  stageImage.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (!(url in bytesFor)) throw new Error(`no bytes for ${url}`)
    return { ok: true, blob: async () => new Blob([bytesFor[url]], { type: 'image/png' }) }
  }))
})
afterEach(() => vi.unstubAllGlobals())

const dataUrlOf = (text) => `data:image/png;base64,${btoa(text)}`

describe('createBackupWithImages', () => {
  it('is version 2 and embeds a key-backed photo as a data url, dropping the old key', async () => {
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=1')
    const { backup, skipped } = await createBackupWithImages({
      artists: [{ id: 'a', images: [{ key: 'user/u1/artists/a/1.jpg', addedAt: '2026-01-01T00:00:00Z' }] }],
    })
    expect(BACKUP_VERSION).toBe(2)
    expect(backup.version).toBe(2)
    expect(skipped).toBe(0)
    expect(backup.data.artists[0].images).toEqual([{ url: dataUrlOf('AAAA'), addedAt: '2026-01-01T00:00:00Z' }])
  })

  it('embeds a resolved display url of a registered photo, keeping its note', async () => {
    registerBlobUrl('user/u1/ideas/i/1.jpg', 'https://signed.example/a?t=1')
    const { backup } = await createBackupWithImages({
      ideas: [{ id: 'i', images: [{ url: 'https://signed.example/a?t=1', note: 'linework', key: 'user/u1/ideas/i/1.jpg' }] }],
    })
    expect(backup.data.ideas[0].images).toEqual([{ url: dataUrlOf('AAAA'), note: 'linework' }])
  })

  it('embeds a plain string photo and a local blob: url', async () => {
    registerBlobUrl('user/u1/artists/b/1.jpg', 'blob:http://localhost/b')
    const { backup } = await createBackupWithImages({ artists: [{ id: 'b', images: ['blob:http://localhost/b'] }] })
    expect(backup.data.artists[0].images).toEqual([dataUrlOf('BBBB')])
  })

  it('leaves static paths, external urls and existing data urls as they are', async () => {
    const images = ['images/artists/a/1.jpg', 'https://example.com/x.jpg', PNG, { url: 'images/demo/a.webp', note: 'n' }]
    const { backup, skipped } = await createBackupWithImages({ artists: [{ id: 'a', images }] })
    expect(backup.data.artists[0].images).toEqual(images)
    expect(skipped).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('embeds concept images and their variants', async () => {
    registerBlobUrl('user/u1/concepts/c/1.jpg', 'https://signed.example/a?t=1')
    const { backup } = await createBackupWithImages({
      concepts: [{ id: 'c', imageUrl: 'https://signed.example/a?t=1', variants: [{ id: 'v', imageUrl: 'https://signed.example/a?t=1' }] }],
    })
    expect(backup.data.concepts[0].imageUrl).toBe(dataUrlOf('AAAA'))
    expect(backup.data.concepts[0].variants[0].imageUrl).toBe(dataUrlOf('AAAA'))
  })

  it('counts a photo whose bytes cannot be read and leaves its ref as it was', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    const gone = { key: 'user/u1/artists/a/gone.jpg' }
    const { backup, skipped } = await createBackupWithImages({ artists: [{ id: 'a', images: [gone, 'images/a.jpg'] }] })
    expect(skipped).toBe(1)
    expect(backup.data.artists[0].images).toEqual([gone, 'images/a.jpg'])
  })

  it('reports progress as photos are embedded', async () => {
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=1')
    registerBlobUrl('user/u1/artists/b/1.jpg', 'blob:http://localhost/b')
    const onProgress = vi.fn()
    await createBackupWithImages(
      { artists: [{ id: 'a', images: [{ key: 'user/u1/artists/a/1.jpg' }] }, { id: 'b', images: [{ key: 'user/u1/artists/b/1.jpg' }] }] },
      { onProgress },
    )
    expect(onProgress).toHaveBeenLastCalledWith(2, 2)
  })

  it('does not mutate the data it was given', async () => {
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=1')
    const artists = [{ id: 'a', images: [{ key: 'user/u1/artists/a/1.jpg' }] }]
    await createBackupWithImages({ artists })
    expect(artists[0].images).toEqual([{ key: 'user/u1/artists/a/1.jpg' }])
  })
})

describe('parseBackup versions', () => {
  it('accepts v1 and v2 backups', () => {
    expect(parseBackup(createBackup({ artists: [{ id: 'a' }] })).artists).toEqual([{ id: 'a' }])
    expect(parseBackup({ version: 2, data: { artists: [{ id: 'b' }] } }).artists).toEqual([{ id: 'b' }])
  })

  it('rejects a backup made by a newer version of the app', () => {
    expect(() => parseBackup({ version: 3, data: { artists: [] } })).toThrow(/newer version/i)
  })
})

describe('restoreBackupImages', () => {
  const ctx = { userId: 'u2' }
  beforeEach(() => {
    stageImage.mockResolvedValue({ key: 'user/u2/new.jpg', url: 'staged' })
  })

  it('stages each embedded photo under the right scope: a key for an idea, the display url elsewhere', async () => {
    const data = {
      artists: [{ id: 'a', images: [PNG, { url: PNG, note: 'n' }, 'images/a.jpg'] }],
      ideas: [{ id: 'i', images: [{ url: PNG, note: 'x' }] }],
      boards: [{ id: 'b' }],
      concepts: [{ id: 'c', imageUrl: PNG, variants: [{ id: 'v', imageUrl: PNG }] }],
      conventionOverrides: {},
    }
    const { data: out, failed } = await restoreBackupImages(data, ctx)
    expect(failed).toBe(0)
    expect(out.artists[0].images).toEqual(['staged', { url: 'staged', note: 'n' }, 'images/a.jpg'])
    expect(out.ideas[0].images).toEqual([{ key: 'user/u2/new.jpg', note: 'x' }])
    expect(out.concepts[0].imageUrl).toBe('staged')
    expect(out.concepts[0].variants[0].imageUrl).toBe('staged')
    expect(stageImage).toHaveBeenCalledWith(PNG, { userId: 'u2', scope: 'artists', id: 'a' })
    expect(stageImage).toHaveBeenCalledWith(PNG, { userId: 'u2', scope: 'ideas', id: 'i' })
    expect(stageImage).toHaveBeenCalledWith(PNG, { userId: 'u2', scope: 'concepts', id: 'c' })
    expect(stageImage).toHaveBeenCalledTimes(5)
  })

  it('leaves the data untouched when nobody is signed in (nowhere to upload)', async () => {
    const data = { artists: [{ id: 'a', images: [PNG] }], ideas: [], boards: [], concepts: [], conventionOverrides: {} }
    const { data: out } = await restoreBackupImages(data, { userId: null })
    expect(out.artists[0].images).toEqual([PNG])
    expect(stageImage).not.toHaveBeenCalled()
  })

  it('drops a photo that could not be staged, rather than keeping its base64, and counts it', async () => {
    stageImage.mockResolvedValue({ key: null, url: '', failed: true })
    const data = { artists: [{ id: 'a', images: [PNG, 'images/a.jpg'] }], ideas: [], boards: [], concepts: [], conventionOverrides: {} }
    const { data: out, failed } = await restoreBackupImages(data, ctx)
    expect(failed).toBe(1)
    expect(out.artists[0].images).toEqual(['images/a.jpg'])
  })

  it('round-trips: an exported backup restores with fresh keys, none from the old account', async () => {
    registerBlobUrl('user/u1/artists/a/1.jpg', 'https://signed.example/a?t=1')
    const { backup } = await createBackupWithImages({ artists: [{ id: 'a', images: [{ key: 'user/u1/artists/a/1.jpg' }] }] })
    const { data } = await restoreBackupImages(parseBackup(JSON.parse(JSON.stringify(backup))), ctx)
    expect(JSON.stringify(data)).not.toContain('user/u1/')
    expect(stageImage).toHaveBeenCalledWith(dataUrlOf('AAAA'), { userId: 'u2', scope: 'artists', id: 'a' })
  })
})
