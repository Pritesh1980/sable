import { canonicalRequest, imageJobError, JOB_STATES, LIMITS, parseRequestId,
  validateRefinementRequest, variantIdForJob } from '../../../shared/imageJobs'

const JSON_LIMIT = 1024 * 1024
const JOB_FIELDS = ['id', 'requestId', 'state', 'createdAt', 'completedAt', 'expiresAt',
  'errorCode', 'sourceImageDigest', 'request', 'generation']
const GENERATION_FIELDS = ['version', 'jobId', 'provider', 'model', 'profileId', 'createdAt', 'provenance']
const SAFE_CODES = new Set(['unauthorized', 'owner_forbidden', 'origin_forbidden', 'relay_disabled',
  'invalid_request', 'invalid_request_id', 'invalid_profile', 'request_expired', 'key_clock_skew',
  'idempotency_conflict', 'active_quota_exceeded', 'daily_quota_exceeded', 'job_not_found',
  'job_conflict', 'result_expired', 'result_unavailable', 'storage_unavailable', 'provider_failed',
  'provider_unavailable', 'outcome_unknown', 'invalid_image', 'image_too_large', 'body_too_large',
  'upload_timeout', 'internal_error'])
const CLIENT_CODES = new Set([...SAFE_CODES, 'auth_unavailable', 'relay_invalid_response',
  'relay_error', 'relay_unavailable', 'acceptance_unknown', 'invalid_source', 'result_digest_mismatch'])
const fail = (code, status = 502, serverTime) => imageJobError(code, status, serverTime)
const exact = (value, fields) => value && typeof value === 'object' && !Array.isArray(value)
  && Reflect.ownKeys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key))
const matches = (pattern, value) => typeof value === 'string' && pattern.exec(value)?.[0] === value
const digestValid = value => matches(/^[a-f0-9]{64}$/u, value)
const identifier = value => matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/u, value)
const isoDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
const epoch = value => Number.isSafeInteger(value) && value >= 0 && value <= 8_640_000_000_000_000

function checkJob(input) {
  try {
    if (!exact(input, JOB_FIELDS)) throw new Error()
    variantIdForJob(input.id)
    parseRequestId(input.requestId)
    const generation = input.generation
    if (!JOB_STATES.includes(input.state) || !isoDate(input.createdAt)
        || !(input.completedAt === null || isoDate(input.completedAt))
        || !(input.expiresAt === null || isoDate(input.expiresAt))
        || !(input.errorCode === null || SAFE_CODES.has(input.errorCode))
        || !digestValid(input.sourceImageDigest) || !exact(generation, GENERATION_FIELDS)
        || generation.version !== 1 || generation.jobId !== input.id || generation.provider !== 'openai'
        || generation.provenance !== 'relay' || generation.profileId !== 'openai-refine-v1'
        || !identifier(generation.model) || !isoDate(generation.createdAt)
        || (input.state === 'succeeded' && !isoDate(input.completedAt))) throw new Error()
    const request = input.request === null ? null : validateRefinementRequest(input.request)
    if (request && request.profileId !== generation.profileId) throw new Error()
    return { ...input, request, generation: { ...generation } }
  } catch { throw fail('relay_invalid_response') }
}

function checkCapabilities(input) {
  const profile = input?.profile
  const quota = input?.quota
  if (!exact(input, ['enabled', 'operations', 'provider', 'profile', 'quota', 'serverTime'])
      || typeof input.enabled !== 'boolean' || !Array.isArray(input.operations)
      || input.operations.length !== 1 || input.operations[0] !== 'refine' || input.provider !== 'openai'
      || !exact(profile, ['id', 'model', 'size', 'quality', 'outputFormat'])
      || profile.id !== 'openai-refine-v1' || !identifier(profile.model) || profile.size !== '1024x1024'
      || profile.quality !== 'medium' || profile.outputFormat !== 'png'
      || !exact(quota, ['active', 'dailyRemaining']) || !Number.isInteger(quota.active)
      || quota.active < 0 || quota.active > LIMITS.maxActiveJobs || !Number.isInteger(quota.dailyRemaining)
      || quota.dailyRemaining < 0 || quota.dailyRemaining > LIMITS.maxDailyJobs || !epoch(input.serverTime)) {
    throw fail('relay_invalid_response')
  }
  return { ...input, operations: [...input.operations], profile: { ...profile }, quota: { ...quota } }
}

