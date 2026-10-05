import test from 'node:test'
import assert from 'node:assert/strict'
import { writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { createJobRepository } from '../src/jobRepository.js'
import { createSpool } from '../src/spool.js'
import { createImageWorker } from '../src/worker.js'
import { makeDiskFixture, makeJobInput } from './fixtures.js'

async function fixture(t) {
  const disk = await makeDiskFixture(t)
  let clock = Date.now()
  const repo = createJobRepository(disk.dbPath, { now: () => clock })
  t.after(() => repo.close())
  const spool = createSpool(disk.spoolDir)
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'black' } }).png().toBuffer()
  const input = makeJobInput({ admittedAt: clock })
  await spool.writeInput(input.id, bytes)
  repo.accept(input)
  return { ...disk, repo, spool, bytes, input, advance: time => { clock = time }, now: () => clock }
}

for (const state of ['accepted', 'dispatching', 'running']) {
  test(`restart after ${state} does not dispatch during recovery`, async t => {
    const f = await fixture(t)
    if (state !== 'accepted') f.repo.claimNext()
    if (state === 'running') f.repo.transition(f.input.id, 'dispatching', 'running')
    let calls = 0
    const worker = createImageWorker({ ...f, paidEnabled: false, provider: { async edit() { calls++ } } })
    t.after(() => worker.stop())
    await worker.start()
    assert.equal(f.repo.get('A', f.input.id).state, state === 'accepted' ? 'accepted' : 'outcome_unknown')
    assert.equal(calls, 0)
    assert.equal(f.repo.quota('A').dailyRemaining, 9)
  })
}

test('startup promotes a valid manifest without provider call and near-expiry restart keeps original expiry', async t => {
  const f = await fixture(t)
  f.repo.claimNext()
  f.repo.transition(f.input.id, 'dispatching', 'running')
  const manifest = await f.spool.commitOutput(f.input.id, { bytes: f.bytes, mime: 'image/png' })
  f.advance(Date.parse(manifest.completedAt) + 86_399_000)
  // A second connection proves recovery consumes durable SQLite state.
  const reopened = createJobRepository(f.dbPath, { now: f.now })
  t.after(() => reopened.close())
  let calls = 0
  const worker = createImageWorker({ ...f, repo: reopened, paidEnabled: false, provider: { async edit() { calls++ } } })
  t.after(() => worker.stop())
  await worker.start()
  const job = reopened.get('A', f.input.id)
  assert.equal(job.state, 'succeeded')
  assert.equal(job.completedAt, manifest.completedAt)
  assert.equal(Date.parse(job.expiresAt) - f.now(), 1000)
  f.advance(f.now() + 1000)
  await worker.cleanup()
  assert.equal(reopened.get('A', job.id).state, 'expired')
  assert.equal(await f.spool.readOutput(job.id), null)
  assert.equal(calls, 0)
})

for (const faultPoint of ['image_committed', 'before_manifest_rename', 'manifest_committed', 'database_success']) {
  test(`fault at ${faultPoint} never repeats provider and only complete manifest recovers`, async t => {
    const f = await fixture(t)
    let calls = 0
    const spool = createSpool(f.spoolDir, { fault(point) {
      if (point === faultPoint) throw new Error('secret filesystem path')
    } })
    const repo = { ...f.repo, transition(...args) {
      if (faultPoint === 'database_success' && args[2] === 'succeeded') throw new Error('secret database details')
      return f.repo.transition(...args)
    } }
    const provider = { async edit() { calls++; return { bytes: f.bytes, mime: 'image/png' } } }
    const worker = createImageWorker({ ...f, repo, spool, provider, paidEnabled: true, now: Date.now })
    await worker.start()
    await worker.runOnce()
    const recoverable = ['manifest_committed', 'database_success'].includes(faultPoint)
    assert.equal(f.repo.get('A', f.input.id).state, recoverable ? 'running' : 'outcome_unknown')
    await worker.runOnce()
    await worker.stop()
    f.advance(Date.now())
    const restarted = createImageWorker({ ...f, provider, paidEnabled: true })
    t.after(() => restarted.stop())
    await restarted.start()
    await restarted.runOnce()
    assert.equal(f.repo.get('A', f.input.id).state, recoverable ? 'succeeded' : 'outcome_unknown')
    assert.equal(calls, 1)
    assert.equal(f.repo.quota('A').dailyRemaining, 9)
  })
}

for (const corruption of ['image', 'manifest', 'missing_completed_at']) {
  test(`corrupt ${corruption} cannot fabricate success or authorize retry`, async t => {
    const f = await fixture(t)
    f.repo.claimNext()
    await f.spool.commitOutput(f.input.id, { bytes: f.bytes, mime: 'image/png' })
    const manifestPath = join(f.spoolDir, f.input.id, 'manifest.json')
    if (corruption === 'image') await writeFile(join(f.spoolDir, f.input.id, 'output.png'), 'corrupt')
    else if (corruption === 'manifest') await writeFile(manifestPath, '{bad')
    else {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
      delete manifest.completedAt
      await writeFile(manifestPath, JSON.stringify(manifest))
    }
    f.advance(Date.now())
    let calls = 0
    const worker = createImageWorker({ ...f, paidEnabled: true, provider: { async edit() { calls++ } } })
    t.after(() => worker.stop())
    await worker.start()
    await worker.runOnce()
    assert.equal(f.repo.get('A', f.input.id).state, 'outcome_unknown')
    assert.equal(calls, 0)
  })
}
