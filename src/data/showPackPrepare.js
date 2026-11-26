import { isSameOrigin, resolveImage } from './imageResolver'

// Preparing, checking and removing offline show packs (#209). The rules that
// make "ready" mean something:
//
//   - The pack record is written first, listing every photo it will hold, and
//     stays `preparing` until the run finishes. A reload, a Stop or a tab the
//     phone killed mid-run leaves it `preparing`, which reads as interrupted,
//     never as ready.
//   - One photo at a time, so a big pack never holds more than one photo's
//     bytes in memory, and a Stop takes effect between photos.
//   - Bytes are trusted only when they are an image, are not empty, and are
//     no shorter than the server said they would be. A photo on another site
//     is never fetched: CORS would refuse the bytes, and that is not ours to
//     get around.
//   - A full disk (QuotaExceededError) ends the run: there is no point trying
//     the next photo. What was saved stays, so a retry carries on from there.
//   - At the end, every photo is read back off the device and hashed against
//     what was saved. Only that check can make a pack ready, and it is what
//     "Check again" repeats later, with no network at all.
//
// Removal deletes the pack, then only the photos no other pack of the same
// owner still lists. These are copies in the pack store: no originals, staged
// uploads or blob storage are ever touched from here.

const PACK_VERSION = 1

export function isQuotaError(error) {
  return Boolean(error) && (
    error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error.code === 22
  )
}

const isAbort = (error, signal) => Boolean(signal?.aborted) || error?.name === 'AbortError'

function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Stopped', 'AbortError')
}

async function toBuffer(blob) {
  return typeof blob.arrayBuffer === 'function' ? blob.arrayBuffer() : new Response(blob).arrayBuffer()
}