function configuredBase(value) {
  try {
    if (typeof value !== 'string' || !value || value.trim() !== value) return null
    const url = new URL(value)
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if ((!local && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash
        || url.pathname !== '/') return null
    return url.origin
  } catch { return null }
}

async function readBytes(response, max, signal) {
  const length = response.headers.get('Content-Length')
  if (length !== null && (!matches(/^(?:0|[1-9][0-9]*)$/u, length) || Number(length) > max)) {
    await response.body?.cancel().catch(() => {})
    throw fail('relay_invalid_response')
  }
  if (!response.body) throw fail('relay_invalid_response')
  const reader = response.body.getReader()
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const chunks = []
  let size = 0
  try {
    while (true) {
      if (signal.aborted) throw fail('relay_unavailable')
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { cancel(); throw fail('relay_invalid_response') }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let at = 0
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength }
    return bytes
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock() }
}

async function readJson(response, signal) {
  if (response.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    await response.body?.cancel().catch(() => {})
    throw fail('relay_invalid_response')
  }
  const bytes = await readBytes(response, JSON_LIMIT, signal)
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  catch { throw fail('relay_invalid_response') }
}

/** No keys/models supplied by callers; all endpoints belong to one configured relay. */
export function createRelayClient({ baseUrl, auth, fetchImpl = globalThis.fetch, now = Date.now }) {
  const base = configuredBase(baseUrl)
  let clockOffset = 0
  const disabled = () => ({ enabled: false, operations: [], provider: null, profile: null,
    quota: null, serverTime: now() })

  async function token(forceRefresh) {
    try {
      const value = forceRefresh ? await auth?.getAccessToken?.({ forceRefresh: true })
        : await auth?.getAccessToken?.()
      if (value === null || value === undefined) return null
      if (typeof value !== 'string' || !value || /[\s\x00-\x1f\x7f]/u.test(value)) { // eslint-disable-line no-control-regex
        throw new Error()
      }
      return value
    } catch { throw fail('auth_unavailable', 401) }
  }

  async function call(path, { method = 'GET', body, headers = {}, parse = readJson,
    offlineDisabled = false, submission = false } = {}) {
    if (!base) {
      if (offlineDisabled) return disabled()
      throw fail('relay_disabled', 503)
    }
    let bearer = await token(false)
    if (!bearer) {
      if (offlineDisabled) return disabled()
      throw fail('relay_disabled', 503)
    }
    const controller = new AbortController()
    let timedOut = false
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true
        controller.abort()
        reject(fail(submission ? 'acceptance_unknown' : 'relay_unavailable', 503))
      }, 30_000)
    })
    const operation = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (controller.signal.aborted) throw fail('relay_unavailable', 503)
        const started = now()
        let response
        let outbound
        try { outbound = body?.() } catch { throw fail('invalid_source', 400) }
        try {
          response = await fetchImpl(`${base}${path}`, { method,
            headers: { ...headers, Authorization: `Bearer ${bearer}` }, body: outbound,
            cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal })
        } catch { throw fail(submission ? 'acceptance_unknown' : 'relay_unavailable', 503) }
        if (response.status === 401 && attempt === 0) {
          await response.body?.cancel().catch(() => {})
          bearer = await token(true)
          if (!bearer) throw fail('auth_unavailable', 401)
          continue
        }
        if (!response.ok) {
          let value
          try { value = await readJson(response, controller.signal) } catch { throw fail('relay_error') }
          const code = SAFE_CODES.has(value?.code) ? value.code : 'relay_error'
          const time = epoch(value?.serverTime) ? value.serverTime : undefined
          if (code === 'key_clock_skew' && time !== undefined) clockOffset = time - (started + now()) / 2
          throw fail(code, response.status >= 400 && response.status <= 599 ? response.status : 502, time)
        }
        const value = await parse(response, controller.signal)
        if (path === '/v1/image-capabilities') {
          const caps = checkCapabilities(value)
          clockOffset = caps.serverTime - (started + now()) / 2
          return caps
        }
        return value
      }
    }
    try { return await Promise.race([operation(), timeout]) }
    catch (error) {
      if (error?.message === error?.code && CLIENT_CODES.has(error.code)) throw error
      throw fail(submission ? 'acceptance_unknown' : 'relay_unavailable', 503)
    }
    finally { clearTimeout(timer); if (timedOut) controller.abort() }
  }

  const jobPath = jobId => { variantIdForJob(jobId); return `/v1/image-jobs/${jobId}` }
  const jobJson = async (response, signal) => checkJob(await readJson(response, signal))
  const matchingJob = jobId => async (response, signal) => {
    const job = await jobJson(response, signal)
    if (job.id !== jobId) throw fail('relay_invalid_response')
    return job
  }
  return {
    capabilities: () => call('/v1/image-capabilities', { offlineDisabled: true }),
    serverNow: () => Math.round(now() + clockOffset),
    async submit(pending) {
      if (pending?.accepted || pending?.jobId) throw fail('job_already_accepted', 409)
      parseRequestId(pending?.requestId)
      const requestId = pending.requestId
      const request = canonicalRequest(pending.request)
      const source = pending.source
      if (Object.prototype.toString.call(source) !== '[object Blob]' || source.type !== 'image/png'
          || source.size < 1 || source.size > LIMITS.maxBodyBytes) throw fail('invalid_source', 400)
      return call('/v1/image-jobs', { method: 'POST', submission: true,
        headers: { 'Idempotency-Key': requestId }, parse: async (response, signal) => {
          const job = await jobJson(response, signal)
          if (job.requestId !== requestId || (job.request && canonicalRequest(job.request) !== request)) {
            throw fail('relay_invalid_response')
          }
          return job
        }, body: () => {
          const form = new FormData()
          form.set('request', request)
          form.set('image', source, 'source.png')
          return form
        } })
    },
    list: () => call('/v1/image-jobs', { parse: async (response, signal) => {
      const rows = await readJson(response, signal)
      if (!Array.isArray(rows) || rows.length > 50) throw fail('relay_invalid_response')
      return rows.map(checkJob)
    } }),
    status: async jobId => call(jobPath(jobId), { parse: matchingJob(jobId) }),
    ack: async jobId => call(`${jobPath(jobId)}/ack`, { method: 'POST', parse: matchingJob(jobId) }),
    discard: async jobId => call(jobPath(jobId), { method: 'DELETE', parse: matchingJob(jobId) }),
    result: async jobId => call(`${jobPath(jobId)}/result`, { parse: async (response, signal) => {
      const digest = response.headers.get('X-Image-Digest')
      if (response.headers.get('Content-Type') !== 'image/png' || !digestValid(digest)) {
        await response.body?.cancel().catch(() => {})
        throw fail('relay_invalid_response')
      }
      const bytes = await readBytes(response, LIMITS.maxBodyBytes, signal)
      if (bytes.length < 8 || ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)) {
        throw fail('relay_invalid_response')
      }
      const actual = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
        byte => byte.toString(16).padStart(2, '0')).join('')
      if (actual !== digest) throw fail('result_digest_mismatch')
      return { blob: new Blob([bytes], { type: 'image/png' }), digest }
    } }),
  }
}
