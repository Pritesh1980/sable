import { describe, expect, it } from 'vitest'
import {
  canonicalRequest, compileRefinementPrompt, createRequestId, imageJobError,
  JOB_STATES, LIMITS, parseRequestId, validateRefinementRequest, variantIdForJob,
} from '../../shared/imageJobs.js'

const UUID = '12345678-1234-4123-8123-123456789abc'
const NOW = 1790636400000
const fields = { change: 'Add a raven', keep: 'Keep the ink texture', palette: 'black' }
const request = {
  version: 1, operation: 'refine', profileId: 'openai-refine-v1', ...fields,
  prompt: 'Create one original tattoo-concept variation from the attached source image.\n\nChange:\nAdd a raven\n\nPreserve:\nKeep the ink texture\n\nPalette: black ink.\n\nThis is inspiration for discussion with an artist, not a tattoo-ready stencil.',
}

it('preserves the exact instruction text while canonicalizing field order', () => {
  const fields = { change: 'પ્રીતેશ — プリテシュ 🖋️', keep: 'Keep the ink texture', palette: 'colour' }
  const request = { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
    ...fields, prompt: compileRefinementPrompt(fields) }
  expect(request.prompt).toContain(fields.change)
  expect(canonicalRequest(request)).toBe(canonicalRequest(Object.fromEntries(Object.entries(request).reverse())))
})

describe('refinement wire requests', () => {
  it('compiles the displayed instructions verbatim without banning requested text', () => {
    expect(compileRefinementPrompt(fields)).toBe(request.prompt)
    const prompt = compileRefinementPrompt({ change: '  Letter “પ્રીતેશ”\n🖋️  ', keep: '\t e\u0301\n', palette: 'colour' })
    expect(prompt).toContain('Change:\n  Letter “પ્રીતેશ”\n🖋️  ')
    expect(prompt).toContain('Preserve:\n\t e\u0301\n')
    expect(prompt).toContain('Palette: colour is allowed.')
    expect(prompt).not.toMatch(/no text|no lettering/i)
  })

  it('returns a fresh fixed-order wire object and exact canonical JSON', () => {
    const reversed = Object.fromEntries(Object.entries(request).reverse())
    const result = validateRefinementRequest(reversed)
    expect(result).toEqual(request)
    expect(result).not.toBe(reversed)
    expect(Object.keys(result)).toEqual(['version', 'operation', 'profileId', 'change', 'keep', 'palette', 'prompt'])
    expect(canonicalRequest(reversed)).toBe(JSON.stringify(request))
  })

  it.each([
    ['wrong version', { version: 2 }], ['string version', { version: '1' }],
    ['generate operation', { operation: 'generate' }], ['missing operation', { operation: undefined }],
    ['unknown property', { sourceUrl: 'https://example.test/private.png' }],
    ['empty profile', { profileId: '' }], ['uppercase profile', { profileId: 'OpenAI-refine-v1' }],
    ['profile punctuation', { profileId: '../private' }], ['profile whitespace', { profileId: ' profile' }],
    ['oversized profile', { profileId: 'a'.repeat(65) }], ['nonstring profile', { profileId: 1 }],
    ['nonstring change', { change: 1 }], ['empty change', { change: '' }], ['blank change', { change: ' \n\t ' }],
    ['nonstring keep', { keep: null }], ['wrong palette', { palette: 'color' }],
    ['nonstring palette', { palette: false }], ['nonstring prompt', { prompt: [] }],
    ['mismatched prompt', { prompt: 'raw provider content' }],
  ])('rejects %s without exposing input', (_, patch) => {
    for (const validate of [validateRefinementRequest, canonicalRequest]) {
      expect(() => validate({ ...request, ...patch })).toThrow('invalid_request')
    }
  })

  it.each([null, undefined, [], 'request', 1])('rejects non-object input %s', value => {
    expect(() => validateRefinementRequest(value)).toThrow('invalid_request')
  })

  it('rejects missing fields and hidden or symbol extras', () => {
    for (const key of Object.keys(request)) {
      const incomplete = { ...request }
      delete incomplete[key]
      expect(() => validateRefinementRequest(incomplete)).toThrow('invalid_request')
    }
    expect(() => validateRefinementRequest(Object.defineProperty({ ...request }, 'secret', { value: 'private' }))).toThrow('invalid_request')
    expect(() => validateRefinementRequest({ ...request, [Symbol('secret')]: 'private' })).toThrow('invalid_request')
  })

  it('allows a bounded replacement profile slug for durable replay', () => {
    expect(validateRefinementRequest({ ...request, profileId: 'future-profile-2' }).profileId).toBe('future-profile-2')
    expect(validateRefinementRequest({ ...request, profileId: 'a'.repeat(64) }).profileId).toHaveLength(64)
  })

  it('accepts empty Preserve and exactly 4000 instruction units, rejecting one more', () => {
    const boundary = { change: 'a'.repeat(2000), keep: 'b'.repeat(2000), palette: 'black' }
    expect(validateRefinementRequest({ ...request, ...boundary, prompt: compileRefinementPrompt(boundary) }).change).toHaveLength(2000)
    const tooLong = { ...boundary, keep: `${boundary.keep}c` }
    expect(() => validateRefinementRequest({ ...request, ...tooLong, prompt: compileRefinementPrompt(tooLong) })).toThrow('invalid_request')
    const emptyKeep = { ...fields, keep: '' }
    expect(validateRefinementRequest({ ...request, ...emptyKeep, prompt: compileRefinementPrompt(emptyKeep) }).keep).toBe('')
    expect(LIMITS.maxInstructionChars).toBe(4000)
  })

  it('counts astral characters as UTF-16 units without changing their text', () => {
    const boundary = { change: '🖋'.repeat(2000), keep: '', palette: 'colour' }
    expect(validateRefinementRequest({ ...request, ...boundary, prompt: compileRefinementPrompt(boundary) }).change).toBe(boundary.change)
    const tooLong = { ...boundary, keep: 'x' }
    expect(() => validateRefinementRequest({ ...request, ...tooLong, prompt: compileRefinementPrompt(tooLong) })).toThrow('invalid_request')
  })
})

