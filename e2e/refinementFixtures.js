import { expect } from '@playwright/test'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const sharp = createRequire(import.meta.url)('sharp')
const width = 96, height = 128
const pixels = Buffer.alloc(width * height * 4)
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const ink = (y > 40 && y < 45 && x > 15 && x < 81)
    || (y >= 45 && y < 100 && (x === 25 || x === 45 || x === 65))
    || (y >= 98 && y < 103 && x > 15 && x < 81)
  const at = (y * width + x) * 4
  pixels.set(ink ? [30, 40, 35, 255] : [235, 225, 215, x < 8 ? 0 : 128], at)
}
export const sourcePng = await sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer()
export const resultPng = await sharp(sourcePng).tint({ r: 125, g: 80, b: 105 }).png().toBuffer()
export const orientationJpeg = await sharp({ create: { width: 32, height: 48, channels: 3, background: '#9f4545' } })
  .withMetadata({ orientation: 6 }).jpeg().toBuffer()
export const fixtureConcept = { id: 'temple', prompt: 'Temple study', imageUrl: `data:image/png;base64,${sourcePng.toString('base64')}`,
  tags: [], variants: [], createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z' }
export const ROW_KEY = 'tattoo_remote_fixture-owner_concepts'
export async function canonicalRows(page) {
  return page.evaluate(key => { const value = JSON.parse(localStorage.getItem(key) || '[]'); return value.rows || value }, ROW_KEY)
}

async function ackProof(page) {
  return page.evaluate(async key => {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    const rows = value.rows || value
    const variant = rows.flatMap(row => row.variants || []).find(row => row.generation?.provenance === 'relay')
    if (!variant) throw new Error('Acknowledgement preceded canonical variant save')
    const imageKey = typeof variant.imageUrl === 'string' ? variant.imageUrl : variant.imageUrl?.key
    const image = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tattoo-blobs-v1', 1)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const read = db.transaction('blobs').objectStore('blobs').get(imageKey)
        read.onsuccess = () => { db.close(); resolve(read.result) }
        read.onerror = () => { db.close(); reject(read.error) }
      }
    })
    if (!image?.startsWith('data:image/png;base64,')) throw new Error('Acknowledgement preceded canonical image save')
    return { rows, image, imageKey }
  }, ROW_KEY)
}

