import test from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import { makeJwtFixture } from './fixtures.js'
import { createOwnerVerifier } from '../src/auth.js'

test('an authenticated non-owner cannot submit', async () => {
  const f = await makeJwtFixture()
  const verify = createOwnerVerifier(f)
  const token = await f.issue({ sub: 'another-sub' })
  await assert.rejects(verify({ authorization: `Bearer ${token}` }), { code: 'forbidden_owner' })
})

for (const algorithm of ['ES256', 'RS256']) {
  test(`accepts only the configured ${algorithm} owner and returns no other claims`, async () => {
    const f = await makeJwtFixture({ algorithm })
    const token = await f.issue({ user_metadata: { role: 'service_role' } })
    assert.deepEqual(await createOwnerVerifier(f)({ authorization: `Bearer ${token}` }), { ownerId: f.ownerId })
  })
}

test('rejects anonymous, API/service roles and metadata-based owner impersonation', async () => {
  const f = await makeJwtFixture()
  const verify = createOwnerVerifier(f)
  for (const claims of [
    { is_anonymous: true }, { role: 'anon' }, { role: 'service_role' }, { role: undefined },
    { sub: 'foreign', user_metadata: { sub: f.ownerId, ownerId: f.ownerId, role: 'authenticated' } },
  ]) {
    await assert.rejects(verify({ authorization: `Bearer ${await f.issue(claims)}` }), {
      code: 'forbidden_owner', status: 403, message: 'forbidden_owner',
    })
  }
})

test('rejects invalid claims, expiry, future issue time and overlong token lifetime', async () => {
  const f = await makeJwtFixture()
  const verify = createOwnerVerifier(f)
  const now = Math.floor(Date.now() / 1000)
  for (const claims of [
    { iss: 'https://evil.example/auth/v1' }, { aud: 'service_role' },
    { iss: undefined }, { aud: undefined }, { sub: undefined }, { iat: undefined }, { exp: undefined },
    { exp: now - 1 }, { exp: now }, { iat: now + 60 }, { iat: now, exp: now + 901 },
    { iat: 'now' }, { exp: 'later' }, { iat: now + 0.5 },
    { aud: ['authenticated', 'other'] },
  ]) {
    await assert.rejects(verify({ authorization: `Bearer ${await f.issue(claims)}` }), {
      code: 'invalid_token', status: 401, message: 'invalid_token',
    })
  }
})

test('rejects missing, malformed, multi-token and overlong authorization before key lookup', async () => {
  const f = await makeJwtFixture()
  let lookups = 0
  const verify = createOwnerVerifier({ ...f, keyResolver: () => { lookups++; throw new Error('no') } })
  for (const authorization of [undefined, null, [], 1, '', 'sb_secret_fake', 'Basic abc',
    'Bearer abc', 'Bearer a.b.c\n', 'Bearer a.b.c, a.b.c', 'Bearer  a.b.c', 'Bearer ' + 'a'.repeat(8193)]) {
    await assert.rejects(verify({ authorization }), { code: 'invalid_token', status: 401 })
  }
  assert.equal(lookups, 0)
})

test('rejects forged, unsigned, symmetric and other asymmetric algorithms', async () => {
  const f = await makeJwtFixture()
  const foreign = await makeJwtFixture()
  const rsa = await makeJwtFixture({ algorithm: 'RS256' })
  const symmetric = await new SignJWT({ sub: f.ownerId }).setProtectedHeader({ alg: 'HS256' })
    .sign(new Uint8Array(32))
  for (const token of [await foreign.issue({}, { kid: f.publicJwk.kid }), await rsa.issue(), symmetric,
    'eyJhbGciOiJub25lIn0.eyJzdWIiOiJvd25lciJ9.', 'a.b.c']) {
    await assert.rejects(createOwnerVerifier(f)({ authorization: `Bearer ${token}` }), { code: 'invalid_token', status: 401 })
  }
})

test('rejects unsafe verifier configuration even with an injected resolver', async () => {
  const f = await makeJwtFixture()
  for (const options of [{ algorithm: 'HS256' }, { algorithm: ['ES256', 'RS256'] },
    { issuer: 'http://relay-test.supabase.co/auth/v1' }, { issuer: 'https://evil.example/other' },
    { ownerId: '' }, { audience: '' }]) {
    assert.throws(() => createOwnerVerifier({ ...f, ...options }), { code: 'invalid_config' })
  }
})

test('maps unavailable key lookups to safe errors without leaking causes', async () => {
  const f = await makeJwtFixture()
  const verify = createOwnerVerifier({ ...f, keyResolver: () => { throw new Error('secret upstream URL and token') } })
  await assert.rejects(verify({ authorization: `Bearer ${await f.issue()}` }), error => {
    assert.equal(error.message, 'invalid_token')
    assert.equal(error.code, 'invalid_token')
    assert.equal(error.status, 401)
    assert.equal(error.cause, undefined)
    return true
  })
})

test('production JWKS is fixed, bounded in cache age, and rotates only after cooldown', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const f = await makeJwtFixture()
  const rotated = await makeJwtFixture()
  let keys = [f.publicJwk]
  let requests = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(String(url), 'https://relay-test.supabase.co/auth/v1/.well-known/jwks.json')
    assert.equal(options.redirect, 'manual')
    assert.ok(options.signal instanceof AbortSignal)
    requests++
    return Response.json({ keys })
  })
  const verify = createOwnerVerifier({ ...f, keyResolver: undefined })
  assert.deepEqual(await verify({ authorization: `Bearer ${await f.issue({}, { jku: 'https://evil.example/keys' })}` }), { ownerId: f.ownerId })
  keys = [rotated.publicJwk]
  await assert.rejects(verify({ authorization: `Bearer ${await rotated.issue()}` }), { code: 'invalid_token' })
  assert.equal(requests, 1)
  t.mock.timers.tick(30_001)
  assert.deepEqual(await verify({ authorization: `Bearer ${await rotated.issue()}` }), { ownerId: f.ownerId })
  assert.equal(requests, 2)
  keys = []
  t.mock.timers.tick(600_001)
  await assert.rejects(verify({ authorization: `Bearer ${await rotated.issue()}` }), { code: 'invalid_token' })
  assert.equal(requests, 3)
})

test('production JWKS fails closed on unavailable, empty and malformed responses', async t => {
  const f = await makeJwtFixture()
  for (const response of [() => { throw new Error('private connection details') },
    () => Response.json({ keys: [] }), () => Response.json({ wrong: [] }),
    () => new Response('private failure details', { status: 503 }),
  ]) {
    const mock = t.mock.method(globalThis, 'fetch', response)
    const verify = createOwnerVerifier({ ...f, keyResolver: undefined })
    await assert.rejects(verify({ authorization: `Bearer ${await f.issue()}` }), { code: 'invalid_token', status: 401 })
    mock.mock.restore()
  }
})

test('production JWKS bounds each fetch with a five-second abort signal', async t => {
  const f = await makeJwtFixture()
  let deadline
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    deadline = milliseconds
    return AbortSignal.abort(new DOMException('private timeout details', 'TimeoutError'))
  })
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => { signal.throwIfAborted() })
  await assert.rejects(createOwnerVerifier({ ...f, keyResolver: undefined })({ authorization: `Bearer ${await f.issue()}` }), {
    code: 'invalid_token', status: 401, message: 'invalid_token',
  })
  assert.equal(deadline, 5000)
})
