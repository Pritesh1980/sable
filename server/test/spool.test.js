import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { lstat, mkdir, open, readFile, readdir, symlink, truncate, unlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { makeDiskFixture } from './fixtures.js'
import { createSpool } from '../src/spool.js'

const id = '00000000-0000-4000-8000-000000000001'
const png = () => sharp({ create: { width: 2, height: 2, channels: 4,
  background: '#123456' } }).png().toBuffer()
const otherId = '00000000-0000-4000-8000-000000000002'
const day = 86_400_000
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

async function committed(t) {
  const fixture = await makeDiskFixture(t)
  const spool = createSpool(fixture.spoolDir)
  const bytes = await png()
  const receipt = await spool.commitOutput(id, { bytes, mime: 'image/png' })
  return { ...fixture, spool, bytes, receipt, jobDir: join(fixture.spoolDir, id) }
}

test('a completed manifest survives a crash before database success with its original timestamp', async t => {
  const { spoolDir } = await makeDiskFixture(t)
  const bytes = await png()
  const before = Date.now()
  const spool = createSpool(spoolDir, { fault: stage => {
    if (stage === 'manifest_committed') throw new Error('simulated crash')
  } })
  await assert.rejects(spool.commitOutput(id, { bytes, mime: 'image/png' }))
  const recovered = await createSpool(spoolDir).readOutput(id)
  assert.deepEqual(recovered.bytes, bytes)
  assert.ok(Date.parse(recovered.completedAt) >= before)
  assert.ok(Date.parse(recovered.completedAt) <= Date.now())
  const receipt = await createSpool(spoolDir).commitOutput(id, { bytes, mime: 'image/png' })
  assert.equal(receipt.completedAt, recovered.completedAt)
})

test('durable input roundtrips across instances in private directories and files', async t => {
  const { spoolDir } = await makeDiskFixture(t)
  const spool = createSpool(spoolDir)
  assert.equal(await spool.writeInput(id, Buffer.from('source')), id)
  assert.equal((await createSpool(spoolDir).readInput(id)).toString(), 'source')
  assert.equal((await lstat(join(spoolDir, id))).mode & 0o777, 0o700)
  assert.equal((await lstat(join(spoolDir, id, 'input'))).mode & 0o777, 0o600)
  await assert.rejects(spool.writeInput(id, Buffer.from('replacement')), { code: 'spool_input_exists' })
  assert.equal((await spool.readInput(id)).toString(), 'source')
})

test('receipt and recovered output verify exact bytes and immutable UTC completion', async t => {
  const now = 1_800_000_000_000
  t.mock.timers.enable({ apis: ['Date'], now })
  const { spool, spoolDir, bytes, receipt, jobDir } = await committed(t)
  assert.deepEqual(receipt, { digest: digest(bytes), mime: 'image/png', size: bytes.length,
    completedAt: new Date(now).toISOString() })
  const manifest = JSON.parse(await readFile(join(jobDir, 'manifest.json'), 'utf8'))
  assert.deepEqual(manifest, { version: 1, jobId: id, ...receipt })
  t.mock.timers.tick(day - 1)
  const output = await createSpool(spoolDir).readOutput(id)
  assert.deepEqual(output, { bytes, ...receipt })
  assert.equal(Date.parse(output.completedAt) + day, now + day)
  assert.deepEqual(await spool.commitOutput(id, { bytes, mime: 'image/png' }), receipt)
  const different = await sharp(bytes).negate().png().toBuffer()
  await assert.rejects(spool.commitOutput(id, { bytes: different, mime: 'image/png' }), { code: 'spool_output_exists' })
  assert.deepEqual((await spool.readOutput(id)).bytes, bytes)
})

for (const stage of ['before_image_rename', 'image_committed']) {
  test(`a crash at ${stage} retains evidence but is not recovered as success`, async t => {
    const { spoolDir } = await makeDiskFixture(t)
    const spool = createSpool(spoolDir, { fault: current => {
      if (current === stage) throw new Error('simulated crash')
    } })
    await assert.rejects(spool.commitOutput(id, { bytes: await png(), mime: 'image/png' }))
    assert.equal(await createSpool(spoolDir).readOutput(id), null)
    const files = await readdir(join(spoolDir, id))
    assert.ok(files.some(name => stage === 'image_committed' ? name === 'output.png' : name.endsWith('.tmp')))
    assert.ok(!files.includes('manifest.json'))
  })
}

test('ENOSPC preserves image evidence and never fabricates a completed result', async t => {
  const { spoolDir } = await makeDiskFixture(t)
  const spool = createSpool(spoolDir, { fault: stage => {
    if (stage === 'before_manifest_write') throw Object.assign(new Error('private disk path'), { code: 'ENOSPC' })
  } })
  await assert.rejects(spool.commitOutput(id, { bytes: await png(), mime: 'image/png' }), { code: 'spool_full', message: 'spool_full' })
  assert.ok((await lstat(join(spoolDir, id, 'output.png'))).isFile())
  assert.equal(await createSpool(spoolDir).readOutput(id), null)
  await assert.rejects(createSpool(spoolDir).commitOutput(id, { bytes: await png(), mime: 'image/png' }), { code: 'spool_output_exists' })
})

for (const [label, mutate] of [
  ['truncated JSON', () => '{'],
  ['wrong version', value => ({ ...value, version: 2 })],
  ['wrong job', value => ({ ...value, jobId: otherId })],
  ['wrong digest', value => ({ ...value, digest: 'a'.repeat(64) })],
  ['wrong MIME', value => ({ ...value, mime: 'image/jpeg' })],
  ['wrong size', value => ({ ...value, size: value.size + 1 })],
  ['oversized size', value => ({ ...value, size: 8 * 1024 * 1024 + 1 })],
  ['missing completion', value => { delete value.completedAt; return value }],
  ['invalid completion', value => ({ ...value, completedAt: 'not a date' })],
  ['future completion', value => ({ ...value, completedAt: new Date(Date.now() + day).toISOString() })],
  ['non-UTC completion', value => ({ ...value, completedAt: '2026-01-01T01:00:00+01:00' })],
  ['extra fields', value => ({ ...value, path: '/tmp/untrusted' })],
  ['oversized manifest', () => ' '.repeat(4097)],
]) {
  test(`recovery rejects ${label} without removing the evidence`, async t => {
    const { spool, jobDir } = await committed(t)
    const path = join(jobDir, 'manifest.json')
    const value = mutate(JSON.parse(await readFile(path, 'utf8')))
    await writeFile(path, typeof value === 'string' ? value : JSON.stringify(value))
    assert.equal(await spool.readOutput(id), null)
    assert.ok((await lstat(path)).isFile())
  })
}

test('caller mutation after image persistence cannot corrupt the durable receipt', async t => {
  const { spoolDir } = await makeDiskFixture(t)
  const bytes = await png()
  const original = Buffer.from(bytes)
  const spool = createSpool(spoolDir, { fault: stage => {
    if (stage === 'image_committed') bytes.fill(0)
  } })
  const result = await spool.commitOutput(id, { bytes, mime: 'image/png' })
  assert.equal(result.digest, digest(original))
  assert.deepEqual((await spool.readOutput(id)).bytes, original)
})

test('actual file and directory fsync complete in image-before-manifest order', async t => {
  const { spoolDir, dir } = await makeDiskFixture(t)
  const handle = await open(join(dir, 'probe'), 'wx')
  const prototype = Object.getPrototypeOf(handle)
  const sync = prototype.sync
  await handle.close()
  const events = []
  t.mock.method(prototype, 'sync', async function () {
    const stat = await this.stat()
    await sync.call(this)
    events.push(stat.isDirectory() ? 'directory' : 'file')
  })
  const spool = createSpool(spoolDir, { fault: stage => events.push(stage) })
  await spool.commitOutput(id, { bytes: await png(), mime: 'image/png' })
  assert.deepEqual(events, ['directory', 'directory', 'before_image_write', 'file',
    'before_image_rename', 'directory', 'image_committed', 'before_manifest_write',
    'file', 'before_manifest_rename', 'directory', 'manifest_committed'])
  events.length = 0
  await spool.writeInput(id, Buffer.from('source'))
  assert.deepEqual(events, ['before_input_write', 'file', 'before_input_rename', 'directory', 'input_committed'])
})

test('an actual file fsync failure fails closed with sanitized ENOSPC and recoverable evidence', async t => {
  const { spoolDir, dir } = await makeDiskFixture(t)
  const handle = await open(join(dir, 'probe'), 'wx')
  const prototype = Object.getPrototypeOf(handle)
  const sync = prototype.sync
  await handle.close()
  t.mock.method(prototype, 'sync', async function () {
    if ((await this.stat()).isFile()) throw Object.assign(new Error('private path'), { code: 'ENOSPC' })
    await sync.call(this)
  })
  const spool = createSpool(spoolDir)
  await assert.rejects(spool.commitOutput(id, { bytes: await png(), mime: 'image/png' }), { code: 'spool_full' })
  assert.equal(await spool.readOutput(id), null)
  assert.ok((await readdir(join(spoolDir, id))).some(name => name.endsWith('.tmp')))
})

for (const name of ['output.png', 'manifest.json']) {
  test(`a symlinked ${name} cannot be read or removed as a regular output artifact`, async t => {
    const { spool, jobDir, dir } = await committed(t)
    const path = join(jobDir, name)
    const outside = join(dir, 'outside')
    await writeFile(outside, await readFile(path))
    await unlink(path)
    await symlink(outside, path)
    await assert.rejects(spool.readOutput(id), { code: 'invalid_spool_path' })
    await assert.rejects(spool.removeOutput(id), { code: 'invalid_spool_path' })
    assert.ok((await lstat(outside)).isFile())
  })
}

test('recovery rejects truncated and digest-matching fake images', async t => {
  const { spool, jobDir } = await committed(t)
  await truncate(join(jobDir, 'output.png'), 16)
  assert.equal(await spool.readOutput(id), null)
  const bytes = Buffer.from('not an image')
  await writeFile(join(jobDir, 'output.png'), bytes)
  const path = join(jobDir, 'manifest.json')
  const manifest = JSON.parse(await readFile(path, 'utf8'))
  await writeFile(path, JSON.stringify({ ...manifest, digest: digest(bytes), size: bytes.length }))
  assert.equal(await spool.readOutput(id), null)
})

test('recovery bounds image reads before loading oversized disk artifacts', async t => {
  const { spool, jobDir } = await committed(t)
  await truncate(join(jobDir, 'output.png'), 8 * 1024 * 1024 + 1)
  assert.equal(await spool.readOutput(id), null)
})

test('invalid bytes, advertised types, and oversized output profiles cannot be committed', async t => {
  const { spoolDir } = await makeDiskFixture(t)
  const spool = createSpool(spoolDir)
  const bytes = await png()
  const oversized = await sharp({ create: { width: 1025, height: 1, channels: 3, background: 'black' } }).png().toBuffer()
  for (const output of [{ bytes, mime: 'image/jpeg' }, { bytes: Buffer.from('fake'), mime: 'image/png' },
    { bytes: Buffer.alloc(0), mime: 'image/png' }, { bytes: Buffer.alloc(8 * 1024 * 1024 + 1), mime: 'image/png' },
    { bytes: oversized, mime: 'image/png' }]) {
    await assert.rejects(spool.commitOutput(id, output), { code: 'invalid_spool_output' })
    assert.equal(await spool.readOutput(id), null)
  }
  for (const invalid of [Buffer.alloc(0), Buffer.alloc(8 * 1024 * 1024 + 1), 'source']) {
    await assert.rejects(spool.writeInput(id, invalid), { code: 'invalid_spool_input' })
  }
})

test('every job API rejects caller paths, noncanonical UUIDs, and trailing newlines', async t => {
  const { spoolDir } = await makeDiskFixture(t)
  const spool = createSpool(spoolDir)
  for (const bad of ['../escape', '/tmp/path', id + '\n', id.replace('8000', 'F000'), '', null]) {
    for (const invoke of [() => spool.writeInput(bad, Buffer.from('x')), () => spool.readInput(bad),
      () => spool.removeInput(bad), () => spool.commitOutput(bad, {}),
      () => spool.readOutput(bad), () => spool.removeOutput(bad), () => spool.sweep([bad], Date.now())]) {
      await assert.rejects(async () => invoke(), { code: 'invalid_job_id' })
    }
  }
})

test('symlinked job directories are rejected by reads, writes, deletes, and safely reported by sweep', async t => {
  const { spoolDir, dir } = await makeDiskFixture(t)
  const outside = join(dir, 'outside')
  await mkdir(outside)
  await writeFile(join(outside, 'input'), 'untouched')
  await mkdir(spoolDir)
  await symlink(outside, join(spoolDir, id))
  const spool = createSpool(spoolDir)
  for (const invoke of [() => spool.writeInput(id, Buffer.from('x')), () => spool.readInput(id),
    () => spool.removeInput(id), () => spool.commitOutput(id, { bytes: Buffer.from('x'), mime: 'image/png' }),
    () => spool.readOutput(id), () => spool.removeOutput(id)]) {
    await assert.rejects(invoke(), { code: 'invalid_spool_path' })
  }
  assert.deepEqual(await spool.sweep([], Date.now() + day), { removed: 0,
    errors: [{ jobId: id, code: 'invalid_spool_path' }] })
  assert.equal(await readFile(join(outside, 'input'), 'utf8'), 'untouched')
})

test('symlinked files and spool roots are rejected without following them', async t => {
  const { spool, spoolDir, dir, jobDir } = await committed(t)
  const outside = join(dir, 'private')
  await writeFile(outside, 'secret')
  await symlink(outside, join(jobDir, 'input'))
  await assert.rejects(spool.readInput(id), { code: 'invalid_spool_path' })
  await assert.rejects(spool.removeInput(id), { code: 'invalid_spool_path' })
  const alias = join(dir, 'alias')
  await symlink(spoolDir, alias)
  await assert.rejects(createSpool(alias).readOutput(id), { code: 'invalid_spool_path' })
  assert.equal(await readFile(outside, 'utf8'), 'secret')
})

test('deletion is idempotent and removes only its own input or output artifacts', async t => {
  const { spool, bytes } = await committed(t)
  await spool.writeInput(id, Buffer.from('source'))
  await spool.removeInput(id)
  await spool.removeInput(id)
  assert.deepEqual((await spool.readOutput(id)).bytes, bytes)
  await spool.writeInput(id, Buffer.from('new source'))
  await spool.removeOutput(id)
  await spool.removeOutput(id)
  assert.equal(await spool.readOutput(id), null)
  assert.equal((await spool.readInput(id)).toString(), 'new source')
  await spool.removeInput(otherId)
  await spool.removeOutput(otherId)
})

test('sweep preserves old live inputs and manifests, cleans temps, and removes aged orphans', async t => {
  const { spool, spoolDir, jobDir, bytes } = await committed(t)
  await spool.writeInput(id, Buffer.from('live source'))
  await spool.writeInput(otherId, Buffer.from('orphan source'))
  const temp = join(jobDir, 'output.00000000-0000-4000-8000-000000000003.tmp')
  await writeFile(temp, 'partial')
  const old = new Date(Date.now() - 2 * day)
  await utimes(jobDir, old, old)
  await utimes(join(spoolDir, otherId), old, old)
  const result = await spool.sweep(new Set([id]), Date.now())
  assert.deepEqual(result, { removed: 2, errors: [] })
  assert.equal((await spool.readInput(id)).toString(), 'live source')
  assert.deepEqual((await spool.readOutput(id)).bytes, bytes)
  assert.deepEqual(await readdir(spoolDir), [id])
  assert.ok(!(await readdir(jobDir)).includes(temp.split('/').at(-1)))
})

test('sweep retains fresh orphans and uses manifest completion rather than directory age', async t => {
  const { spool, spoolDir, jobDir, receipt } = await committed(t)
  await spool.writeInput(otherId, Buffer.from('fresh orphan'))
  const old = new Date(Date.now() - 2 * day)
  await utimes(jobDir, old, old)
  assert.deepEqual(await spool.sweep([], Date.parse(receipt.completedAt) + day - 1), { removed: 0, errors: [] })
  assert.ok(await spool.readOutput(id))
  assert.deepEqual(await spool.sweep([], Date.now() + day + 1000), { removed: 2, errors: [] })
  assert.deepEqual(await readdir(spoolDir), [])
})

for (const operation of ['read', 'delete', 'sweep']) {
  test(`${operation} is serialized behind an active output write, even across spool instances`, async t => {
    const { spoolDir } = await makeDiskFixture(t)
    let release
    const gate = new Promise(resolve => { release = resolve })
    let entered
    const ready = new Promise(resolve => { entered = resolve })
    const spool = createSpool(spoolDir, { fault: async stage => {
      if (stage === 'image_committed') { entered(); await gate }
    } })
    const writing = spool.commitOutput(id, { bytes: await png(), mime: 'image/png' })
    await ready
    const other = createSpool(spoolDir)
    let settled = false
    const pending = (operation === 'read' ? other.readOutput(id)
      : operation === 'delete' ? other.removeOutput(id) : other.sweep([id], Date.now() + day))
      .then(value => { settled = true; return value })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(settled, false)
    release()
    await writing
    const value = await pending
    if (operation === 'read') assert.ok(value?.completedAt)
    if (operation === 'delete') assert.equal(await other.readOutput(id), null)
    if (operation === 'sweep') assert.ok(await other.readOutput(id))
  })
}
