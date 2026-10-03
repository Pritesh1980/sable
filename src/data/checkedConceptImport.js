import { uploadConceptResult } from './conceptResultUpload'
import { createConceptVariant, upsertRefinementVariant } from './conceptVariants'
import { variantIdForJob } from '../../shared/imageJobs'

// Only this internal, checked boundary opts into trusted relay provenance.
// sourceLineage comes from the saved journal, never from a newly chosen target.
export async function importCheckedConceptResult({ blob, job, destination, sourceLineage, ownerScope, blobs, commitConcepts }) {
  const snapshot = ownerScope.capture()
  const { ownerId, conceptId } = destination
  if (snapshot.ownerId !== ownerId) throw Object.assign(new Error('Owner changed'), { code: 'owner_changed' })
  const { imageKey, imageUrl } = await uploadConceptResult(blob, { ownerId, conceptId, jobId: job.id, ownerScope, blobs })
  ownerScope.assertCurrent(snapshot)
  const variant = createConceptVariant({
    provider: 'openai', imageUrl, operation: 'refine', generation: job.generation,
    sourceImageDigest: job.sourceImageDigest, refinement: job.request,
    sourceConceptId: sourceLineage?.sourceConceptId, parentVariantId: sourceLineage?.parentVariantId,
  }, { provenance: 'relay', id: variantIdForJob(job.id) })
  const receipt = await commitConcepts((rows) => {
    if (!rows.some((row) => row.id === conceptId)) throw Object.assign(new Error('Destination unavailable'), { code: 'commit_conflict' })
    return rows.map((row) => row.id === conceptId ? upsertRefinementVariant(row, variant) : row)
  }, { ownerId, conceptId, variantId: variant.id, imageKey })
  ownerScope.assertCurrent(snapshot)
  if (!receipt?.committed || receipt.ownerId !== ownerId || receipt.conceptId !== conceptId
    || receipt.variantId !== variant.id || receipt.imageKey !== imageKey) {
    throw Object.assign(new Error('Import unconfirmed'), { code: 'commit_conflict' })
  }
  return receipt
}
