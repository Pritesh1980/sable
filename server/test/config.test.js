import test from 'node:test'
import assert from 'node:assert/strict'
import { relayEnv } from './fixtures.js'
import { readRelayConfig } from '../src/config.js'

test('requires private identity and exact origins even with paid calls disabled', () => {
  for (const name of ['RELAY_DATA_DIR', 'RELAY_OWNER_ID', 'RELAY_ISSUER', 'RELAY_AUDIENCE', 'RELAY_ALGORITHM', 'RELAY_ORIGINS']) {
    for (const value of [undefined, '', ' ']) {
      assert.throws(() => readRelayConfig(relayEnv({ [name]: value })), { code: 'invalid_config' })
    }
  }
})

test('defaults to unpaid loopback with bounded timeouts and the frozen server profile', () => {
  const config = readRelayConfig(relayEnv())
  assert.equal(config.paidEnabled, false)
  assert.equal(config.providerKey, undefined)
  assert.equal(config.host, '127.0.0.1')
  assert.equal(config.port, 8787)
  assert.equal(config.uploadTimeoutMs, 30000)
  assert.equal(config.providerTimeoutMs, 120000)
  assert.equal(config.dataDir, '/tmp/sable-relay-test')
  assert.equal(config.ownerId, '831b7b2a-b8f6-4aa1-8db5-3a028252a8fe')
  assert.equal(config.issuer, 'https://relay-test.supabase.co/auth/v1')
  assert.equal(config.audience, 'authenticated')
  assert.equal(config.algorithm, 'ES256')
  assert.equal(config.jwksUrl, 'https://relay-test.supabase.co/auth/v1/.well-known/jwks.json')
  assert.deepEqual(config.origins, ['https://sable.example', 'http://localhost:5173'])
  assert.deepEqual(config.profile, {
    id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst', size: '1024x1024', quality: 'medium', outputFormat: 'png',
  })
  assert.ok(Object.isFrozen(config.profile))
  assert.ok(Object.isFrozen(config.origins))
})

test('only explicit true enables paid calls and then requires a provider key', () => {
  assert.throws(() => readRelayConfig(relayEnv({ RELAY_PAID_ENABLED: 'true' })), { code: 'invalid_config' })
  assert.equal(readRelayConfig(relayEnv({ RELAY_PAID_ENABLED: 'false' })).paidEnabled, false)
  const config = readRelayConfig(relayEnv({ RELAY_PAID_ENABLED: 'true', RELAY_OPENAI_API_KEY: 'test-only-key-not-live' }))
  assert.equal(config.paidEnabled, true)
  assert.equal(config.providerKey, 'test-only-key-not-live')
  for (const value of ['yes', '1', '', true]) {
    assert.throws(() => readRelayConfig(relayEnv({ RELAY_PAID_ENABLED: value })), { code: 'invalid_config' })
  }
})

test('rejects non-exact origins, insecure remote origins, malformed issuer and arbitrary JWKS/model', () => {
  for (const [name, values] of Object.entries({
    RELAY_ORIGINS: ['*', 'null', 'https://*.example', 'https://sable.example/', 'https://sable.example/path',
      'https://sable.example?q=1', 'https://user:pass@sable.example', 'http://remote.example',
      'https://sable.example,', 'https://sable.example,https://sable.example'],
    RELAY_ISSUER: ['http://relay-test.supabase.co/auth/v1', 'https://relay-test.supabase.co/auth/v1/',
      'https://relay-test.supabase.co/auth/v1?q=1', 'https://u:p@relay-test.supabase.co/auth/v1',
      'https://relay-test.supabase.co/other', ' https://relay-test.supabase.co/auth/v1'],
    RELAY_JWKS_URL: ['https://evil.example/keys', 'http://relay-test.supabase.co/auth/v1/.well-known/jwks.json'],
    RELAY_DATA_DIR: ['.data', '~/relay', 'relative/path'],
    RELAY_ALGORITHM: ['HS256', 'none', 'ES256,RS256'],
    RELAY_AUDIENCE: ['anon', '*'],
    RELAY_MODEL: ['arbitrary-model'],
    RELAY_PROFILE_ID: ['arbitrary-profile'],
    RELAY_OPENAI_API_KEY: [' ', 'key\nvalue'],
  })) {
    for (const value of values) {
      assert.throws(() => readRelayConfig(relayEnv({ [name]: value })), { code: 'invalid_config', message: 'invalid_config' }, name)
    }
  }
})

test('permits exact local development origins, alternate asymmetric signing and explicit bounds', () => {
  const config = readRelayConfig(relayEnv({ RELAY_ALGORITHM: 'RS256',
    RELAY_ORIGINS: 'http://127.0.0.1:5173,http://[::1]:5173', RELAY_HOST: '::1', RELAY_PORT: '8888',
    RELAY_UPLOAD_TIMEOUT_MS: '10000', RELAY_PROVIDER_TIMEOUT_MS: '60000',
    RELAY_JWKS_URL: 'https://relay-test.supabase.co/auth/v1/.well-known/jwks.json',
  }))
  assert.equal(config.algorithm, 'RS256')
  assert.equal(config.host, '::1')
  assert.equal(config.port, 8888)
  assert.equal(config.uploadTimeoutMs, 10000)
  assert.equal(config.providerTimeoutMs, 60000)
})

test('rejects unsafe binds, ports and disabled or excessive timeouts', () => {
  for (const [name, values] of Object.entries({
    RELAY_HOST: ['evil.example', '', '127.0.0.1/path'],
    RELAY_PORT: ['0', '65536', '1.5', '8787junk', '', '8787\n'],
    RELAY_UPLOAD_TIMEOUT_MS: ['0', '-1', '30001', 'NaN'],
    RELAY_PROVIDER_TIMEOUT_MS: ['0', '-1', '120001', '1e4'],
  })) {
    for (const value of values) assert.throws(() => readRelayConfig(relayEnv({ [name]: value })), { code: 'invalid_config' })
  }
})
