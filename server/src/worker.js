import { imageJobError, LIMITS } from '../../shared/imageJobs.js'

const ACTIVE = new Set(['accepted', 'dispatching', 'running'])
const DISPATCHED = new Set(['dispatching', 'running'])

/** Single worker per persistent volume. Await start before admitting HTTP work.
 * paidEnabled may be a boolean or a synchronous gate, checked again after I/O.
 * stop drains the current attempt; it cannot cancel or refund dispatched work.
 */
export function createImageWorker({ repo, spool, provider, paidEnabled, now = Date.now, log = () => {} }) {
  let started = false
  let stopped = false
  let starting
  let timer
  let lane = Promise.resolve()

  function report(code) {
    // Only locally chosen constants reach logging, never error objects/paths.
    try { log({ code }) } catch { /* Logging must not change paid-job semantics. */ }
  }

  function serialize(action) {
    const pending = lane.then(action).catch(() => {
      report('worker_storage_error')
      throw imageJobError('worker_storage_error', 500)
    })
    lane = pending.catch(() => {})
    return pending
  }

  const enabled = () => !stopped && (typeof paidEnabled === 'function' ? paidEnabled() : paidEnabled) === true

  function hasCompletion(output, job) {
    if (typeof output?.completedAt !== 'string') return false
    const time = Date.parse(output.completedAt)
    return Number.isSafeInteger(time) && time >= Date.parse(job.dispatchedAt)
      && time <= now() && new Date(time).toISOString() === output.completedAt
  }

  function succeed(job, output) {
    const { digest, mime, size, completedAt } = output
    repo.transition(job.id, job.state, 'succeeded', {
      result: { digest, mime, size }, completedAt,
      expiresAt: Date.parse(completedAt) + LIMITS.outputRetentionMs,
    })
  }

  function uncertain(job) {
    repo.transition(job.id, job.state, 'outcome_unknown', { errorCode: 'provider_uncertain' })
  }

  async function recover() {
    for (const job of repo.listInternal()) {
      if (!DISPATCHED.has(job.state)) continue
      // An unreadable volume is not proof of a missing manifest: fail startup
      // closed and leave the durable state intact for the next recovery attempt.
      const output = await spool.readOutput(job.id)
      if (hasCompletion(output, job)) succeed(job, output)
      else uncertain(job)
    }
  }

  async function clean() {
    const clock = now()
    // Persist expiry before deleting accepted inputs or expired results.
    repo.expire(clock)
    for (const job of repo.listInternal()) {
      if (ACTIVE.has(job.state)) continue
      try { await spool.removeInput(job.id) } catch { report('input_cleanup_failed') }
      if (job.state !== 'succeeded' || job.acknowledgedAt || Date.parse(job.expiresAt) <= clock) {
        try { await spool.removeOutput(job.id) } catch { report('output_cleanup_failed') }
      }
      // Payload expiry cannot depend on successful filesystem deletion.
      repo.scrub(job.id)
    }
    try {
      const result = await spool.sweep(repo.listInternal().map(job => job.id), clock)
      if (result.errors.length) report('spool_cleanup_failed')
    } catch { report('spool_cleanup_failed') }
  }

  async function run() {
    if (!started || !enabled()) return false
    const claimed = repo.claimNext()
    if (!claimed) { await clean(); return false }
    let sourceBytes
    try { sourceBytes = await spool.readInput(claimed.id) } catch {
      repo.transition(claimed.id, 'dispatching', 'failed', { errorCode: 'input_unavailable' })
      await clean()
      return true
    }
    if (!enabled()) {
      repo.transition(claimed.id, 'dispatching', 'failed', { errorCode: 'worker_disabled' })
      await clean()
      return true
    }
    const job = repo.transition(claimed.id, 'dispatching', 'running')
    let output
    try {
      output = await provider.edit({ sourceBytes, prompt: job.request.prompt, profile: job.profile })
    } catch (error) {
      if (error?.code === 'provider_rejected') {
        repo.transition(job.id, 'running', 'failed', { errorCode: 'provider_rejected' })
      } else uncertain(job)
      await clean()
      return true
    }
    let receipt
    try {
      receipt = await spool.commitOutput(job.id, output)
    } catch {
      // A throw can happen *after* manifest rename/fsync. Never overwrite that
      // recoverable success with failure, and never call the provider again.
      try {
        const saved = await spool.readOutput(job.id)
        if (!hasCompletion(saved, job)) uncertain(job)
      } catch { /* Preserve running when durable evidence cannot be inspected. */ }
      report('output_commit_failed')
      await clean()
      return true
    }
    try {
      if (!hasCompletion(receipt, job)) throw imageJobError('invalid_timestamp', 500)
      succeed(job, receipt)
    } catch {
      // The manifest is durable. Startup can retry only the database promotion.
      report('result_record_failed')
    }
    await clean()
    return true
  }

  const worker = {
    start() {
      if (starting) return starting
      if (stopped) return Promise.resolve()
      starting = serialize(async () => {
        await recover()
        await clean()
        if (stopped) return
        started = true
        timer = setInterval(() => {
          // Use the same lane as explicit runOnce/cleanup calls. The gates are
          // checked inside the lane, not only when this timer was scheduled.
          void serialize(async () => {
            if (stopped) return
            await clean()
            await run()
          }).catch(() => {})
        }, 60_000)
        timer.unref?.()
      }).catch(error => { starting = undefined; throw error })
      return starting
    },
    runOnce: () => serialize(run),
    cleanup: () => serialize(clean),
    async stop() {
      stopped = true
      clearInterval(timer)
      await lane
    },
  }
  return worker
}
