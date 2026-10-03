import { createRemoteJWKSet, jwtVerify } from 'jose'
import { imageJobError } from '../../shared/imageJobs.js'
import { ownerJwksUrl } from './config.js'

// Token URLs (jku/x5u/iss) never select the trust source. The injected resolver is
// solely an internal test seam; production uses this fixed, bounded remote JWKS.
export function createOwnerVerifier({ issuer, audience, algorithm, ownerId, keyResolver }) {
  const jwksUrl = ownerJwksUrl({ issuer, audience, algorithm, ownerId })
  const resolveKey = keyResolver ?? createRemoteJWKSet(new URL(jwksUrl), {
    cacheMaxAge: 600_000, cooldownDuration: 30_000, timeoutDuration: 5_000,
  })
  return async function verifyOwner({ authorization } = {}) {
    if (typeof authorization !== 'string' || authorization.length > 8192
        || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(authorization)
        || authorization.includes('\n') || authorization.includes('\r')) {
      throw imageJobError('invalid_token', 401)
    }
    let payload
    try {
      ;({ payload } = await jwtVerify(authorization.slice(7), resolveKey, {
        issuer, audience, algorithms: [algorithm], requiredClaims: ['sub', 'iat', 'exp'],
        clockTolerance: 0,
      }))
    } catch {
      // Includes unavailable/empty/rotating JWKS. Never expose JOSE/network text.
      throw imageJobError('invalid_token', 401)
    }
    if (payload.sub !== ownerId || payload.role !== 'authenticated' || payload.is_anonymous === true) {
      throw imageJobError('forbidden_owner', 403)
    }
    if (payload.aud !== audience || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.iat < 0 || payload.exp <= payload.iat || payload.exp - payload.iat > 900
        || payload.iat > Math.floor(Date.now() / 1000)) {
      throw imageJobError('invalid_token', 401)
    }
    return { ownerId }
  }
}
