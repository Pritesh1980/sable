import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { createJobRepository } from '../src/jobRepository.js'
import { createSpool } from '../src/spool.js'
import { createImageWorker } from '../src/worker.js'
import { makeDiskFixture, makeJobInput } from './fixtures.js'

async function fixture(t) {
  const disk = await makeDiskFixture(t)
  const repo = createJobRepository(disk.dbPath)
  const spool = createSpool(disk.spoolDir)
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'black' } }).png().toBuffer()
  const input = makeJobInput({ admittedAt: Date.now() })
  input.inputRef = await spool.writeInput(input.id, bytes)
  repo.accept(input)
  t.after(() => repo.close())
  const makeWorker = options => {
    const worker = createImageWorker({ repo, spool, paidEnabled: true, ...options })
    t.after(() => worker.stop())
    return worker
  }
  return { ...disk, repo, spool, bytes, input, makeWorker }
}

test('one attempt uses frozen request/profile, persists output before success and deletes source', async t => {
  const f = await fixture(t)
  let calls = 0
  const worker = f.makeWorker({ provider: { async edit({ sourceBytes, prompt, profile }) {
    calls++
    assert.equal(f.repo.get('A', f.input.id).state, 'running')
    assert.ok(f.repo.get('A', f.input.id).dispatchedAt)
    assert.deepEqual(sourceBytes, f.bytes)
    assert.equal(prompt, f.input.request.prompt)
    assert.deepEqual(profile, f.input.profile)
    return { bytes: f.bytes, mime: 'image/png' }
  } } })
  assert.equal(await worker.runOnce(), false) // Cannot bypass startup recovery.
  await worker.start()
  assert.equal(await worker.runOnce(), true)
  assert.equal(await worker.runOnce(), false)
  const job = f.repo.get('A', f.input.id)
  const saved = await f.spool.readOutput(job.id)
  assert.equal(job.state, 'succeeded')
  assert.equal(job.completedAt, saved.completedAt)
  assert.equal(Date.parse(job.expiresAt) - Date.parse(saved.completedAt), 86_400_000)
  assert.equal(job.result.digest, saved.digest)
  await assert.rejects(f.spool.readInput(job.id), { code: 'spool_input_missing' })
  assert.deepEqual(f.repo.quota('A'), { active: 0, dailyRemaining: 9 })
  assert.equal(calls, 1)
})

test('disabled gate leaves queued work undispatched, including minute timer', async t => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ['setInterval'] })
  let calls = 0
  let enabled = false
  const worker = f.makeWorker({ paidEnabled: () => enabled, provider: { async edit() {
    calls++
    return { bytes: f.bytes, mime: 'image/png' }
  } } })
  await worker.start()
  t.mock.timers.tick(60_000)
  assert.equal(await worker.runOnce(), false)
  assert.equal(f.repo.get('A', f.input.id).state, 'accepted')
  assert.equal(calls, 0)
  enabled = true
  assert.equal(await worker.runOnce(), true)
  assert.equal(calls, 1)
  await worker.stop()
  const next = makeJobInput({ admittedAt: Date.now() })
  await f.spool.writeInput(next.id, f.bytes)
  f.repo.accept(next)
  t.mock.timers.tick(120_000)
  assert.equal(await worker.runOnce(), false)
  assert.equal(f.repo.get('A', next.id).state, 'accepted')
  assert.equal(calls, 1)
})

for (const code of ['provider_rejected', 'provider_uncertain', 'secret_prompt_key']) {
  test(`provider ${code} is terminal with safe code and no quota refund or retry`, async t => {
    const f = await fixture(t)
    let calls = 0
    const logs = []
    const worker = f.makeWorker({ log: event => logs.push(event), provider: { async edit() {
      calls++
      throw Object.assign(new Error('secret bytes and token'), { code, prompt: 'secret prompt' })
    } } })
    await worker.start()
    await worker.runOnce()
    await worker.runOnce()
    const job = f.repo.get('A', f.input.id)
    assert.equal(job.state, code === 'provider_rejected' ? 'failed' : 'outcome_unknown')
    assert.equal(job.errorCode, code === 'provider_rejected' ? code : 'provider_uncertain')
    assert.deepEqual(f.repo.quota('A'), { active: 0, dailyRemaining: 9 })
    await assert.rejects(f.spool.readInput(job.id), { code: 'spool_input_missing' })
    assert.equal(calls, 1)
    assert.doesNotMatch(JSON.stringify(logs), /secret|token|bytes/)
    assert.equal(f.repo.accept(makeJobInput({ admittedAt: Date.now() })).state, 'accepted')
  })
}

test('stop and gate changes during source read prevent a provider call after durable claim', async t => {
  for (const action of ['stop', 'disable']) {
    await t.test(action, async t => {
      const f = await fixture(t)
      let release, reading
      const entered = new Promise(resolve => { reading = resolve })
      const blocked = new Promise(resolve => { release = resolve })
      let enabled = true
      let calls = 0
      const worker = f.makeWorker({ paidEnabled: () => enabled,
        spool: { ...f.spool, async readInput(id) { reading(); await blocked; return f.spool.readInput(id) } },
        provider: { async edit() { calls++; return { bytes: f.bytes, mime: 'image/png' } } } })
      await worker.start()
      const run = worker.runOnce()
      await entered
      let stopped
      if (action === 'stop') stopped = worker.stop()
      else enabled = false
      release()
      await run
      await stopped
      assert.equal(calls, 0)
      assert.equal(f.repo.get('A', f.input.id).state, 'failed')
      assert.equal(f.repo.quota('A').dailyRemaining, 9)
    })
  }
})

test('concurrent run/start calls do not reconcile or repeat an in-flight attempt; stop awaits it', async t => {
  const f = await fixture(t)
  let release, entered
  const waiting = new Promise(resolve => { entered = resolve })
  const blocked = new Promise(resolve => { release = resolve })
  let calls = 0
  const worker = f.makeWorker({ provider: { async edit() {
    calls++; entered(); await blocked
    return { bytes: f.bytes, mime: 'image/png' }
  } } })
  await Promise.all([worker.start(), worker.start()])
  const run = worker.runOnce()
  await waiting
  await worker.start()
  assert.equal(f.repo.get('A', f.input.id).state, 'running')
  const second = worker.runOnce()
  let stopped = false
  const stop = worker.stop().then(() => { stopped = true })
  await Promise.resolve()
  assert.equal(stopped, false)
  release()
  await Promise.all([run, second, stop])
  assert.equal(f.repo.get('A', f.input.id).state, 'succeeded')
  assert.equal(calls, 1)
})
