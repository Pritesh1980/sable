import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readdir, realpath, rename, rmdir, unlink } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import { imageJobError, LIMITS, variantIdForJob } from '../../shared/imageJobs.js'
import { validateImageMetadata } from './imageInput.js'

// One service process owns the volume. Share the queue across Spool instances so
// reads, deletes and startup sweep cannot observe/erase a half-finished write.
const queues = new Map()
const names = new Set(['input', 'output.png', 'manifest.json'])
const tempPattern = /^(input|output|manifest)\.[0-9a-f-]{36}\.tmp$/u
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => imageJobError(code, 500)

function safeError(error) {
  if (error?.code === 'ENOSPC') return fail('spool_full')
  if (['ELOOP', 'ENOTDIR'].includes(error?.code)) return fail('invalid_spool_path')
  if (error?.status && /^(invalid_|spool_)/u.test(error.code)) return error
  return fail('spool_io_error')
}

async function statOrNull(path) {
  try { return await lstat(path) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

function requireDirectory(stat) {
  if (!stat?.isDirectory() || stat.isSymbolicLink()) throw fail('invalid_spool_path')
}

function requireFile(stat) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw fail('invalid_spool_path')
}

async function syncDirectory(path) {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY)
  try { await handle.sync() } finally { await handle.close() }
}

async function readBounded(path, max) {
  const stat = await statOrNull(path)
  if (!stat) return null
  requireFile(stat)
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = await handle.stat()
    requireFile(opened)
    if (opened.size < 1 || opened.size > max) throw fail('spool_corrupt')
    // Read at most the observed size + one byte, even if an artifact grows.
    const bytes = Buffer.alloc(opened.size + 1)
    let offset = 0
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
      if (!bytesRead) break
      offset += bytesRead
    }
    if (offset !== opened.size) throw fail('spool_corrupt')
    return bytes.subarray(0, offset)
  } finally { await handle.close() }
}

async function validateOutput(bytes, mime) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > LIMITS.maxBodyBytes || mime !== 'image/png') {
    throw fail('invalid_spool_output')
  }
  try {
    await validateImageMetadata(bytes, mime)
    const decoder = sharp(bytes, { limitInputPixels: 1024 * 1024, failOn: 'warning' })
    const { width, height } = await decoder.metadata()
    if (width > 1024 || height > 1024) throw fail('invalid_spool_output')
    await decoder.raw().toBuffer() // Check all pixels, not just a PNG signature.
  } catch { throw fail('invalid_spool_output') }
}

function validManifest(value, jobId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const fields = ['version', 'jobId', 'digest', 'mime', 'size', 'completedAt']
  const time = Date.parse(value.completedAt)
  return Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key))
    && value.version === 1 && value.jobId === jobId && value.mime === 'image/png'
    && typeof value.digest === 'string' && value.digest.length === 64 && /^[a-f0-9]+$/u.test(value.digest)
    && Number.isSafeInteger(value.size) && value.size > 0 && value.size <= LIMITS.maxBodyBytes
    && typeof value.completedAt === 'string' && Number.isFinite(time) && time >= 0 && time <= Date.now()
    && new Date(time).toISOString() === value.completedAt
}

const receipt = ({ digest, mime, size, completedAt }) => ({ digest, mime, size, completedAt })

/** Durable, private single-process spool. The directory is trusted configuration;
 * all per-job paths are derived from validated UUIDs, never caller-supplied paths.
 * completedAt is part of both receipts and recovered output (R3).
 */
