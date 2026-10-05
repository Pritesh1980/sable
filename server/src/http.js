import { createHash, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { imageJobError, LIMITS, parseRequestId, variantIdForJob } from '../../shared/imageJobs.js'
import { hashRequest, normalizeImage } from './imageInput.js'
import { readBoundedMultipart } from './requestBody.js'

const METHODS = 'GET, POST, DELETE, OPTIONS'
const HEADERS = 'Authorization, Content-Type, Idempotency-Key'
const JOB_ROUTE = /^\/v1\/image-jobs\/([^/]+)(?:\/(result|ack))?$/u

function bodyBytes(value) {
  return Buffer.from(JSON.stringify(value))
}

function sendJson(res, status, value) {
  const body = bodyBytes(value)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': body.length })
  res.end(body)
}

function safeError(error) {
  if (error && error.message === error.code && Number.isInteger(error.status)
      && error.status >= 400 && error.status <= 599
      && typeof error.code === 'string' && /^[a-z][a-z0-9_]{0,63}$/u.test(error.code)) return error
  return imageJobError('internal_error', 500)
}

function ownerCorrelation(ownerId) {
  return createHash('sha256').update(ownerId).digest('hex').slice(0, 16)
}

function publicGeneration(job) {
  return {
    version: 1, jobId: job.id, provider: 'openai', model: job.profile.model,
    profileId: job.profile.id, createdAt: job.completedAt ?? job.createdAt, provenance: 'relay',
  }
}

/** Remove database-only identity, hashes, quota and spool references. */
export function publicJob(job) {
  if (!job) return null
  return {
    id: job.id, requestId: job.requestId, state: job.state, createdAt: job.createdAt,
    completedAt: job.completedAt, expiresAt: job.expiresAt, errorCode: job.errorCode,
    sourceImageDigest: job.sourceImageDigest, request: job.request,
    generation: publicGeneration(job),
  }
}

function applyCors(req, res, origins) {
  const origin = req.headers.origin
  if (origin === undefined) return
  if (typeof origin !== 'string' || !origins.includes(origin)) throw imageJobError('origin_forbidden', 403)
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Expose-Headers', 'X-Image-Digest')
}

function preflight(req, res) {
  const method = req.headers['access-control-request-method']
  const requested = req.headers['access-control-request-headers']
  if (!['GET', 'POST', 'DELETE'].includes(method) || typeof requested !== 'string') {
    throw imageJobError('invalid_preflight', 400)
  }
  const allowed = new Set(['authorization', 'content-type', 'idempotency-key'])
  const names = requested.split(',').map(value => value.trim().toLowerCase())
  if (!names.length || names.some(value => !allowed.has(value))) throw imageJobError('invalid_preflight', 400)
  res.writeHead(204, {
    'Access-Control-Allow-Methods': METHODS,
    'Access-Control-Allow-Headers': HEADERS,
    'Access-Control-Max-Age': '600',
  })
  res.end()
}

function routeFor(req) {
  if (typeof req.url !== 'string' || req.url.includes('%')) throw imageJobError('invalid_path', 400)
  const url = new URL(req.url, 'http://relay.invalid')
  if (url.search || url.hash) throw imageJobError('invalid_path', 400)
  if (url.pathname === '/v1/image-capabilities') return { name: 'capabilities' }
  if (url.pathname === '/v1/image-jobs') return { name: 'jobs' }
  const match = JOB_ROUTE.exec(url.pathname)
  if (match) {
    variantIdForJob(match[1])
    return { name: match[2] ?? 'job', jobId: match[1] }
  }
  if (url.pathname.startsWith('/v1/image-jobs/')) throw imageJobError('invalid_job_id', 400)
  throw imageJobError('endpoint_not_found', 404)
}

function requireMethod(actual, expected) {
  if (!expected.includes(actual)) throw imageJobError('method_not_allowed', 405)
}

function getOwned(repo, ownerId, id) {
  const job = repo.get(ownerId, id)
  if (!job) throw imageJobError('job_not_found', 404)
  return job
}

async function bestEffortCleanup(spool, repo, jobId, log) {
  try { await spool.removeInput(jobId) } catch { log({ code: 'input_cleanup_failed' }) }
  try { await spool.removeOutput(jobId) } catch { log({ code: 'output_cleanup_failed' }) }
  try { repo.scrub(jobId) } catch { log({ code: 'metadata_cleanup_failed' }) }
}

/** Seven owner-checked routes; no endpoint dispatches provider work directly. */
export function createRelayServer({ config, verifyOwner, repo, spool, now = Date.now, log = () => {} }) {
  function safeLog(event) {
    try { log(event) } catch { /* Observability cannot alter request semantics. */ }
  }

  const server = createServer({
    requestTimeout: Math.min(35_000, config.uploadTimeoutMs + 5_000),
    headersTimeout: 10_000, keepAliveTimeout: 5_000, connectionsCheckingInterval: 1_000,
    maxHeaderSize: 16 * 1024,
  }, async (req, res) => {
    const startedAt = now()
    let owner
    let route
    let errorCode
    res.setHeader('Cache-Control', 'no-store')
    try {
      applyCors(req, res, config.origins)
      route = routeFor(req)
      if (req.method === 'OPTIONS') return preflight(req, res)
      const admittedAt = now()
      owner = await verifyOwner({ authorization: req.headers.authorization })

      if (route.name === 'capabilities') {
        requireMethod(req.method, ['GET'])
        return sendJson(res, 200, {
          enabled: config.paidEnabled === true, operations: ['refine'], provider: 'openai',
          profile: config.profile, quota: repo.quota(owner.ownerId), serverTime: now(),
        })
      }

      if (route.name === 'jobs' && req.method === 'GET') {
        return sendJson(res, 200, repo.list(owner.ownerId, { limit: 50 }).map(publicJob))
      }

      if (route.name === 'jobs') {
        requireMethod(req.method, ['POST'])
        const requestId = req.headers['idempotency-key']
        if (typeof requestId !== 'string' || requestId.length > 128) throw imageJobError('invalid_request_id', 400)
        const { issuedAt } = parseRequestId(requestId)
        const { request, sourceBytes } = await readBoundedMultipart(req, {
          deadlineMs: config.uploadTimeoutMs, maxBytes: LIMITS.maxBodyBytes,
        })
        const requestHash = hashRequest(request, sourceBytes)
        const known = repo.findRequest(owner.ownerId, requestId)
        if (known) {
          if (known.requestHash !== requestHash) throw imageJobError('idempotency_conflict', 409)
          if (known.state === 'expired' || (known.expiresAt && Date.parse(known.expiresAt) <= now())) {
            throw imageJobError('request_expired', 410, admittedAt)
          }
          return sendJson(res, 202, publicJob(known))
        }
        if (admittedAt - issuedAt > LIMITS.requestMaxAgeMs) {
          throw imageJobError('request_expired', 410, admittedAt)
        }
        if (issuedAt - admittedAt > LIMITS.requestFutureSkewMs) {
          throw imageJobError('key_clock_skew', 400, admittedAt)
        }
        if (config.paidEnabled !== true) throw imageJobError('relay_disabled', 503)
        if (request.profileId !== config.profile.id) throw imageJobError('invalid_profile', 400)
        const quota = repo.quota(owner.ownerId)
        if (quota.active >= LIMITS.maxActiveJobs) throw imageJobError('active_quota_exceeded', 429)
        if (!quota.dailyRemaining) throw imageJobError('daily_quota_exceeded', 429)
        const normalized = await normalizeImage(sourceBytes)
        const id = randomUUID()
        let inputRef
        try {
          inputRef = await spool.writeInput(id, normalized.bytes)
        } catch {
          try { await spool.removeInput(id) } catch { /* Periodic sweep removes residue. */ }
          throw imageJobError('storage_unavailable', 500)
        }
        try {
          const accepted = repo.accept({
            id, ownerId: owner.ownerId, requestId, requestHash,
            sourceImageDigest: normalized.digest, request, profile: config.profile,
            inputRef, admittedAt,
          })
          if (accepted.id !== id) await spool.removeInput(id)
          return sendJson(res, 202, publicJob(accepted))
        } catch (error) {
          try { await spool.removeInput(id) } catch { safeLog({ code: 'input_cleanup_failed' }) }
          throw error
        }
      }

      if (route.name === 'job') {
        if (req.method === 'GET') return sendJson(res, 200, publicJob(getOwned(repo, owner.ownerId, route.jobId)))
        if (req.method === 'DELETE') {
          const job = repo.cancelOrDiscard(owner.ownerId, route.jobId)
          await bestEffortCleanup(spool, repo, route.jobId, safeLog)
          return sendJson(res, 200, publicJob(job))
        }
        throw imageJobError('method_not_allowed', 405)
      }

      if (route.name === 'result') {
        requireMethod(req.method, ['GET'])
        const job = getOwned(repo, owner.ownerId, route.jobId)
        if (job.acknowledgedAt || job.state === 'expired' || (job.expiresAt && Date.parse(job.expiresAt) <= now())) {
          throw imageJobError('result_expired', 410)
        }
        if (job.state !== 'succeeded') throw imageJobError('job_conflict', 409)
        const output = await spool.readOutput(job.id)
        const current = getOwned(repo, owner.ownerId, job.id)
        if (current.acknowledgedAt || current.state === 'expired'
            || (current.expiresAt && Date.parse(current.expiresAt) <= now())) {
          throw imageJobError('result_expired', 410)
        }
        if (current.state !== 'succeeded') throw imageJobError('job_conflict', 409)
        if (!output || !current.result || output.digest !== current.result.digest
            || output.size !== current.result.size || output.mime !== current.result.mime
            || output.completedAt !== current.completedAt) {
          throw imageJobError('result_unavailable', 410)
        }
        res.writeHead(200, {
          'Content-Type': output.mime, 'Content-Length': output.size,
          'X-Image-Digest': output.digest,
        })
        return res.end(output.bytes)
      }

      if (route.name === 'ack') {
        requireMethod(req.method, ['POST'])
        const job = repo.ack(owner.ownerId, route.jobId)
        await bestEffortCleanup(spool, repo, route.jobId, safeLog)
        return sendJson(res, 200, publicJob(job))
      }
      throw imageJobError('endpoint_not_found', 404)
    } catch (rawError) {
      const error = safeError(rawError)
      errorCode = error.code
      const payload = { code: error.code, status: error.status }
      if (Number.isSafeInteger(error.serverTime)) payload.serverTime = error.serverTime
      if (!req.complete && !res.headersSent) res.setHeader('Connection', 'close')
      if (!res.headersSent) sendJson(res, error.status, payload)
      else res.destroy()
      if (!req.complete) {
        res.once('finish', () => req.destroy())
      }
    } finally {
      const event = { event: 'http_request', durationMs: Math.max(0, now() - startedAt) }
      if (owner) event.owner = ownerCorrelation(owner.ownerId)
      if (route?.jobId) event.jobId = route.jobId
      if (errorCode) event.code = errorCode
      safeLog(event)
    }
  })
  server.maxConnections = 32
  server.maxRequestsPerSocket = 100
  server.on('clientError', (error, socket) => {
    const status = error?.code === 'HPE_HEADER_OVERFLOW' ? 431 : 400
    const code = status === 431 ? 'headers_too_large' : 'invalid_http'
    if (socket.writable) socket.end(`HTTP/1.1 ${status} Error\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ code, status })}`)
  })
  return server
}
