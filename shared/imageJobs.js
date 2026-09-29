/** @typedef {{version:1, operation:'refine', profileId:string,
 * change:string, keep:string, palette:'black'|'colour', prompt:string}} RefinementRequest */
/** @typedef {{ownerId:string, conceptId:string, parentVariantId:string|null,
 * draftRevision:number}} RefinementDestination */
/** @typedef {{id:string, requestId:string, state:string, createdAt:string,
 * completedAt:string|null, expiresAt:string|null, errorCode:string|null,
 * sourceImageDigest:string, request:RefinementRequest|null,
 * generation:{version:1,jobId:string,provider:'openai',model:string,
 * profileId:string,createdAt:string,provenance:'relay'}} PublicImageJob */
/** @typedef {{requestId:string, ownerId:string, source:Blob|null,
 * sourceImageDigest:string, request:RefinementRequest,
 * destination:RefinementDestination, createdAt:number,
 * jobId:string|null, accepted:boolean}} PendingImageJob */
/** @typedef {{ownerId:string,conceptId:string,variantId:string,
 * imageKey:string,committed:true}} ConceptCommitReceipt */
/** @typedef {{enabled:boolean,operations:string[],provider:string,
 * profile:{id:string,model:string,size:string,quality:string,outputFormat:string},
 * quota:{active:number,dailyRemaining:number},serverTime:number}} ImageCapabilities */

export const LIMITS = Object.freeze({
  maxActiveJobs: 1,
  maxDailyJobs: 10,
  maxSourceImages: 1,
  maxInstructionChars: 4000,
  maxBodyBytes: 8 * 1024 * 1024,
  maxImagePixels: 16_000_000,
  requestMaxAgeMs: 5 * 60 * 1000,
  requestFutureSkewMs: 30 * 1000,
  inputRetentionMs: 24 * 60 * 60 * 1000,
  outputRetentionMs: 24 * 60 * 60 * 1000,
  tombstoneRetentionMs: 7 * 24 * 60 * 60 * 1000,
})

export const JOB_STATES = Object.freeze([
  'accepted', 'dispatching', 'running', 'succeeded', 'failed',
  'outcome_unknown', 'expired', 'cancelled',
])

const REQUEST_FIELDS = ['version', 'operation', 'profileId', 'change', 'keep', 'palette', 'prompt']
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const PROFILE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/
const ERROR_PATTERN = /^[a-z][a-z0-9_]{0,63}$/
const TIMESTAMP_PATTERN = /^(?:0|[1-9][0-9]{0,15})$/
const MAX_DATE_MS = 8_640_000_000_000_000

// A JS `$` anchor also matches before a trailing newline; require the whole match.
function matchesExactly(pattern, value) {
  return typeof value === 'string' && pattern.exec(value)?.[0] === value
}

function validEpochMs(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_DATE_MS
}

/** Creates errors containing only safe machine codes, never raw provider details. */
export function imageJobError(code, status, serverTime) {
  if (!matchesExactly(ERROR_PATTERN, code) || !Number.isInteger(status) || status < 400 || status > 599
      || (serverTime !== undefined && (!Number.isSafeInteger(serverTime) || serverTime < 0))) {
    const error = new Error('invalid_error')
    error.code = 'invalid_error'
    error.status = 400
    throw error
  }
  const error = new Error(code)
  error.code = code
  error.status = status
  if (serverTime !== undefined) error.serverTime = serverTime
  return error
}

/** Preserve exact instructions, including Unicode, whitespace, and requested lettering. */
export function compileRefinementPrompt({ change, keep, palette }) {
  return [
    'Create one original tattoo-concept variation from the attached source image.',
    `Change:\n${change}`, `Preserve:\n${keep}`,
    palette === 'colour' ? 'Palette: colour is allowed.' : 'Palette: black ink.',
    'This is inspiration for discussion with an artist, not a tattoo-ready stencil.',
  ].join('\n\n')
}

/** @returns {RefinementRequest} */
export function validateRefinementRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    throw imageJobError('invalid_request', 400)
  }
  const keys = Reflect.ownKeys(input)
  if (keys.length !== REQUEST_FIELDS.length || keys.some(key => !REQUEST_FIELDS.includes(key))) {
    throw imageJobError('invalid_request', 400)
  }
  const { version, operation, profileId, change, keep, palette, prompt } = input
  if (version !== 1 || operation !== 'refine' || !matchesExactly(PROFILE_PATTERN, profileId)
      || typeof change !== 'string' || !change.trim() || typeof keep !== 'string'
      || change.length + keep.length > LIMITS.maxInstructionChars
      || !['black', 'colour'].includes(palette) || typeof prompt !== 'string'
      || prompt !== compileRefinementPrompt({ change, keep, palette })) {
    throw imageJobError('invalid_request', 400)
  }
  // Order is part of the hashing contract, independent of incoming JSON key order.
  return { version, operation, profileId, change, keep, palette, prompt }
}

export function canonicalRequest(input) {
  return JSON.stringify(validateRefinementRequest(input))
}

export function createRequestId(nowMs, nonce) {
  if (!validEpochMs(nowMs) || !matchesExactly(UUID_PATTERN, nonce)) {
    throw imageJobError('invalid_request_id', 400)
  }
  return `v1.${nowMs}.${nonce}`
}

export function parseRequestId(id) {
  if (typeof id !== 'string') throw imageJobError('invalid_request_id', 400)
  const parts = id.split('.')
  const [version, timestamp, nonce] = parts
  const issuedAt = Number(timestamp)
  if (parts.length !== 3 || version !== 'v1' || !matchesExactly(TIMESTAMP_PATTERN, timestamp)
      || !validEpochMs(issuedAt) || !matchesExactly(UUID_PATTERN, nonce)) {
    throw imageJobError('invalid_request_id', 400)
  }
  // Admission age/skew checks belong to the authenticated server boundary, not parsing.
  return { issuedAt, nonce }
}

export function variantIdForJob(jobId) {
  if (!matchesExactly(UUID_PATTERN, jobId)) throw imageJobError('invalid_job_id', 400)
  return `relay:${jobId}`
}
