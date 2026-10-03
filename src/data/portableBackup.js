import { createBackup, requestBackupDownload } from './export'
import { knownKeyForUrl } from './blobUrls'
import { paidVariantIds, recordExportRequested } from './backupStatus'

function isImageDataUrl(url) {
  const match = /^data:image\/[a-z0-9.+-]+(;[^,]*)?,(.+)$/is.exec(url)
  if (!match) return false
  if (!/;base64(?:;|$)/i.test(match[1] || '')) return true
  return match[2].length % 4 === 0 && /^[a-z0-9+/]+={0,2}$/i.test(match[2])
}

function imageSource(value) {
  if (typeof value === 'string') {
    const knownKey = knownKeyForUrl(value)
    return { source: knownKey || value, canonical: Boolean(knownKey) || value.startsWith('user/') }
  }
  if (value && typeof value === 'object') {
    // An explicit {key} is a canonical promise, even when malformed. Never
    // reinterpret it as a static or external URL just because its text lacks
    // the expected user/<owner>/ prefix.
    if (Object.hasOwn(value, 'key')) return { source: value.key, canonical: true }
    const url = typeof value.url === 'string' ? value.url : ''
    const knownKey = knownKeyForUrl(url)
    return { source: knownKey || url, canonical: Boolean(knownKey) || url.startsWith('user/') }
  }
  return { source: '', canonical: false }
}

function validateKey(key, ownerId) {
  if (typeof key !== 'string' || !key.startsWith('user/')) {
    throw new Error('A canonical image key is malformed; backup was not downloaded.')
  }
  const parts = key.split('/')
  if (parts.length < 4 || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('A local image key is malformed; backup was not downloaded.')
  }
  if (parts[1] !== ownerId) throw new Error('A local image belongs to another owner; backup was not downloaded.')
}

async function blobToDataUrl(blob) {
  if (!(blob instanceof Blob) || !blob.type?.startsWith('image/')) throw new Error('A local image response is not an image.')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read a local image for backup.'))
    reader.readAsDataURL(blob)
  })
}

// Only canonical user-owned keys are fetched. A third-party portfolio or relay
// result URL is a reference, never an implicit download request.
export async function createPortableBackup(data, { ownerId, blobs, fetchImpl = globalThis.fetch } = {}) {
  if (!ownerId || !blobs?.getUrl) throw new Error('Sign in before exporting a portable backup.')
  const backup = createBackup(data)
  // createBackup strips top-level sync metadata but intentionally reuses row
  // objects. Work on a JSON snapshot: materialization must never rewrite the
  // live React library while an asynchronous export is in flight.
  backup.data = JSON.parse(JSON.stringify(backup.data))
  const references = new Set()
  const materialized = new Map()

  async function image(value) {
    const { source, canonical } = imageSource(value)
    if (canonical) {
      validateKey(source, ownerId)
      if (!materialized.has(source)) {
        let resolved
        try { resolved = await blobs.getUrl(source) } catch { throw new Error('A local image could not be read for backup.') }
        if (!resolved) throw new Error('A local image is missing; backup was not downloaded.')
        let embedded
        if (resolved.startsWith('data:')) embedded = resolved
        else {
          if (!/^https?:\/\//.test(resolved)) throw new Error('A local image could not be read for backup.')
          let response
          try { response = await fetchImpl(resolved) } catch { throw new Error('A local image could not be read for backup.') }
          if (!response?.ok) throw new Error('A local image could not be read for backup.')
          let blob
          try { blob = await response.blob() } catch { throw new Error('A local image could not be read for backup.') }
          embedded = await blobToDataUrl(blob)
        }
        if (!isImageDataUrl(embedded)) throw new Error('A local image is malformed; backup was not downloaded.')
        materialized.set(source, embedded)
      }
      return materialized.get(source)
    }
    if (!source) return ''
    if (source.startsWith('data:')) {
      if (!isImageDataUrl(source)) throw new Error('An embedded image is malformed; backup was not downloaded.')
      return source
    }
    if (source.startsWith('blob:')) throw new Error('A temporary image cannot be read for backup.')
    // If owner/session cache state was cleared, an old Supabase signed image
    // URL has no trustworthy key. It is not a third-party portfolio reference.
    if (/\/storage\/v1\/object\/(?:sign|public)\/tattoo-images\/user\//.test(source)) {
      throw new Error('A local signed image has no canonical key; backup was not downloaded.')
    }
    if (/^https?:\/\//.test(source) || source.startsWith('/') || source.startsWith('images/')) {
      references.add(source)
      return source
    }
    // Shipped relative assets (including older backups' filenames) remain
    // references. A user/ key must never fall through to this branch.
    references.add(source)
    return source
  }

  for (const artist of backup.data.artists) {
    const images = [...(artist.images || [])]
    for (const { ref, index } of [...(artist.unresolvedImages || [])].sort((a, b) => a.index - b.index)) {
      images.splice(Math.max(0, Math.min(index, images.length)), 0, ref)
    }
    artist.images = await Promise.all(images.map(async (entry) => {
      const url = await image(entry)
      if (!entry || typeof entry !== 'object') return url
      const { key: _key, url: _oldUrl, ...metadata } = entry
      void _key
      void _oldUrl
      return Object.keys(metadata).length ? { ...metadata, url } : url
    }))
    delete artist.unresolvedImages
  }
  for (const idea of backup.data.ideas) {
    idea.images = await Promise.all((idea.images || []).map(async (entry) => ({
      url: await image(entry), note: typeof entry === 'object' ? entry.note || '' : '',
    })))
  }
  for (const board of backup.data.boards) {
    if (board.cover) board.cover = await image(board.cover)
  }
  async function conceptImage(item) {
    const source = item.imageUrl || item.unresolvedImageKey
    if (source) item.imageUrl = await image(source)
    delete item.unresolvedImageKey
  }
  for (const concept of backup.data.concepts) {
    await conceptImage(concept)
    for (const variant of concept.variants || []) await conceptImage(variant)
  }
  backup.externalImageReferences = [...references]
  return backup
}

// This is one transaction from the user's perspective: an incomplete image
// materialization or a blocked click must not advance the owner-scoped status.
export async function requestPortableExport(data, {
  ownerId, blobs, fetchImpl = globalThis.fetch, download = requestBackupDownload,
  assertCurrent = () => {}, now = () => new Date().toISOString(),
} = {}) {
  const backup = await createPortableBackup(data, { ownerId, blobs, fetchImpl })
  assertCurrent()
  download(backup)
  recordExportRequested(ownerId, now(), paidVariantIds(backup.data.concepts))
  return backup
}
