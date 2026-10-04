import test from 'node:test'
import assert from 'node:assert/strict'
import { createJobRepository } from '../src/jobRepository.js'
import { DatabaseSync } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import { makeDiskFixture, makeJobInput } from './fixtures.js'

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const RESULT = { digest: 'c'.repeat(64), mime: 'image/png', size: 12 }

function memoryRepo(t, clock = () => NOW) {
  const repo = createJobRepository(':memory:', { now: clock })
  t.after(() => repo.close())
  return repo
}

function succeed(repo, input = makeJobInput(), patch = {}) {
  const accepted = repo.accept(input)
  repo.claimNext()
  return repo.transition(accepted.id, 'dispatching', 'succeeded', { result: RESULT, ...patch })
}

test('replay does not reserve another quota slot', t => {
  const repo = createJobRepository(':memory:', { now: () => NOW })
  t.after(() => repo.close())
  const input = makeJobInput()
  assert.equal(repo.accept(input).id, repo.accept(input).id)
  assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 9 })
  assert.throws(() => repo.accept({ ...input, requestHash: 'c'.repeat(64) }),
    { code: 'idempotency_conflict', status: 409 })
})

test('replays across midnight preserve acceptance-day quota', t => {
  let clock = Date.parse('2026-09-28T23:59:59.000Z')
  const repo = createJobRepository(':memory:', { now: () => clock })
  t.after(() => repo.close())
  const input = makeJobInput({ admittedAt: clock })
  const job = repo.accept(input)
  clock = Date.parse('2026-09-29T00:00:01.000Z')
  assert.equal(repo.accept(input).id, job.id)
  assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 10 })
})

test('body completion after midnight charges authenticated header-arrival day', t => {
  const clock = Date.parse('2026-09-29T00:00:01.000Z')
  const repo = memoryRepo(t, () => clock)
  const job = repo.accept(makeJobInput({ admittedAt: clock - 2000 }))
  assert.equal(job.createdAt, '2026-09-28T23:59:59.000Z')
  assert.equal(job.acceptedDay, '2026-09-28')
  assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 10 })
})

for (const [offset, code, status] of [
  [-300000, null], [-300001, 'request_expired', 410],
  [30000, null], [30001, 'key_clock_skew', 400],
]) {
  test(`unseen key admission boundary ${offset}ms`, t => {
    const repo = memoryRepo(t)
    const input = makeJobInput({ requestId: `v1.${NOW + offset}.${crypto.randomUUID()}` })
    if (code) {
      assert.throws(() => repo.accept(input), { code, status, serverTime: NOW })
      assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 10 })
    } else assert.equal(repo.accept(input).state, 'accepted')
  })
}

test('replay freezes complete profile, request, source and internal input reference', t => {
  const repo = memoryRepo(t)
  const input = makeJobInput()
  const accepted = repo.accept(input)
  input.profile.model = 'future-server-model'
  input.request.change = 'modified'
  const replay = repo.accept({ ...input, id: crypto.randomUUID(), inputRef: 'new-input', admittedAt: NOW + DAY })
  assert.deepEqual(replay, accepted)
  assert.equal(replay.profile.model, 'gpt-image-2.5-sunburst')
  replay.profile.model = 'mutated-reader'
  assert.equal(repo.findRequest('A', input.requestId).profile.model, 'gpt-image-2.5-sunburst')
})

test('new acceptance rejects incomplete and noncanonical inputs without quota', t => {
  const repo = memoryRepo(t)
  for (const patch of [
    { id: 'not-uuid' }, { ownerId: '' }, { requestId: 'bad-key' },
    { requestHash: 'a' }, { sourceImageDigest: 'B'.repeat(64) },
    { request: {} }, { profile: {} }, { inputRef: null }, { admittedAt: NaN },
  ]) assert.throws(() => repo.accept(makeJobInput(patch)))
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 10 })
})

test('owner boundaries apply to lookup, listing, acknowledgement and discard', t => {
  const repo = memoryRepo(t)
  const input = makeJobInput()
  const job = repo.accept(input)
  assert.equal(repo.get('B', job.id), null)
  assert.equal(repo.findRequest('B', input.requestId), null)
  assert.deepEqual(repo.list('B'), [])
  for (const method of ['ack', 'cancelOrDiscard']) {
    assert.throws(() => repo[method]('B', job.id), { code: 'job_not_found', status: 404 })
  }
  assert.equal(repo.get('A', job.id).state, 'accepted')
  assert.equal(repo.listInternal().length, 1)
  assert.equal(repo.accept(makeJobInput({ ownerId: 'B', requestId: input.requestId })).ownerId, 'B')
})

