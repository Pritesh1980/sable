import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { createJobRepository } from '../src/jobRepository.js'
import { createSpool } from '../src/spool.js'
import { createImageWorker } from '../src/worker.js'
import { makeDiskFixture, makeJobInput } from './fixtures.js'

async function fixture(t) {
  const disk = await makeDiskFixture(t)
  let clock = Date.now()
  const now = () => clock
  const repo = createJobRepository(disk.dbPath, { now })
  t.after(() => repo.close())
  const spool = createSpool(disk.spoolDir)
  const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'black' } }).png().toBuffer()
  const input = makeJobInput({ admittedAt: clock })
  await spool.writeInput(input.id, bytes)
  repo.accept(input)
  return { ...disk, repo, spool, input, bytes, now, advance: time => { clock = time } }
}

test('accepted input expires before deletion at 24h; prompt-free tombstone lasts seven days', async t => {
  const f = await fixture(t)
  const worker = createImageWorker({ ...f, paidEnabled: false,
    spool: { ...f.spool, async removeInput(id) {
      assert.equal(f.repo.get('A', id).state, 'expired')
      return f.spool.removeInput(id)
    } } })
  t.after(() => worker.stop())
  await worker.start()
  f.advance(f.input.admittedAt + 86_399_999)
  await worker.cleanup()
  assert.deepEqual(await f.spool.readInput(f.input.id), f.bytes)
  f.advance(f.now() + 1)
  await worker.cleanup()
  const job = f.repo.get('A', f.input.id)
  assert.equal(job.state, 'expired')
  assert.equal(job.quotaUsed, 0)
  assert.equal(job.request, null)
  assert.equal(job.inputRef, null)
  await assert.rejects(f.spool.readInput(job.id), { code: 'spool_input_missing' })
  f.advance(Date.parse(job.completedAt) + 7 * 86_400_000 - 1)
  await worker.cleanup()
  assert.ok(f.repo.get('A', job.id))
  f.advance(f.now() + 1)
  await worker.cleanup()
  assert.equal(f.repo.get('A', job.id), null)
})

for (const terminal of ['cancelled', 'acknowledged', 'outcome_unknown']) {
  test(`${terminal} cleanup removes files and bounds recovery metadata`, async t => {
    const f = await fixture(t)
    if (terminal === 'cancelled') f.repo.cancelOrDiscard('A', f.input.id)
    else {
      f.repo.claimNext()
      if (terminal === 'acknowledged') {
        const output = await f.spool.commitOutput(f.input.id, { bytes: f.bytes, mime: 'image/png' })
        f.advance(Date.now())
        const { digest, mime, size, completedAt } = output
        f.repo.transition(f.input.id, 'dispatching', 'succeeded', { result: { digest, mime, size }, completedAt })
        f.repo.ack('A', f.input.id)
      } else f.repo.transition(f.input.id, 'dispatching', 'outcome_unknown', { errorCode: 'provider_uncertain' })
    }
    const worker = createImageWorker({ ...f, paidEnabled: false })
    t.after(() => worker.stop())
    await worker.start()
    await assert.rejects(f.spool.readInput(f.input.id), { code: 'spool_input_missing' })
    assert.equal(await f.spool.readOutput(f.input.id), null)
    const job = f.repo.get('A', f.input.id)
    assert.equal(job.quotaUsed, terminal === 'cancelled' ? 0 : 1)
    assert.equal(job.request !== null, terminal === 'outcome_unknown')
    f.advance(Date.parse(job.completedAt) + 86_400_000)
    await worker.cleanup()
    assert.equal(f.repo.get('A', f.input.id).request, null)
  })
}

test('failed file cleanup logs only safe codes, scrubs metadata, and retries on minute timer and startup', async t => {
  const f = await fixture(t)
  t.mock.timers.enable({ apis: ['setInterval'] })
  f.repo.cancelOrDiscard('A', f.input.id)
  let failing = true
  let removed
  const cleaned = new Promise(resolve => { removed = resolve })
  const logs = []
  const worker = createImageWorker({ ...f, paidEnabled: false, log: value => logs.push(value),
    spool: { ...f.spool, async removeInput(id) {
      if (failing) throw Object.assign(new Error('secret path token prompt'), { code: 'secret_code' })
      await f.spool.removeInput(id)
      removed()
    } } })
  await worker.start()
  assert.equal(f.repo.get('A', f.input.id).request, null)
  assert.deepEqual(await f.spool.readInput(f.input.id), f.bytes)
  assert.ok(logs.length > 0)
  assert.doesNotMatch(JSON.stringify(logs), /secret|token|prompt|path/)
  failing = false
  t.mock.timers.tick(60_000)
  await cleaned
  await worker.stop()
  await assert.rejects(f.spool.readInput(f.input.id), { code: 'spool_input_missing' })
  const restarted = createImageWorker({ ...f, paidEnabled: false })
  await restarted.start()
  await restarted.stop()
  assert.equal(f.repo.get('A', f.input.id).request, null)
})
