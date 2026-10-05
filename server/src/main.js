import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createOwnerVerifier } from './auth.js'
import { readRelayConfig } from './config.js'
import { createRelayServer } from './http.js'
import { createJobRepository } from './jobRepository.js'
import { createOpenAiEdits } from './providers/openaiEdits.js'
import { createSpool } from './spool.js'
import { createImageWorker } from './worker.js'
import { imageJobError } from '../../shared/imageJobs.js'

export function createShutdown({ server, worker, repo }) {
  let stopping
  return () => {
    stopping ??= (async () => {
      const connections = new Promise(resolve => server.close(resolve))
      const jobs = worker.stop()
      await Promise.all([connections, jobs])
      repo.close()
    })()
    return stopping
  }
}

export async function main() {
  const config = readRelayConfig()
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 })
  const repo = createJobRepository(join(config.dataDir, 'jobs.sqlite'))
  const spool = createSpool(join(config.dataDir, 'spool'))
  const verifyOwner = createOwnerVerifier(config)
  const provider = config.paidEnabled
    ? createOpenAiEdits({ apiKey: config.providerKey, timeoutMs: config.providerTimeoutMs })
    : { async edit() { throw imageJobError('worker_disabled', 503) } }
  const log = event => process.stdout.write(`${JSON.stringify(event)}\n`)
  const worker = createImageWorker({ repo, spool, provider, paidEnabled: config.paidEnabled, log })
  const server = createRelayServer({ config, verifyOwner, repo, spool, worker, log })
  await worker.start()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.port, config.host, resolve)
  })
  log({ event: 'relay_started' })

  const stop = createShutdown({ server, worker, repo })
  process.once('SIGTERM', () => { void stop() })
  return { server, worker, repo, stop }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