test('one active job per owner; uncertain dispatched jobs release active but retain daily quota', t => {
  const repo = memoryRepo(t)
  const job = repo.accept(makeJobInput())
  assert.throws(() => repo.accept(makeJobInput()), { code: 'active_quota_exceeded', status: 429 })
  const claimed = repo.claimNext()
  assert.equal(claimed.id, job.id)
  assert.equal(claimed.dispatchedAt, new Date(NOW).toISOString())
  assert.equal(repo.claimNext(), null)
  repo.transition(job.id, 'dispatching', 'outcome_unknown', { errorCode: 'provider_uncertain' })
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 9 })
  assert.throws(() => repo.cancelOrDiscard('A', job.id), { code: 'job_conflict', status: 409 })
  repo.accept(makeJobInput())
  assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 8 })
})

test('ten dispatched jobs exhaust UTC-day quota and the next day resets it', t => {
  let clock = NOW
  const repo = memoryRepo(t, () => clock)
  for (let n = 0; n < 10; n++) {
    const job = repo.accept(makeJobInput())
    repo.claimNext()
    repo.transition(job.id, 'dispatching', 'failed', { errorCode: 'provider_rejected' })
  }
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 0 })
  assert.throws(() => repo.accept(makeJobInput()), { code: 'daily_quota_exceeded', status: 429 })
  clock += DAY
  repo.accept(makeJobInput({ admittedAt: clock }))
  assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 9 })
})

test('only proven undispatched failures, cancellations and expiries refund quota', t => {
  const repo = memoryRepo(t)
  for (const state of ['failed', 'cancelled', 'expired']) {
    const job = repo.accept(makeJobInput())
    repo.transition(job.id, 'accepted', state)
    assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 10 })
  }
  const cancelled = repo.accept(makeJobInput())
  assert.equal(repo.cancelOrDiscard('A', cancelled.id).state, 'cancelled')
  assert.equal(repo.claimNext(), null)
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 10 })
})

test('transition matrix and compare-and-swap reject corrupt updates atomically', t => {
  const repo = memoryRepo(t)
  const input = makeJobInput()
  const accepted = repo.accept(input)
  for (const [from, to, patch] of [
    ['accepted', 'succeeded', { result: RESULT }], ['accepted', 'running', {}],
    ['running', 'failed', {}], ['accepted', 'bogus', {}],
    ['accepted', 'failed', { quotaUsed: 0 }], ['accepted', 'failed', { profile: {} }],
    ['accepted', 'failed', { errorCode: 'RAW provider secret' }],
  ]) assert.throws(() => repo.transition(accepted.id, from, to, patch))
  assert.deepEqual(repo.get('A', accepted.id), accepted)
  repo.claimNext()
  assert.throws(() => repo.ack('A', accepted.id), { code: 'job_conflict' })
  assert.throws(() => repo.cancelOrDiscard('A', accepted.id), { code: 'job_conflict' })
  repo.transition(accepted.id, 'dispatching', 'running')
  assert.throws(() => repo.transition(accepted.id, 'running', 'accepted'), { code: 'invalid_transition' })
  repo.transition(accepted.id, 'running', 'succeeded', { result: RESULT })
  assert.throws(() => repo.transition(accepted.id, 'succeeded', 'running'), { code: 'invalid_transition' })
})

test('completion uses immutable manifest time; acknowledgement is repeatable and keeps quota', t => {
  let clock = NOW
  const repo = memoryRepo(t, () => clock)
  const accepted = repo.accept(makeJobInput())
  repo.claimNext()
  clock += 1000
  const completedAt = new Date(NOW + 500).toISOString()
  const completed = repo.transition(accepted.id, 'dispatching', 'succeeded', { result: RESULT, completedAt })
  assert.equal(completed.completedAt, completedAt)
  assert.equal(completed.expiresAt, new Date(NOW + 500 + DAY).toISOString())
  const acked = repo.ack('A', completed.id)
  assert.equal(acked.state, 'succeeded')
  assert.equal(acked.acknowledgedAt, new Date(clock).toISOString())
  assert.equal(acked.request, null)
  assert.equal(acked.inputRef, null)
  assert.equal(acked.result, null)
  clock += 1000
  assert.deepEqual(repo.ack('A', completed.id), acked)
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 9 })
  assert.throws(() => repo.transition(completed.id, 'succeeded', 'expired', { completedAt: clock }))
  assert.equal(repo.transition(completed.id, 'succeeded', 'expired').completedAt, completedAt)
})