export function createSpool(dir, { fault = () => {} } = {}) {
  const configuredRoot = resolve(dir)

  async function run(action) {
    let root
    try {
      // Canonicalize the configured parent for shared-queue identity (e.g. /tmp
      // on macOS), but do not permit the spool directory itself to be a symlink.
      root = join(await realpath(dirname(configuredRoot)), basename(configuredRoot))
      const previous = queues.get(root) ?? Promise.resolve()
      const pending = previous.then(async () => {
        let stat = await statOrNull(root)
        if (!stat) {
          await mkdir(root, { mode: 0o700 })
          await syncDirectory(dirname(root))
          stat = await lstat(root)
        }
        requireDirectory(stat)
        return action(root)
      })
      const settled = pending.catch(() => {})
      queues.set(root, settled)
      try { return await pending } finally {
        if (queues.get(root) === settled) queues.delete(root)
      }
    } catch (error) { throw safeError(error) }
  }

  async function jobDirectory(root, jobId, create = false) {
    const path = join(root, jobId)
    let stat = await statOrNull(path)
    if (!stat && create) {
      await mkdir(path, { mode: 0o700 })
      await syncDirectory(root)
      stat = await lstat(path)
    }
    if (!stat) return null
    requireDirectory(stat)
    return path
  }

  function withJob(jobId, action, create = false) {
    // Async rejection is consistent for validation failures in every method.
    return Promise.resolve().then(() => {
      variantIdForJob(jobId)
      return run(async root => action(await jobDirectory(root, jobId, create)))
    })
  }

  async function atomicWrite(directory, name, kind, bytes) {
    await fault(`before_${kind}_write`)
    const temp = join(directory, `${name === 'output.png' ? 'output' : name === 'manifest.json' ? 'manifest' : name}.${randomUUID()}.tmp`)
    const handle = await open(temp, 'wx', 0o600)
    try { await handle.writeFile(bytes); await handle.sync() } finally { await handle.close() }
    await fault(`before_${kind}_rename`)
    const target = join(directory, name)
    const existing = await statOrNull(target)
    if (existing) { requireFile(existing); throw fail('spool_output_exists') }
    await rename(temp, target)
    await syncDirectory(directory)
  }

  async function readOutput(directory, jobId) {
    if (!directory) return null
    try {
      const json = await readBounded(join(directory, 'manifest.json'), 4096)
      if (!json) return null
      let manifest
      try { manifest = JSON.parse(json.toString('utf8')) } catch { return null }
      if (!validManifest(manifest, jobId)) return null
      const bytes = await readBounded(join(directory, 'output.png'), LIMITS.maxBodyBytes)
      if (!bytes || bytes.length !== manifest.size || hash(bytes) !== manifest.digest) return null
      await validateOutput(bytes, manifest.mime)
      return { bytes, ...receipt(manifest) }
    } catch (error) {
      if (['spool_corrupt', 'invalid_spool_output', 'ENOENT'].includes(error.code)) return null
      throw error
    }
  }

  async function removeFiles(directory, selected) {
    const files = (await readdir(directory)).filter(selected)
    // Validate all selected artifacts before deleting any; never recurse into an
    // unexpected directory or follow a symlink even during orphan cleanup.
    for (const name of files) requireFile(await lstat(join(directory, name)))
    for (const name of files) await unlink(join(directory, name))
    if (files.length) await syncDirectory(directory)
    return files.length
  }

  return {
    writeInput(jobId, bytes) {
      if (Buffer.isBuffer(bytes) && bytes.length <= LIMITS.maxBodyBytes) bytes = Buffer.from(bytes)
      return withJob(jobId, async directory => {
        if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > LIMITS.maxBodyBytes) throw fail('invalid_spool_input')
        const existing = await statOrNull(join(directory, 'input'))
        if (existing) { requireFile(existing); throw fail('spool_input_exists') }
        await atomicWrite(directory, 'input', 'input', bytes)
        await fault('input_committed')
        return jobId // Opaque internal reference; readInput still accepts only a UUID.
      }, true)
    },
    readInput(jobId) {
      return withJob(jobId, async directory => {
        const bytes = directory && await readBounded(join(directory, 'input'), LIMITS.maxBodyBytes)
        if (!bytes) throw fail('spool_input_missing')
        return bytes
      })
    },
    removeInput(jobId) {
      return withJob(jobId, async directory => {
        if (directory) await removeFiles(directory, name => name === 'input' || (tempPattern.test(name) && name.startsWith('input.')))
      })
    },
    commitOutput(jobId, { bytes, mime }) {
      // Own the bytes across awaits; caller mutation must not change the digest
      // after the image has already been written and synced.
      if (Buffer.isBuffer(bytes) && bytes.length <= LIMITS.maxBodyBytes) bytes = Buffer.from(bytes)
      return withJob(jobId, async directory => {
        await validateOutput(bytes, mime)
        const saved = await readOutput(directory, jobId)
        if (saved) {
          if (saved.digest !== hash(bytes)) throw fail('spool_output_exists')
          return receipt(saved)
        }
        for (const name of ['output.png', 'manifest.json']) {
          const existing = await statOrNull(join(directory, name))
          if (existing) { requireFile(existing); throw fail('spool_output_exists') }
        }
        await atomicWrite(directory, 'output.png', 'image', bytes)
        // Capture completion at the first durable image, before any fault seam or
        // DB promotion. A surviving manifest can never extend this time on replay.
        const completedAt = new Date().toISOString()
        await fault('image_committed')
        const result = { digest: hash(bytes), mime, size: bytes.length, completedAt }
        const manifest = { version: 1, jobId, ...result }
        await atomicWrite(directory, 'manifest.json', 'manifest', Buffer.from(JSON.stringify(manifest)))
        await fault('manifest_committed')
        return result
      }, true)
    },
    readOutput(jobId) {
      return withJob(jobId, directory => readOutput(directory, jobId))
    },
    removeOutput(jobId) {
      return withJob(jobId, async directory => {
        if (!directory) return
        // Invalidate success durably before deleting bytes, including on a crash.
        await removeFiles(directory, name => name === 'manifest.json')
        await removeFiles(directory, name => name === 'output.png' || (tempPattern.test(name) && !name.startsWith('input.')))
      })
    },
    async sweep(liveJobIds, nowMs) {
      const live = new Set(liveJobIds)
      for (const jobId of live) variantIdForJob(jobId)
      if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw fail('invalid_timestamp')
      return run(async root => {
        const result = { removed: 0, errors: [] }
        for (const jobId of await readdir(root)) {
          try { variantIdForJob(jobId) } catch { continue }
          try {
            const directory = await jobDirectory(root, jobId)
            const stat = await lstat(directory)
            const output = await readOutput(directory, jobId)
            const since = output ? Date.parse(output.completedAt) : stat.mtimeMs
            if (!live.has(jobId) && nowMs - since >= LIMITS.outputRetentionMs) {
              const files = await readdir(directory)
              if (files.some(name => !names.has(name) && !tempPattern.test(name))) throw fail('invalid_spool_path')
              await removeFiles(directory, () => true)
              await rmdir(directory)
              await syncDirectory(root)
              result.removed += 1
            } else {
              result.removed += await removeFiles(directory, name => tempPattern.test(name))
            }
          } catch (error) { result.errors.push({ jobId, code: safeError(error).code }) }
        }
        return result
      })
    },
  }
}
