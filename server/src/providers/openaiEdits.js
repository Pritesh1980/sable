import sharp from 'sharp'
import { imageJobError, LIMITS } from '../../../shared/imageJobs.js'
import { validateImageMetadata } from '../imageInput.js'

const ENDPOINT = 'https://api.openai.com/v1/images/edits'
const PROFILE = Object.freeze({ id: 'openai-refine-v1', model: 'gpt-image-2.5-sunburst',
  size: '1024x1024', quality: 'medium', outputFormat: 'png' })
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024
const MAX_OUTPUT_BYTES = LIMITS.maxBodyBytes
const uncertain = () => imageJobError('provider_uncertain', 502)

async function awaitWithAbort(promise, signal) {
  if (signal.aborted) {
    // The operation may already have rejected while also aborting itself.
    void Promise.resolve(promise).catch(() => {})
    throw uncertain()
  }
  let onAbort
  const aborted = new Promise((_resolve, reject) => {
    onAbort = () => reject(uncertain())
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try { return await Promise.race([promise, aborted]) } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function requireProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(profile))
      || Reflect.ownKeys(profile).length !== Object.keys(PROFILE).length
      || Object.entries(PROFILE).some(([key, value]) => !Object.hasOwn(profile, key) || profile[key] !== value)) {
    throw imageJobError('invalid_provider_profile', 500)
  }
}

async function readBounded(response, signal) {
  const length = response.headers?.get('content-length')
  if (length !== null && length !== undefined && (/^\d+$/u.test(length) === false
      || Number(length) > MAX_RESPONSE_BYTES)) throw uncertain()
  if (!response.body || typeof response.body.getReader !== 'function') throw uncertain()
  const reader = response.body.getReader()
  const chunks = []
  let lengthRead = 0
  try {
    for (;;) {
      if (signal.aborted) throw uncertain()
      const { done, value } = await awaitWithAbort(reader.read(), signal)
      if (done) break
      if (!(value instanceof Uint8Array) || value.length > MAX_RESPONSE_BYTES - lengthRead) throw uncertain()
      lengthRead += value.length
      chunks.push(Buffer.from(value))
    }
  } catch (error) {
    // Stop consuming immediately on oversized or interrupted responses.
    void reader.cancel().catch(() => {})
    throw error
  } finally {
    try { reader.releaseLock() } catch { /* A pending read may still settle after abort. */ }
  }
  if (signal.aborted || lengthRead === 0) throw uncertain()
  return Buffer.concat(chunks, lengthRead)
}

async function decodeOutput(body) {
  let payload
  try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) } catch { throw uncertain() }
  if (!payload || !Array.isArray(payload.data) || payload.data.length !== 1) throw uncertain()
  const encoded = payload.data[0]?.b64_json
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > Math.ceil(MAX_OUTPUT_BYTES / 3) * 4
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) throw uncertain()
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_OUTPUT_BYTES || bytes.toString('base64') !== encoded) throw uncertain()
  try {
    await validateImageMetadata(bytes, 'image/png')
    const decoder = sharp(bytes, { limitInputPixels: 1024 * 1024, failOn: 'warning' })
    const { width, height } = await decoder.metadata()
    if (width > 1024 || height > 1024) throw uncertain()
    await decoder.raw().toBuffer()
  } catch { throw uncertain() }
  return { bytes, mime: 'image/png' }
}

/** One paid edit attempt. The caller gates payment and supplies the frozen service profile. */
export function createOpenAiEdits({ apiKey, fetchImpl = fetch, timeoutMs = 120000 }) {
  if (typeof apiKey !== 'string' || !apiKey || /[\r\n]/u.test(apiKey)
      || typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs)
      || timeoutMs < 1 || timeoutMs > 120000) throw imageJobError('invalid_provider_config', 500)

  return Object.freeze({
    async edit({ sourceBytes, prompt, profile, signal } = {}) {
      requireProfile(profile)
      if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length === 0 || sourceBytes.length > LIMITS.maxBodyBytes
          || typeof prompt !== 'string' || !prompt.trim() || prompt.length > 32000) {
        throw imageJobError('invalid_provider_input', 500)
      }
      if (signal?.aborted) throw uncertain()
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      const timer = setTimeout(abort, timeoutMs)
      try {
        const form = new FormData()
        form.set('model', profile.model)
        form.set('prompt', prompt)
        form.set('n', '1')
        form.set('size', profile.size)
        form.set('quality', profile.quality)
        form.set('output_format', 'png')
        form.set('image[]', new Blob([sourceBytes], { type: 'image/png' }), 'source.png')
        const response = await awaitWithAbort(fetchImpl(ENDPOINT, {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: controller.signal,
        }), controller.signal)
        if (controller.signal.aborted) throw uncertain()
        if (!response || typeof response.status !== 'number') throw uncertain()
        if (!response.ok) {
          throw response.status >= 400 && response.status < 500
            ? imageJobError('provider_rejected', 502) : uncertain()
        }
        const output = await decodeOutput(await readBounded(response, controller.signal))
        if (controller.signal.aborted) throw uncertain()
        return output
      } catch (error) {
        if (error?.code === 'provider_rejected') throw error
        throw uncertain()
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
      }
    },
  })
}