test('discarded completed output cannot reenable work or refund quota', t => {
  const repo = memoryRepo(t)
  const input = makeJobInput()
  const completed = succeed(repo, input)
  const discarded = repo.cancelOrDiscard('A', completed.id)
  assert.equal(discarded.result, null)
  assert.equal(discarded.request, null)
  assert.equal(discarded.acknowledgedAt, new Date(NOW).toISOString())
  assert.deepEqual(repo.cancelOrDiscard('A', completed.id), discarded)
  assert.deepEqual(repo.accept(input), discarded)
  assert.equal(repo.claimNext(), null)
  assert.equal(repo.quota('A').dailyRemaining, 9)
})

test('input and output expiry boundaries retain known-key tombstones without recharging', t => {
  let clock = NOW
  const repo = memoryRepo(t, () => clock)
  const input = makeJobInput()
  const accepted = repo.accept(input)
  repo.scrub(accepted.id)
  assert.ok(repo.get('A', accepted.id).request)
  assert.deepEqual(repo.expire(clock + DAY - 1), [])
  clock += DAY
  assert.equal(repo.expire(clock)[0].state, 'expired')
  repo.scrub(accepted.id)
  assert.equal(repo.get('A', accepted.id).request, null)
  assert.equal(repo.accept({ ...input, admittedAt: clock }).id, accepted.id)
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 10 })
  const output = succeed(repo, makeJobInput({ admittedAt: clock }))
  repo.scrub(output.id)
  assert.deepEqual(repo.get('A', output.id).result, RESULT)
  clock += DAY - 1
  assert.deepEqual(repo.expire(clock), [])
  clock += 1
  assert.equal(repo.expire(clock)[0].id, output.id)
  repo.scrub(output.id)
  assert.equal(repo.get('A', output.id).request, null)
  assert.equal(repo.get('A', output.id).completedAt, output.completedAt)
})

test('scrub retains same-day quota and removes seven-day tombstones without reopening old keys', t => {
  let clock = NOW
  const repo = memoryRepo(t, () => clock)
  const input = makeJobInput()
  const completed = succeed(repo, input)
  repo.ack('A', completed.id)
  repo.scrub(completed.id)
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 9 })
  clock += 7 * DAY - 1
  repo.scrub(completed.id)
  assert.ok(repo.get('A', completed.id))
  clock += 1
  repo.scrub(completed.id)
  assert.equal(repo.get('A', completed.id), null)
  assert.throws(() => repo.accept({ ...input, admittedAt: clock }), { code: 'request_expired', status: 410 })
  assert.equal(repo.listInternal().length, 0)
})

test('failure recovery metadata is scrubbed after 24 hours without changing quota/completion', t => {
  let clock = NOW
  const repo = memoryRepo(t, () => clock)
  const accepted = repo.accept(makeJobInput())
  repo.claimNext()
  const failed = repo.transition(accepted.id, 'dispatching', 'outcome_unknown', { errorCode: 'provider_uncertain' })
  repo.scrub(failed.id)
  assert.ok(repo.get('A', failed.id).request)
  clock += DAY
  repo.scrub(failed.id)
  const scrubbed = repo.get('A', failed.id)
  assert.equal(scrubbed.request, null)
  assert.equal(scrubbed.inputRef, null)
  assert.equal(scrubbed.quotaUsed, 1)
  assert.equal(scrubbed.completedAt, failed.completedAt)
})

test('claim never dispatches an input whose 24-hour lifetime has elapsed', t => {
  let clock = NOW
  const repo = memoryRepo(t, () => clock)
  const input = makeJobInput()
  repo.accept(input)
  clock += DAY
  assert.equal(repo.claimNext(), null)
  const expired = repo.get('A', input.id)
  assert.equal(expired.state, 'expired')
  assert.equal(expired.dispatchedAt, null)
  assert.equal(expired.quotaUsed, 0)
})

test('invalid result or completion patches leave dispatched work unchanged', t => {
  const repo = memoryRepo(t)
  const accepted = repo.accept(makeJobInput())
  const claimed = repo.claimNext()
  for (const patch of [
    {}, { result: {} }, { result: { ...RESULT, bytes: 'secret' } },
    { result: { ...RESULT, size: 0 } }, { result: { ...RESULT, mime: 'text/html' } },
    { result: RESULT, completedAt: NOW - 1 }, { result: RESULT, completedAt: NOW + 1 },
    { result: RESULT, expiresAt: NOW + 2 * DAY },
  ]) assert.throws(() => repo.transition(accepted.id, 'dispatching', 'succeeded', patch))
  assert.deepEqual(repo.get('A', accepted.id), claimed)
  assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 9 })
})

