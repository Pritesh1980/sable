import { isAbsolute } from 'node:path'
import { isIP } from 'node:net'
import { imageJobError } from '../../shared/imageJobs.js'

/** @typedef {{dataDir:string,origins:readonly string[],ownerId:string,issuer:string,
 * audience:string,algorithm:'ES256'|'RS256',jwksUrl:string,paidEnabled:boolean,
 * providerKey:string|undefined,profile:{id:string,model:string,size:string,
 * quality:string,outputFormat:string},uploadTimeoutMs:number,providerTimeoutMs:number,
 * host:string,port:number}} RelayConfig */

const PROFILE = Object.freeze({
  id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst',
  size: '1024x1024', quality: 'medium', outputFormat: 'png',
})

function invalidConfig() {
  throw imageJobError('invalid_config', 500)
}

function exactText(value, max = 2048) {
  return typeof value === 'string' && value.length > 0 && value.length <= max
    && value.trim() === value && !/[\s\x00-\x1f\x7f]/u.test(value) // eslint-disable-line no-control-regex
}

function parseUrl(value) {
  if (!exactText(value)) invalidConfig()
  try { return new URL(value) } catch { invalidConfig() }
}

/** Shared by config loading and the verifier so injected resolvers cannot relax auth. */
export function ownerJwksUrl({ issuer, audience, algorithm, ownerId }) {
  const url = parseUrl(issuer)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
      || url.pathname !== '/auth/v1' || url.href !== issuer
      || !exactText(ownerId, 128) || audience !== 'authenticated'
      || !['ES256', 'RS256'].includes(algorithm)) invalidConfig()
  return `${issuer}/.well-known/jwks.json`
}

function readOrigins(value) {
  if (typeof value !== 'string' || value.length > 8192) invalidConfig()
  const origins = value.split(',')
  if (!origins.length || origins.length > 16 || new Set(origins).size !== origins.length) invalidConfig()
  for (const origin of origins) {
    const url = parseUrl(origin)
    const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.origin !== origin || origin.includes('*') || (!localHttp && url.protocol !== 'https:')) invalidConfig()
  }
  return Object.freeze(origins)
}

function integer(value, fallback, max) {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) invalidConfig()
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number > max) invalidConfig()
  return number
}

/** Fail closed before startup; no secrets or supplied config values in errors. @returns {RelayConfig} */
export function readRelayConfig(env = process.env) {
  const ownerId = env.RELAY_OWNER_ID
  const issuer = env.RELAY_ISSUER
  const audience = env.RELAY_AUDIENCE
  const algorithm = env.RELAY_ALGORITHM
  const jwksUrl = ownerJwksUrl({ ownerId, issuer, audience, algorithm })
  const dataDir = env.RELAY_DATA_DIR
  if (!exactText(dataDir) || !isAbsolute(dataDir)) invalidConfig()
  const origins = readOrigins(env.RELAY_ORIGINS)
  if (env.RELAY_JWKS_URL !== undefined && env.RELAY_JWKS_URL !== jwksUrl) invalidConfig()
  if (env.RELAY_MODEL !== undefined && env.RELAY_MODEL !== PROFILE.model) invalidConfig()
  if (env.RELAY_PROFILE_ID !== undefined && env.RELAY_PROFILE_ID !== PROFILE.id) invalidConfig()
  const paidSetting = env.RELAY_PAID_ENABLED
  if (paidSetting !== undefined && paidSetting !== 'true' && paidSetting !== 'false') invalidConfig()
  const paidEnabled = paidSetting === 'true'
  const providerKey = env.RELAY_OPENAI_API_KEY || undefined
  if ((providerKey !== undefined && !exactText(providerKey, 4096)) || (paidEnabled && !providerKey)) invalidConfig()
  const host = env.RELAY_HOST ?? '127.0.0.1'
  if (typeof host !== 'string' || !isIP(host)) invalidConfig()
  return Object.freeze({
    dataDir, origins, ownerId, issuer, audience, algorithm, jwksUrl, paidEnabled, providerKey,
    profile: PROFILE, host, port: integer(env.RELAY_PORT, 8787, 65535),
    uploadTimeoutMs: integer(env.RELAY_UPLOAD_TIMEOUT_MS, 30000, 30000),
    providerTimeoutMs: integer(env.RELAY_PROVIDER_TIMEOUT_MS, 120000, 120000),
  })
}