export async function installRelay(context, options = {}) {
  const relay = { posts: 0, dispatches: 0, ackProofs: [], requests: [], attemptIds: [], job: null, lastJob: null, enabled: options.enabled !== false,
    lostResponse: Boolean(options.lostResponse), expired: false, resultExpired: false,
    complete() { if (this.job) { this.job.state = 'succeeded'; this.job.completedAt = new Date().toISOString(); this.job.expiresAt = new Date(Date.now() + 86400000).toISOString() } },
    uncertain() { if (this.job) { this.job.state = 'outcome_unknown'; this.job.errorCode = 'outcome_unknown' } },
  }
  await context.route(/https?:\/\/[^/]*(?:openai\.com|supabase\.(?:co|com))\//, route => route.abort())
  await context.route('http://localhost:4199/**', async route => {
    const req = route.request()
    const path = new URL(req.url()).pathname
    const headers = { 'Access-Control-Allow-Origin': req.headers().origin || '*',
      'Access-Control-Allow-Headers': 'Authorization,Idempotency-Key,Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'X-Image-Digest', 'Cache-Control': 'no-store' }
    const json = (body, status = 200) => route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
    expect(req.headers().authorization).toBe('Bearer refinement-fixture-token-not-a-real-jwt')
    if (path === '/v1/image-capabilities') return json({ enabled: relay.enabled, operations: ['refine'], provider: 'openai',
      profile: { id: 'openai-refine-v1', model: 'fixture-model', size: '1024x1024', quality: 'medium', outputFormat: 'png' },
      quota: { active: relay.job && ['accepted', 'running'].includes(relay.job.state) ? 1 : 0, dailyRemaining: 10 }, serverTime: Date.now() })
    if (path === '/v1/image-jobs' && req.method() === 'GET') return json(relay.job ? [relay.job] : [])
    if (path === '/v1/image-jobs' && req.method() === 'POST') {
      relay.posts++
      relay.attemptIds.push(req.headers()['idempotency-key'])
      if (relay.expired) return json({ code: 'request_expired', serverTime: Date.now() }, 410)
      const form = await new Request(req.url(), { method: 'POST', headers: req.headers(), body: req.postDataBuffer() }).formData()
      const request = JSON.parse(form.get('request'))
      const image = Buffer.from(await form.get('image').arrayBuffer())
      const requestId = req.headers()['idempotency-key']
      relay.requests.push({ requestId, request, image })
      if (relay.job && relay.job.requestId !== requestId && ['accepted', 'running'].includes(relay.job.state)) {
        return json({ code: 'active_quota_exceeded' }, 429)
      }
      if (!relay.job) {
        relay.dispatches++
        const id = '00000000-0000-4000-8000-000000000017', createdAt = new Date().toISOString()
        relay.job = { id, requestId, state: 'accepted', createdAt, completedAt: null, expiresAt: null,
          errorCode: null, sourceImageDigest: createHash('sha256').update(image).digest('hex'), request,
          generation: { version: 1, jobId: id, provider: 'openai', model: 'fixture-model',
            profileId: 'openai-refine-v1', createdAt, provenance: 'relay' } }
      }
      if (relay.lostResponse) { relay.lostResponse = false; return route.abort('failed') }
      return json(relay.job, 202)
    }
    if (path.endsWith('/result')) {
      if (relay.resultGate) await relay.resultGate
      if (relay.resultExpired) return json({ code: 'result_expired', serverTime: Date.now() }, 410)
      return route.fulfill({ headers: { ...headers, 'X-Image-Digest': createHash('sha256').update(resultPng).digest('hex') }, contentType: 'image/png', body: resultPng })
    }
    if (path.endsWith('/ack')) {
      relay.ackProofs.push(await ackProof(req.frame().page()))
      expect(relay.ackProofs.at(-1).image).toBe(`data:image/png;base64,${resultPng.toString('base64')}`)
      const acknowledged = { ...(relay.job || relay.lastJob), request: null }
      relay.lastJob = acknowledged
      relay.job = null
      return json(acknowledged)
    }
    if (req.method() === 'DELETE') { const cancelled = { ...relay.job, state: 'cancelled' }; relay.job = null; return json(cancelled) }
    return relay.job ? json(relay.job) : json({ code: 'job_not_found' }, 404)
  })
  return relay
}

export async function openRefinementFixture(page, options = {}) {
  const relay = await installRelay(page.context(), options)
  await page.addInitScript(({ concept, key }) => {
    if (!localStorage.getItem('refinement-fixture-initialized')) {
      localStorage.setItem('refinement-fixture-initialized', '1')
      localStorage.setItem('refinement-fixture-session', JSON.stringify({ user: { id: 'fixture-owner', email: 'fixture@example.invalid' } }))
      localStorage.setItem(key, JSON.stringify([concept]))
    }
  }, { concept: fixtureConcept, key: ROW_KEY })
  await page.goto('concepts')
  await expect(page.getByRole('img', { name: 'Temple study', exact: true })).toBeVisible()
  await expect(page.getByText('Checking refinement recovery', { exact: true })).not.toBeVisible()
  return relay
}

export async function openComposer(page) {
  await page.getByRole('img', { name: 'Temple study', exact: true }).click()
  await page.getByRole('button', { name: 'Refine this', exact: true }).click()
  await expect(page.getByRole('img', { name: 'Prepared source image' })).toBeVisible()
}
export async function submitVariation(page) {
  await openComposer(page)
  await sendDraft(page)
}
export async function sendDraft(page) {
  await page.getByLabel('Change', { exact: true }).fill('Add mist around the temple / પ્રીતેશ')
  await page.getByRole('checkbox', { name: /Send this image and prompt to OpenAI/ }).check()
  const storage = page.getByRole('checkbox', { name: /browser storage may be cleared/ })
  if (await storage.count()) await storage.check()
  await page.getByRole('button', { name: 'Generate one variation' }).click()
}
