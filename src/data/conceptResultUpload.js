import { variantIdForJob } from '../../shared/imageJobs'
import { registerBlobUrl } from './blobUrls'

const invalid = () => Object.assign(new Error('Unreadable result'), { code: 'invalid_result' })

async function digest(blob) {
  const bytes = await blob.arrayBuffer()
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

// Never transcode paid output through the legacy JPEG/data-URL upload path.
export async function uploadConceptResult(blob, { ownerId, conceptId, jobId, ownerScope, blobs }) {
  const extension = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[blob?.type]
  if (!extension || !blob.size || !/^[a-zA-Z0-9_@.:-]{1,256}$/.test(ownerId) || ['.', '..'].includes(ownerId)
    || typeof conceptId !== 'string' || !conceptId.trim() || conceptId.length > 256) throw invalid()
  variantIdForJob(jobId)
  const snapshot = ownerScope.capture()
  if (snapshot.ownerId !== ownerId) throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
  const imageKey = `user/${ownerId}/concepts/${encodeURIComponent(conceptId)}/${jobId}.${extension}`
  await blobs.upload(ownerId, imageKey, blob, blob.type)
  ownerScope.assertCurrent(snapshot)
  const imageUrl = await blobs.getUrl(imageKey)
  ownerScope.assertCurrent(snapshot)
  try {
    if (!imageUrl) throw invalid()
    const response = await fetch(imageUrl)
    ownerScope.assertCurrent(snapshot)
    if (!response.ok) throw invalid()
    const saved = await response.blob()
    ownerScope.assertCurrent(snapshot)
    if (!saved.size || await digest(saved) !== await digest(blob)) throw invalid()
  } catch (error) {
    ownerScope.assertCurrent(snapshot)
    if (error.code === 'owner_changed') throw error
    throw invalid()
  }
  ownerScope.assertCurrent(snapshot)
  registerBlobUrl(imageKey, imageUrl)
  return { imageKey, imageUrl }
}