test('failed insert rolls back without locking the database or consuming quota', t => {
  const repo = memoryRepo(t)
  const first = makeJobInput()
  repo.accept(first)
  repo.cancelOrDiscard('A', first.id)
  assert.throws(() => repo.accept(makeJobInput({ id: first.id })))
  assert.deepEqual(repo.quota('A'), { active: 0, dailyRemaining: 10 })
  assert.equal(repo.accept(makeJobInput()).state, 'accepted')
})

test('owner listing is recent-first and bounded to 50; internal listing includes every row', t => {
  let clock = NOW
  const repo = memoryRepo(t, () => clock)
  let latest
  for (let i = 0; i < 52; i++) {
    latest = repo.accept(makeJobInput({ admittedAt: clock++ }))
    repo.cancelOrDiscard('A', latest.id)
  }
  assert.equal(repo.list('A').length, 50)
  assert.equal(repo.list('A', { limit: 500 }).length, 50)
  assert.equal(repo.list('A', { limit: 1 })[0].id, latest.id)
  assert.equal(repo.listInternal().length, 52)
  assert.throws(() => repo.list('A', { limit: -1 }), { code: 'invalid_limit' })
})

test('persistent repositories reopen frozen jobs and enforce database state constraints', async t => {
  const { dbPath } = await makeDiskFixture(t)
  let repo = createJobRepository(dbPath, { now: () => NOW })
  const input = makeJobInput()
  repo.accept(input)
  repo.claimNext()
  repo.close()
  repo = createJobRepository(dbPath, { now: () => NOW })
  t.after(() => repo.close())
  assert.equal(repo.accept(input).state, 'dispatching')
  assert.equal(repo.claimNext(), null)
  const db = new DatabaseSync(dbPath)
  t.after(() => db.close())
  assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal')
  assert.throws(() => db.prepare('UPDATE jobs SET state = ? WHERE id = ?').run('invalid', input.id))
})

async function competingConnections(t, dbPath, inputs) {
  const gate = new SharedArrayBuffer(4)
  const code = `
    import { parentPort, workerData } from 'node:worker_threads';
    import { createJobRepository } from ${JSON.stringify(new URL('../src/jobRepository.js', import.meta.url).href)};
    const repo = createJobRepository(workerData.dbPath, { now: () => ${NOW} });
    parentPort.postMessage('ready');
    Atomics.wait(new Int32Array(workerData.gate), 0, 0);
    let answer;
    try { answer = { job: repo.accept(workerData.input) }; }
    catch (e) { answer = { code: e.code }; }
    answer.claimed = repo.claimNext();
    repo.close();
    parentPort.postMessage(answer);
  `
  let ready = 0
  return Promise.all(inputs.map(input => new Promise((resolve, reject) => {
    const worker = new Worker(new URL(`data:text/javascript,${encodeURIComponent(code)}`),
      { workerData: { dbPath, input, gate } })
    t.after(() => worker.terminate())
    worker.on('error', reject)
    worker.on('message', message => {
      if (message !== 'ready') return resolve(message)
      if (++ready === inputs.length) {
        Atomics.store(new Int32Array(gate), 0, 1)
        Atomics.notify(new Int32Array(gate), 0)
      }
    })
  })))
}

for (const replay of [false, true]) {
  test(`two simultaneous SQLite connections reserve and claim only once (replay=${replay})`, async t => {
    const { dbPath } = await makeDiskFixture(t)
    const repo = createJobRepository(dbPath, { now: () => NOW })
    t.after(() => repo.close())
    const first = makeJobInput()
    const second = replay ? { ...first, id: crypto.randomUUID() } : makeJobInput()
    const answers = await competingConnections(t, dbPath, [first, second])
    assert.equal(answers.filter(answer => answer.claimed).length, 1)
    if (replay) assert.equal(answers[0].job.id, answers[1].job.id)
    else assert.equal(answers.filter(answer => answer.code === 'active_quota_exceeded').length, 1)
    assert.equal(repo.listInternal().length, 1)
    assert.deepEqual(repo.quota('A'), { active: 1, dailyRemaining: 9 })
  })
}