describe('canonical request and variant identifiers', () => {
  it('round-trips canonical request IDs and derives one stable variant ID per job', () => {
    expect(createRequestId(NOW, UUID)).toBe(`v1.1790636400000.${UUID}`)
    expect(parseRequestId(`v1.1790636400000.${UUID}`)).toEqual({ issuedAt: NOW, nonce: UUID })
    expect(createRequestId(0, UUID)).toBe(`v1.0.${UUID}`)
    expect(variantIdForJob(UUID)).toBe(`relay:${UUID}`)
  })

  it.each([
    UUID.toUpperCase(), '12345678123441238123123456789abc',
    '12345678-1234-0123-8123-123456789abc', '12345678-1234-9123-8123-123456789abc',
    '12345678-1234-4123-7123-123456789abc', '00000000-0000-0000-0000-000000000000',
    `${UUID}\n`, ` ${UUID}`, null, 123,
  ])('rejects invalid or noncanonical UUID %s in both keys and variant IDs', value => {
    expect(() => createRequestId(NOW, value)).toThrow('invalid_request_id')
    expect(() => parseRequestId(`v1.${NOW}.${value}`)).toThrow('invalid_request_id')
    expect(() => variantIdForJob(value)).toThrow('invalid_job_id')
  })

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, 8640000000000001, '1790636400000', null])('rejects invalid timestamp %s', value => {
    expect(() => createRequestId(value, UUID)).toThrow('invalid_request_id')
  })

  it.each(['01', '-1', '+1', '1.5', '1e3', '', 'Infinity', '9007199254740992', '8640000000000001', ' 1'])('rejects noncanonical timestamp %s on the wire', value => {
    expect(() => parseRequestId(`v1.${value}.${UUID}`)).toThrow('invalid_request_id')
  })

  it.each([`v2.${NOW}.${UUID}`, `v1.${NOW}.${UUID}.extra`, `v1.${NOW}.${UUID}\n`, null, 1])('rejects malformed request ID %s', value => {
    expect(() => parseRequestId(value)).toThrow('invalid_request_id')
  })
})

describe('safe errors and shared policy', () => {
  it('creates safe structured errors with optional clock calibration', () => {
    const error = imageJobError('key_clock_skew', 409, NOW)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('key_clock_skew')
    expect(error).toMatchObject({ code: 'key_clock_skew', status: 409, serverTime: NOW })
    expect(imageJobError('invalid_request', 400)).not.toHaveProperty('serverTime')
    expect(imageJobError('unavailable', 599, 0)).toMatchObject({ status: 599, serverTime: 0 })
  })

  it.each(['', 'Raw provider: secret', 'UPPERCASE', 'a'.repeat(65), 'bad-code', 'bad\n', null, 1])('rejects unsafe error code %s without leaking it', value => {
    expect(() => imageJobError(value, 400)).toThrow('invalid_error')
  })

  it.each([200, 399, 600, 400.5, '400', NaN, Infinity])('rejects invalid error status %s', value => {
    expect(() => imageJobError('invalid_request', value)).toThrow('invalid_error')
  })

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null])('rejects invalid server time %s', value => {
    expect(() => imageJobError('key_clock_skew', 409, value)).toThrow('invalid_error')
  })

  it('exposes immutable limits and the documented lifecycle for both consumers', () => {
    expect(Object.isFrozen(LIMITS)).toBe(true)
    expect(Object.isFrozen(JOB_STATES)).toBe(true)
    expect(JOB_STATES).toEqual(['accepted', 'dispatching', 'running', 'succeeded', 'failed', 'outcome_unknown', 'expired', 'cancelled'])
    expect(LIMITS).toMatchObject({
      maxActiveJobs: 1, maxDailyJobs: 10, maxSourceImages: 1,
      maxBodyBytes: 8388608, maxImagePixels: 16000000,
      requestMaxAgeMs: 300000, requestFutureSkewMs: 30000,
      inputRetentionMs: 86400000, outputRetentionMs: 86400000, tombstoneRetentionMs: 604800000,
    })
  })
})
