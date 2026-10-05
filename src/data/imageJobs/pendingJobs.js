import { canonicalRequest, imageJobError, LIMITS, parseRequestId, validateRefinementRequest,
  variantIdForJob } from '../../../shared/imageJobs'

const DB_NAME = 'sable-image-jobs-v1'
const STORE = 'pending'
const generations = new WeakMap()
const FIELDS = ['requestId', 'ownerId', 'source', 'sourceImageDigest', 'request',
  'destination', 'createdAt', 'jobId', 'accepted']
const DESTINATION_FIELDS = ['ownerId', 'conceptId', 'parentVariantId', 'draftRevision']
const fail = code => imageJobError(code, 400)
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 256
const exactFields = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key))

function snapshot(input) {
  try {
    if (!exactFields(input, FIELDS)) throw fail('invalid_pending_job')
    parseRequestId(input.requestId)
    const destination = input.destination
    const source = input.source
    if (!text(input.ownerId) || !exactFields(destination, DESTINATION_FIELDS)
        || destination.ownerId !== input.ownerId || !text(destination.conceptId)
        || !(destination.parentVariantId === null || text(destination.parentVariantId))
        || !Number.isSafeInteger(destination.draftRevision) || destination.draftRevision < 0
        || !Number.isSafeInteger(input.createdAt) || input.createdAt < 0
        || typeof input.sourceImageDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(input.sourceImageDigest)
        || ![true, false].includes(input.accepted)) throw fail('invalid_pending_job')
    if (input.accepted) {
      variantIdForJob(input.jobId)
      if (source !== null) throw fail('invalid_pending_job')
    } else if (input.jobId !== null || Object.prototype.toString.call(source) !== '[object Blob]'
        || source.type !== 'image/png' || source.size < 1 || source.size > LIMITS.maxBodyBytes) {
      throw fail('invalid_pending_job')
    }
    return {
      requestId: input.requestId, ownerId: input.ownerId, source,
      sourceImageDigest: input.sourceImageDigest, request: validateRefinementRequest(input.request),
      destination: { ...destination }, createdAt: input.createdAt,
      jobId: input.jobId, accepted: input.accepted,
    }
  } catch { throw fail('invalid_pending_job') }
}

function samePayload(a, b) {
  return a.sourceImageDigest === b.sourceImageDigest && canonicalRequest(a.request) === canonicalRequest(b.request)
    && DESTINATION_FIELDS.every(key => a.destination[key] === b.destination[key])
}

/** Exact pending bytes are durable only after transaction completion. */
export function createPendingJobs({ indexedDB = globalThis.indexedDB, now = Date.now } = {}) {
  const supported = indexedDB && typeof indexedDB.open === 'function'
  if (supported && !generations.has(indexedDB)) generations.set(indexedDB, 0)
  const generation = () => supported ? generations.get(indexedDB) : 0

  async function openDB() {
    if (!supported) throw fail('journal_unavailable')
    return new Promise((resolve, reject) => {
      let request
      let failed = false
      try { request = indexedDB.open(DB_NAME, 1) } catch { reject(fail('journal_unavailable')); return }
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onerror = request.onblocked = () => { failed = true; reject(fail('journal_unavailable')) }
      request.onsuccess = () => {
        const db = request.result
        db.onversionchange = () => db.close()
        if (failed) db.close()
        else resolve(db)
      }
    })
  }

  async function transact(mode, action, captured = generation()) {
    const db = await openDB()
    if (captured !== generation()) { db.close(); throw fail('owner_changed') }
    return new Promise((resolve, reject) => {
      let tx, result, failure
      function abort(error) {
        failure = error?.code ? error : fail('journal_unavailable')
        try { tx?.abort() } catch { db.close(); reject(failure) }
      }
      try {
        tx = db.transaction(STORE, mode)
        tx.oncomplete = () => {
          db.close()
          if (captured !== generation()) reject(fail('owner_changed'))
          else resolve(result)
        }
        tx.onerror = tx.onabort = () => { db.close(); reject(failure ?? fail('journal_unavailable')) }
        action(tx.objectStore(STORE), value => { result = value }, abort)
      } catch (error) {
        if (tx) abort(error)
        else { db.close(); reject(fail('journal_unavailable')) }
      }
    })
  }

  function key(ownerId, requestId) {
    if (!text(ownerId)) throw fail('invalid_pending_job')
    parseRequestId(requestId)
    return [ownerId, requestId]
  }

  return {
    async put(input) {
      const captured = generation()
      const record = snapshot(input)
      const id = key(record.ownerId, record.requestId)
      return transact('readwrite', (store, _set, abort) => {
        const read = store.get(id)
        read.onsuccess = () => {
          try {
            const previous = read.result
            if (previous && !samePayload(previous, record)) throw fail('idempotency_conflict')
            if (previous?.accepted) return
            store.put(record, id)
          } catch (error) { abort(error) }
        }
      }, captured)
    },
    async get(ownerId, requestId) {
      const id = key(ownerId, requestId)
      return transact('readonly', (store, set) => {
        store.get(id).onsuccess = event => set(event.target.result ?? null)
      })
    },
    async list(ownerId) {
      if (!text(ownerId)) throw fail('invalid_pending_job')
      return transact('readonly', (store, set) => {
        store.getAll().onsuccess = event => set(event.target.result.filter(row => row.ownerId === ownerId))
      })
    },
    async markAccepted(ownerId, requestId, jobId) {
      const id = key(ownerId, requestId)
      variantIdForJob(jobId)
      return transact('readwrite', (store, _set, abort) => {
        store.get(id).onsuccess = event => {
          try {
            const row = event.target.result
            if (!row) throw fail('pending_not_found')
            if (row.accepted && row.jobId !== jobId) throw fail('idempotency_conflict')
            store.put({ ...row, accepted: true, jobId, source: null }, id)
          } catch (error) { abort(error) }
        }
      })
    },
    async remove(ownerId, requestId) {
      const id = key(ownerId, requestId)
      return transact('readwrite', store => { store.delete(id) })
    },
    async clearAll() {
      if (supported) generations.set(indexedDB, generation() + 1)
      return transact('readwrite', store => { store.clear() })
    },
    async expire() {
      const clock = now()
      return transact('readwrite', store => {
        store.openCursor().onsuccess = event => {
          const cursor = event.target.result
          if (!cursor) return
          const row = cursor.value
          if (!row.accepted && row.source && clock - row.createdAt >= LIMITS.inputRetentionMs) cursor.delete()
          cursor.continue()
        }
      })
    },
  }
}

export const pendingImageJobs = createPendingJobs()
