import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileRefinementPrompt } from '../../shared/imageJobs.js'

export async function makeDiskFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'sable-relay-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  return { dir, dbPath: join(dir, 'jobs.sqlite'), spoolDir: join(dir, 'spool') }
}

/** Complete acceptance input; only the repository clock/admission test overrides time. */
export function makeJobInput(overrides = {}) {
  const admittedAt = overrides.admittedAt ?? 1_800_000_000_000
  const fields = { change: 'Add mist', keep: 'Temple', palette: 'black' }
  return {
    id: crypto.randomUUID(), ownerId: 'A',
    requestId: `v1.${admittedAt}.${crypto.randomUUID()}`,
    requestHash: 'a'.repeat(64), sourceImageDigest: 'b'.repeat(64),
    inputRef: 'internal-input', admittedAt,
    request: { version: 1, operation: 'refine', profileId: 'openai-refine-v1',
      ...fields, prompt: compileRefinementPrompt(fields) },
    profile: { id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst',
      size: '1024x1024', quality: 'medium', outputFormat: 'png' },
    ...overrides,
  }
}

/** Generated, local-only keys. Undefined claim overrides deliberately omit claims. */
export async function makeJwtFixture({ algorithm = 'ES256' } = {}) {
  const { privateKey, publicKey } = await generateKeyPair(algorithm)
  const publicJwk = { ...await exportJWK(publicKey), kid: crypto.randomUUID(), alg: algorithm }
  const ownerId = '831b7b2a-b8f6-4aa1-8db5-3a028252a8fe'
  const issuer = 'https://relay-test.supabase.co/auth/v1'
  const audience = 'authenticated'
  return {
    ownerId, issuer, audience, algorithm, publicJwk,
    keyResolver: createLocalJWKSet({ keys: [publicJwk] }),
    async issue(overrides = {}, header = {}) {
      const now = Math.floor(Date.now() / 1000)
      return new SignJWT({
        sub: ownerId, iss: issuer, aud: audience, iat: now, exp: now + 900,
        role: 'authenticated', is_anonymous: false, ...overrides,
      }).setProtectedHeader({ alg: algorithm, kid: publicJwk.kid, ...header }).sign(privateKey)
    },
  }
}

export function relayEnv(overrides = {}) {
  return {
    RELAY_DATA_DIR: '/tmp/sable-relay-test',
    RELAY_OWNER_ID: '831b7b2a-b8f6-4aa1-8db5-3a028252a8fe',
    RELAY_ISSUER: 'https://relay-test.supabase.co/auth/v1',
    RELAY_AUDIENCE: 'authenticated',
    RELAY_ALGORITHM: 'ES256',
    RELAY_ORIGINS: 'https://sable.example,http://localhost:5173',
    ...overrides,
  }
}
