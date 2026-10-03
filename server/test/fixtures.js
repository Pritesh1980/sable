import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose'

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
