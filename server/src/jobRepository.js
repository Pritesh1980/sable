import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { LIMITS, canonicalRequest, imageJobError, parseRequestId, variantIdForJob } from '../../shared/imageJobs.js'

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8')
const iso = value => value === null ? null : new Date(value).toISOString()
const day = value => new Date(value).toISOString().slice(0, 10)
const ACTIVE = new Set(['accepted', 'dispatching', 'running'])
const TRANSITIONS = {
  accepted: ['dispatching', 'cancelled', 'expired', 'failed'],
  dispatching: ['running', 'succeeded', 'failed', 'outcome_unknown'],
  running: ['succeeded', 'failed', 'outcome_unknown'],
  succeeded: ['expired'],
}

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000
}

function timestamp(value) {
  if (validTime(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (validTime(parsed) && iso(parsed) === value) return parsed
  }
  throw imageJobError('invalid_timestamp', 400)
}

function text(value, max = 256) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && !/[\x00-\x1f\x7f]/u.test(value) // eslint-disable-line no-control-regex
}

function digest(value) {
  return typeof value === 'string' && value.length === 64 && /^[a-f0-9]+$/u.test(value)
}

function validateInput(input) {
  variantIdForJob(input.id)
  if (!text(input.ownerId, 128) || !digest(input.requestHash) || !digest(input.sourceImageDigest)
      || !text(input.inputRef, 4096) || !validTime(input.admittedAt)) {
    throw imageJobError('invalid_job', 400)
  }
  const requestJson = canonicalRequest(input.request)
  const profile = input.profile
  const fields = ['id', 'model', 'size', 'quality', 'outputFormat']
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)
      || Object.keys(profile).length !== fields.length || fields.some(key => !text(profile[key]))
      || profile.id !== input.request.profileId) throw imageJobError('invalid_profile', 400)
  return { requestJson, profileJson: JSON.stringify(Object.fromEntries(fields.map(key => [key, profile[key]]))) }
}

function resultJson(result) {
  if (!result || Object.keys(result).length !== 3 || !digest(result.digest)
      || result.mime !== 'image/png' || !Number.isSafeInteger(result.size)
      || result.size < 1 || result.size > LIMITS.maxBodyBytes) throw imageJobError('invalid_result', 400)
  return JSON.stringify({ digest: result.digest, mime: result.mime, size: result.size })
}

function job(row) {
  if (!row) return null
  return {
    id: row.id, ownerId: row.owner_id, requestId: row.request_id,
    requestHash: row.request_hash, sourceImageDigest: row.source_digest,
    state: row.state, createdAt: iso(row.accepted_at), acceptedAt: iso(row.accepted_at),
    acceptedDay: row.accepted_day, dispatchedAt: iso(row.dispatched_at),
    completedAt: iso(row.completed_at), expiresAt: iso(row.expires_at),
    acknowledgedAt: iso(row.acknowledged_at), quotaUsed: row.quota_used,
    request: JSON.parse(row.request_json), profile: JSON.parse(row.profile_json),
    inputRef: row.input_ref, result: JSON.parse(row.result_json), errorCode: row.error_code,
  }
}