async function sha256(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

// One photo's bytes: { blob } or { error }. 'offline' when the request never
// got an answer, 'partial' when the body was cut short, 'unavailable' when
// there is nothing to fetch or the server said no. An abort is rethrown.
export async function readPhotoBytes(ref, { signal, resolve = resolveImage, fetchImpl = globalThis.fetch } = {}) {
  const src = await resolve(ref)
  if (!src) return { error: 'unavailable' }
  // A same-origin photo stays same-origin: a redirect to another site fails
  // rather than quietly fetching from it. Blob keys resolve to the storage
  // backend's own url (or a data: url) and are left to it.
  const init = { ...(signal ? { signal } : {}), ...(sameOriginHttp(src) ? { mode: 'same-origin' } : {}) }
  let response
  try {
    response = await fetchImpl(src, Object.keys(init).length ? init : undefined)
  } catch (error) {
    if (isAbort(error, signal)) throw error
    return { error: 'offline' }
  }
  if (!response?.ok) return { error: 'unavailable' }
  // Only a slice of the photo, whatever its length says.
  if (response.status === 206 || response.headers?.get?.('content-range')) return { error: 'partial' }
  let blob
  try {
    blob = await response.blob()
  } catch (error) {
    if (isAbort(error, signal)) throw error
    return { error: 'partial' }
  }
  // A compressed response announces its encoded length, which is shorter than
  // the bytes it decodes to, so only a body *shorter* than announced is cut off.
  const announced = Number(response.headers?.get?.('content-length'))
  if (Number.isFinite(announced) && announced > 0 && blob.size < announced) return { error: 'partial' }
  return { blob }
}

const sameOriginHttp = (src) => !/^(?:data|blob):/i.test(src) && isSameOrigin(src)

// Whether the stored copy of a photo is whole: present, and hashing to what
// was recorded when it was saved.
async function intact(store, ownerId, id) {
  const record = await store.getPhoto(ownerId, id)
  if (!record?.bytes) return { state: 'missing' }
  const buffer = record.bytes
  if (buffer.byteLength !== record.size || (await sha256(buffer)) !== record.sha256) return { state: 'damaged' }
  return { state: 'present', size: record.size }
}

// Reads every savable photo back off the device. No network.
async function check(pack, store, now, signal) {
  const verification = { checkedAt: now(), present: [], missing: [], damaged: [], bytes: 0 }
  for (const photo of pack.photos) {
    throwIfAborted(signal)
    if (photo.external) continue
    const found = await intact(store, pack.ownerId, photo.id)
    if (found.state === 'present') {
      verification.present.push(photo.id)
      verification.bytes += found.size
    } else {
      verification[found.state].push(photo.id)
    }
  }
  return verification
}

async function saveOne(photo, { ownerId, store, readPhoto, signal, assertCurrent, now }) {
  const read = await readPhoto(photo.ref, { signal })
  throwIfAborted(signal)
  assertCurrent()
  if (read?.error) return read.error
  const blob = read?.blob
  if (!blob?.size || !String(blob.type || '').startsWith('image/')) return 'unavailable'
  const bytes = await toBuffer(blob)
  const record = { ownerId, id: photo.id, type: blob.type, size: bytes.byteLength, sha256: await sha256(bytes), bytes, savedAt: now() }
  throwIfAborted(signal)
  assertCurrent()
  await store.putPhoto(record)
  return 'saved'
}

// Drops this owner's stored photos that no pack lists any more. A pack still
// preparing lists everything it means to hold, so its photos are safe too.
async function collectGarbage(ownerId, store) {
  const packs = await store.listPacks(ownerId)
  const wanted = new Set(packs.flatMap((p) => (p.photos || []).map((photo) => photo.id)))
  const unused = (await store.listPhotoIds(ownerId)).filter((id) => !wanted.has(id))
  await store.deletePhotos(ownerId, unused)
}

export async function preparePack(plan, {
  ownerId,
  store,
  readPhoto = readPhotoBytes,
  signal,
  onProgress,
  now = () => new Date().toISOString(),
  assertCurrent = () => {},
} = {}) {
  if (!ownerId) throw new Error('A show pack needs an owner')
  throwIfAborted(signal)
  assertCurrent()
  const pack = {
    ...plan,
    version: PACK_VERSION,
    ownerId,
    state: 'preparing',
    startedAt: now(),
    preparedAt: null,
    results: {},
    stoppedBy: null,
    verification: null,
  }
  await store.putPack(pack)

  const results = {}
  let quota = false
  let done = 0
  for (const photo of pack.photos) {
    throwIfAborted(signal)
    assertCurrent()
    if (photo.external) results[photo.id] = 'external'
    else if (quota) results[photo.id] = 'skipped'
    else if ((await intact(store, ownerId, photo.id)).state === 'present') results[photo.id] = 'saved'
    else {
      try {
        results[photo.id] = await saveOne(photo, { ownerId, store, readPhoto, signal, assertCurrent, now })
      } catch (error) {
        if (!isQuotaError(error)) throw error
        results[photo.id] = 'quota'
        quota = true
      }
    }
    done += 1
    onProgress?.(done, pack.photos.length)
  }

  throwIfAborted(signal)
  assertCurrent()
  const verification = await check(pack, store, now, signal)
  // A Stop during the read-back still means stopped: never commit `done`.
  throwIfAborted(signal)
  assertCurrent()
  const finished = { ...pack, state: 'done', preparedAt: now(), results, stoppedBy: quota ? 'quota' : null, verification }
  await store.putPack(finished)
  // Best effort: a refresh that dropped a photo leaves its bytes behind until
  // the next run if this fails, which costs space, never correctness.
  try { await collectGarbage(ownerId, store) } catch { /* next run tidies up */ }
  return finished
}

// "Check again": re-reads the stored bytes and records the result and time.
// Leaves the run state alone, so an interrupted pack stays interrupted.
export async function verifyPack(pack, { store, now = () => new Date().toISOString(), assertCurrent = () => {} } = {}) {
  assertCurrent()
  const verification = await check(pack, store, now)
  assertCurrent()
  const checked = { ...pack, verification }
  await store.putPack(checked)
  return checked
}

export async function removePack(ownerId, editionKey, { store, assertCurrent = () => {} } = {}) {
  assertCurrent()
  await store.deletePack(ownerId, editionKey)
  await collectGarbage(ownerId, store)
}
