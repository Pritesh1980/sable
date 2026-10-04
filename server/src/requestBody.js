import { File } from 'node:buffer'
import { imageJobError, LIMITS, validateRefinementRequest } from '../../shared/imageJobs.js'
import { validateImageMetadata } from './imageInput.js'

const MAX_UPLOAD_MS = 30_000
const CONTENT_TYPE = /^multipart\/form-data\s*;\s*boundary=(?:"([0-9A-Za-z'()+_,\-./:=? ]{1,70})"|([0-9A-Za-z'()+_,\-./:=?]{1,70}))$/i

function parseHeaders(headers, maxBytes) {
  const contentType = headers['content-type']
  const match = typeof contentType === 'string' && CONTENT_TYPE.exec(contentType)
  const encoding = headers['content-encoding']
  if (!match || match[0] !== contentType || (match[1] ?? match[2]).endsWith(' ')
      || (encoding !== undefined && encoding !== 'identity')) {
    throw imageJobError('invalid_multipart', 400)
  }
  const rawLength = headers['content-length']
  const transferEncoding = headers['transfer-encoding']
  if (transferEncoding !== undefined && (transferEncoding !== 'chunked' || rawLength !== undefined)) {
    throw imageJobError('invalid_content_length', 400)
  }
  let length
  if (rawLength !== undefined) {
    if (typeof rawLength !== 'string' || !/^[0-9]+$/u.test(rawLength) || rawLength.includes('\n')
        || !Number.isSafeInteger(Number(rawLength))) throw imageJobError('invalid_content_length', 400)
    length = Number(rawLength)
    if (length > maxBytes) throw imageJobError('body_too_large', 413)
  }
  return { contentType, boundary: match[1] ?? match[2], length }
}

function rejectPartEncodings(body, boundary) {
  const delimiter = Buffer.from(`--${boundary}`)
  const nextDelimiter = Buffer.from(`\r\n--${boundary}`)
  let offset = 0
  let parts = 0
  // Inspect only bounded part headers, never image contents. Native formData
  // decodes base64 transfer encodings; accepting those would change raw identity.
  while (offset < body.length) {
    if (!body.subarray(offset, offset + delimiter.length).equals(delimiter)) throw imageJobError('invalid_multipart', 400)
    offset += delimiter.length
    const suffix = body.toString('ascii', offset, offset + 2)
    if (suffix === '--') return
    if (suffix !== '\r\n' || ++parts > 2) throw imageJobError('invalid_multipart', 400)
    const headerEnd = body.indexOf('\r\n\r\n', offset + 2)
    if (headerEnd === -1) throw imageJobError('invalid_multipart', 400)
    const lines = body.toString('latin1', offset + 2, headerEnd).split('\r\n')
    for (const line of lines) {
      const name = line.slice(0, line.indexOf(':')).trim().toLowerCase()
      if (name === 'content-encoding' || name === 'content-transfer-encoding') throw imageJobError('invalid_multipart', 400)
    }
    const next = body.indexOf(nextDelimiter, headerEnd + 4)
    if (next === -1) throw imageJobError('invalid_multipart', 400)
    offset = next + 2
  }
  throw imageJobError('invalid_multipart', 400)
}

function bufferBody(req, { length, maxBytes, deadlineMs }) {
  return new Promise((resolve, reject) => {
    let body
    let received = 0
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      req.off('data', onData)
      req.off('end', onEnd)
      req.off('aborted', onAbort)
      if (error) {
        // Stop consuming without destroying the response socket. HTTP integration
        // must close a rejected upload after sending its safe error response.
        // Keep only error/close guards until then: Node emits ECONNRESET after
        // aborted. onClose removes both; no upload timer survives rejection.
        req.pause()
        body = undefined
        reject(error)
      } else {
        req.off('error', onAbort)
        req.off('close', onClose)
        resolve(body?.subarray(0, received) ?? Buffer.alloc(0))
      }
    }
    const onAbort = () => finish(imageJobError('upload_aborted', 400))
    const onClose = () => {
      onAbort()
      req.off('error', onAbort)
      req.off('close', onClose)
    }
    const onData = chunk => {
      if (!Buffer.isBuffer(chunk)) return onAbort()
      const nextSize = received + chunk.length
      if (nextSize > maxBytes) return finish(imageJobError('body_too_large', 413))
      if (length !== undefined && nextSize > length) return finish(imageJobError('invalid_content_length', 400))
      if (chunk.length === 0) return
      // One bounded allocation avoids retaining millions of tiny chunk objects.
      body ??= Buffer.allocUnsafe(length ?? maxBytes)
      chunk.copy(body, received)
      received = nextSize
    }
    const onEnd = () => {
      if (length !== undefined && received !== length) return finish(imageJobError('invalid_content_length', 400))
      if (req.complete === false) return onAbort()
      finish()
    }
    // Wall-clock deadline, not an idle timeout: trickled bytes do not reset it.
    const timer = setTimeout(() => finish(imageJobError('upload_timeout', 408)), deadlineMs)
    req.on('aborted', onAbort)
    req.on('error', onAbort)
    req.on('close', onClose)
    req.on('end', onEnd)
    req.on('data', onData)
  })
}

/**
 * Call only after authenticating headers. On rejection the HTTP caller must
 * close the request/socket after its safe error response (never drain an
 * unbounded upload). Header rejections attach nothing; mid-stream rejections
 * pause reading and clear timer/data/end/aborted listeners immediately, keeping
 * only error/close guards until close. Successful buffering removes everything.
 * Parsing/metadata rejections happen after buffering and leave no listeners.
 */
export async function readBoundedMultipart(req, { deadlineMs = MAX_UPLOAD_MS, maxBytes = LIMITS.maxBodyBytes } = {}) {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || !Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw imageJobError('invalid_request', 400)
  }
  maxBytes = Math.min(maxBytes, LIMITS.maxBodyBytes)
  deadlineMs = Math.min(deadlineMs, MAX_UPLOAD_MS)
  const { contentType, boundary, length } = parseHeaders(req.headers, maxBytes)
  if (req.aborted || req.destroyed || req.readableEnded) throw imageJobError('upload_aborted', 400)
  const body = await bufferBody(req, { length, maxBytes, deadlineMs })
  rejectPartEncodings(body, boundary)
  let form
  try {
    form = await new Request('http://localhost', {
      method: 'POST', headers: { 'content-type': contentType }, body,
    }).formData()
  } catch {
    throw imageJobError('invalid_multipart', 400)
  }
  const entries = [...form.entries()]
  const image = form.get('image')
  const json = form.get('request')
  if (entries.length !== 2 || form.getAll('image').length !== 1 || form.getAll('request').length !== 1
      || !(image instanceof File) || typeof json !== 'string') {
    throw imageJobError('invalid_multipart', 400)
  }
  let request
  try {
    request = validateRefinementRequest(JSON.parse(json))
  } catch {
    throw imageJobError('invalid_request', 400)
  }
  const sourceBytes = Buffer.from(await image.arrayBuffer())
  await validateImageMetadata(sourceBytes, image.type)
  return { request, sourceBytes }
}