/** Synchronous transactions must never contain asynchronous work or provider calls. */
export function createJobRepository(dbPath, { now = Date.now } = {}) {
  const db = new DatabaseSync(dbPath)
  db.enableDefensive(true)
  try { db.exec(schema) } catch (error) { db.close(); throw error }

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function findRequest(ownerId, requestId) {
    return job(db.prepare('SELECT * FROM jobs WHERE owner_id = ? AND request_id = ?').get(ownerId, requestId))
  }

  function read(id) {
    return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)
  }

  function owned(ownerId, id) {
    const row = db.prepare('SELECT * FROM jobs WHERE owner_id = ? AND id = ?').get(ownerId, id)
    if (!row) throw imageJobError('job_not_found', 404)
    return row
  }

  function quotaForDay(ownerId, acceptedDay) {
    const { active } = db.prepare(`SELECT count(*) AS active FROM jobs
      WHERE owner_id = ? AND state IN ('accepted', 'dispatching', 'running')`).get(ownerId)
    const { used } = db.prepare(`SELECT coalesce(sum(quota_used), 0) AS used FROM jobs
      WHERE owner_id = ? AND accepted_day = ?`).get(ownerId, acceptedDay)
    return { active, dailyRemaining: Math.max(0, LIMITS.maxDailyJobs - used) }
  }

  // Called only inside BEGIN IMMEDIATE. No caller can patch identity, profile or quota.
  function move(id, from, to, patch = {}, clock = now()) {
    const row = read(id)
    if (!row) throw imageJobError('job_not_found', 404)
    if (row.state !== from || !TRANSITIONS[from]?.includes(to)) throw imageJobError('invalid_transition', 409)
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)
        || Reflect.ownKeys(patch).some(key => !['result', 'errorCode', 'completedAt', 'expiresAt'].includes(key))) {
      throw imageJobError('invalid_patch', 400)
    }
    const terminal = !ACTIVE.has(to)
    let completedAt = row.completed_at
    let expiresAt = row.expires_at
    if (!terminal && Object.keys(patch).length) throw imageJobError('invalid_patch', 400)
    if (terminal && completedAt === null) {
      completedAt = timestamp(patch.completedAt ?? clock)
      if (completedAt < (row.dispatched_at ?? row.accepted_at) || completedAt > clock) {
        throw imageJobError('invalid_timestamp', 400)
      }
      expiresAt = timestamp(completedAt + LIMITS.outputRetentionMs)
    }
    if ((patch.completedAt !== undefined && timestamp(patch.completedAt) !== completedAt)
        || (patch.expiresAt !== undefined && timestamp(patch.expiresAt) !== expiresAt)) {
      throw imageJobError('invalid_timestamp', 400)
    }
    let result = row.result_json
    if (to === 'succeeded') result = resultJson(patch.result)
    else if (patch.result !== undefined) throw imageJobError('invalid_patch', 400)
    let errorCode = row.error_code
    if (patch.errorCode !== undefined) {
      if (!['failed', 'outcome_unknown'].includes(to)) throw imageJobError('invalid_patch', 400)
      errorCode = imageJobError(patch.errorCode, 500).code
    }
    const dispatchedAt = to === 'dispatching' ? timestamp(clock) : row.dispatched_at
    // Once dispatch is recorded, no error/cancel/cleanup may refund the reservation.
    const quotaUsed = terminal && dispatchedAt === null ? 0 : row.quota_used
    db.prepare(`UPDATE jobs SET state = ?, dispatched_at = ?, completed_at = ?, expires_at = ?,
      quota_used = ?, result_json = ?, error_code = ? WHERE id = ? AND state = ?`).run(
      to, dispatchedAt, completedAt, expiresAt, quotaUsed, result, errorCode, id, from,
    )
    return job(read(id))
  }

  function clearPayload(id) {
    db.prepare('UPDATE jobs SET request_json = NULL, input_ref = NULL, result_json = NULL WHERE id = ?').run(id)
  }

  function acknowledge(row) {
    if (row.acknowledged_at !== null) return job(row)
    if (row.state !== 'succeeded') throw imageJobError('job_conflict', 409)
    // This durable intent survives a later failed spool deletion. Cleanup uses the job ID.
    db.prepare('UPDATE jobs SET acknowledged_at = ? WHERE id = ?').run(timestamp(now()), row.id)
    clearPayload(row.id)
    return job(read(row.id))
  }

  return {
    accept(input) {
      return transaction(() => {
        const existing = findRequest(input.ownerId, input.requestId)
        if (existing) {
          if (existing.requestHash !== input.requestHash) throw imageJobError('idempotency_conflict', 409)
          return existing
        }
        const { requestJson, profileJson } = validateInput(input)
        const { issuedAt } = parseRequestId(input.requestId)
        if (input.admittedAt - issuedAt > LIMITS.requestMaxAgeMs) {
          throw imageJobError('request_expired', 410, input.admittedAt)
        }
        if (issuedAt - input.admittedAt > LIMITS.requestFutureSkewMs) {
          throw imageJobError('key_clock_skew', 400, input.admittedAt)
        }
        const acceptedDay = day(input.admittedAt)
        const quota = quotaForDay(input.ownerId, acceptedDay)
        if (quota.active >= LIMITS.maxActiveJobs) throw imageJobError('active_quota_exceeded', 429)
        if (!quota.dailyRemaining) throw imageJobError('daily_quota_exceeded', 429)
        db.prepare(`INSERT INTO jobs (id, owner_id, request_id, request_hash, source_digest,
          state, accepted_at, accepted_day, request_json, profile_json, input_ref)
          VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?)`).run(
          input.id, input.ownerId, input.requestId, input.requestHash, input.sourceImageDigest,
          input.admittedAt, acceptedDay, requestJson, profileJson, input.inputRef,
        )
        return findRequest(input.ownerId, input.requestId)
      })
    },
    findRequest,
    get: (ownerId, id) => job(db.prepare('SELECT * FROM jobs WHERE owner_id = ? AND id = ?').get(ownerId, id)),
    list(ownerId, { limit = 50 } = {}) {
      if (!Number.isSafeInteger(limit) || limit < 1) throw imageJobError('invalid_limit', 400)
      return db.prepare('SELECT * FROM jobs WHERE owner_id = ? ORDER BY accepted_at DESC, id DESC LIMIT ?')
        .all(ownerId, Math.min(limit, 50)).map(job)
    },
    listInternal: () => db.prepare('SELECT * FROM jobs ORDER BY accepted_at, id').all().map(job),
    quota: ownerId => quotaForDay(ownerId, day(now())),
    claimNext() {
      return transaction(() => {
        const clock = timestamp(now())
        const stale = db.prepare("SELECT id FROM jobs WHERE state = 'accepted' AND accepted_at <= ?")
          .all(clock - LIMITS.inputRetentionMs)
        for (const { id } of stale) move(id, 'accepted', 'expired', {}, clock)
        const row = db.prepare("SELECT * FROM jobs WHERE state = 'accepted' ORDER BY accepted_at, id LIMIT 1").get()
        return row ? move(row.id, 'accepted', 'dispatching', {}, clock) : null
      })
    },
    transition: (id, from, to, patch = {}) => transaction(() => move(id, from, to, patch)),
    ack: (ownerId, id) => transaction(() => acknowledge(owned(ownerId, id))),
    cancelOrDiscard(ownerId, id) {
      return transaction(() => {
        const row = owned(ownerId, id)
        if (['dispatching', 'running', 'outcome_unknown'].includes(row.state)) {
          throw imageJobError('job_conflict', 409)
        }
        if (row.state === 'succeeded') return acknowledge(row)
        if (row.state === 'accepted') move(id, 'accepted', 'cancelled')
        clearPayload(id)
        return job(read(id))
      })
    },
    expire(nowMs) {
      const clock = timestamp(nowMs)
      return transaction(() => {
        const rows = db.prepare(`SELECT * FROM jobs WHERE
          (state = 'accepted' AND accepted_at <= ?) OR (state = 'succeeded' AND expires_at <= ?)`)
          .all(clock - LIMITS.inputRetentionMs, clock)
        return rows.map(row => move(row.id, row.state, 'expired', {}, clock))
      })
    },
    scrub(id) {
      transaction(() => {
        const row = read(id)
        if (!row || ACTIVE.has(row.state)) return
        const clock = timestamp(now())
        if (row.completed_at !== null && clock - row.completed_at >= LIMITS.tombstoneRetentionMs
            && row.accepted_day < day(clock)) {
          db.prepare('DELETE FROM jobs WHERE id = ?').run(id)
          return
        }
        if (row.acknowledged_at !== null || ['cancelled', 'expired'].includes(row.state)
            || (row.expires_at !== null && row.expires_at <= clock)) clearPayload(id)
        else db.prepare('UPDATE jobs SET input_ref = NULL WHERE id = ?').run(id)
      })
    },
    close: () => db.close(),
  }
}
