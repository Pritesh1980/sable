import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { canonicalRequest, compileRefinementPrompt, createRequestId, imageJobError,
  validateRefinementRequest, variantIdForJob } from '../../shared/imageJobs'
import { importCheckedConceptResult } from '../data/checkedConceptImport'
import { getCachedBlobUrl, keyForUrl } from '../data/blobUrls'
import { getStoragePersistence } from '../data/storagePersistence'
import { prepareRefinementSource } from '../data/imageJobs/prepareSource'

const ACTIVE = new Set(['accepted', 'dispatching', 'running'])
const fail = code => imageJobError(code, 409)
const initialState = () => ({ open: false, phase: 'idle', source: null, destination: null,
  draft: { change: 'Refine the composition', keep: 'Preserve the original character', palette: 'black' },
  draftRevision: 0, job: null, pending: null, comparison: null, error: null,
  capabilities: null, persistence: null, storageWarningAccepted: false, recoverableJobs: [], recovering: true })
const SAFE_ERRORS = new Set(['owner_changed', 'draft_changed', 'source_unreadable', 'source_too_large',
  'invalid_source', 'invalid_request', 'commit_unavailable', 'commit_unverified', 'commit_conflict',
  'storage_full', 'journal_unavailable', 'pending_not_found', 'idempotency_conflict', 'storage_warning_required',
  'relay_disabled', 'auth_unavailable', 'relay_unavailable', 'relay_error', 'relay_invalid_response',
  'acceptance_unknown', 'request_expired', 'key_clock_skew', 'unauthorized', 'owner_forbidden',
  'active_quota_exceeded', 'daily_quota_exceeded', 'destination_required', 'job_conflict', 'job_not_found',
  'result_expired', 'result_unavailable', 'result_digest_mismatch', 'invalid_result', 'confirmation_required',
  'source_unavailable', 'provider_failed', 'outcome_unknown'])

export async function importAndAcknowledge({ commit, ack, jobId }) {
  const variantId = variantIdForJob(jobId)
  const receipt = await commit()
  if (receipt?.committed !== true || receipt.variantId !== variantId
      || !receipt.ownerId || !receipt.conceptId || !receipt.imageKey) throw fail('commit_unverified')
  await ack(jobId)
  return receipt
}

/** Drafts stay mutable; accepted requests and their destinations never do. */
export function useConceptRefinement({ ownerId, ownerScope, concepts, commitConcepts, blobs, relay, journal }) {
  const [state, setState] = useState(initialState)
  const current = useRef(state)
  const latest = useRef({ ownerId, ownerScope, concepts, commitConcepts, blobs, relay, journal })
  const mounted = useRef(false)
  const busy = useRef(null)
  const api = useRef(null)

  function patch(values) {
    if (!mounted.current) return
    current.current = { ...current.current, ...values }
    setState(current.current)
  }

  function capture() {
    const snapshot = latest.current.ownerScope.capture()
    if (ownerId && snapshot.ownerId !== ownerId) throw fail('owner_changed')
    return { ...snapshot, scope: latest.current.ownerScope }
  }

  function assertSession(snapshot) {
    if (!mounted.current || latest.current.ownerScope !== snapshot.scope
        || (latest.current.ownerId && latest.current.ownerId !== snapshot.ownerId)) {
      throw fail('owner_changed')
    }
    latest.current.ownerScope.assertCurrent(snapshot)
  }

  function destinationExists(snapshot, destination) {
    assertSession(snapshot)
    if (destination.ownerId !== snapshot.ownerId
        || !latest.current.concepts.some(row => row.id === destination.conceptId)) throw fail('destination_required')
  }

  function assertDraft(snapshot, captured) {
    destinationExists(snapshot, captured.destination)
    if (current.current.source !== captured.source || current.current.draftRevision !== captured.revision
        || current.current.destination !== captured.destination) throw fail('draft_changed')
  }

  function report(error, snapshot, values = {}) {
    try { assertSession(snapshot) } catch { return }
    const code = SAFE_ERRORS.has(error?.code) ? error.code : 'relay_error'
    patch({ ...values, error: { code, message: code } })
  }

  function releaseSource() {
    if (current.current.source?.previewUrl) URL.revokeObjectURL(current.current.source.previewUrl)
  }

  async function openSource(destination, blob) {
    let snapshot
    let prepared
    const operation = Symbol('prepare')
    if (busy.current) return null
    busy.current = operation
    try {
      snapshot = capture()
      const target = { ownerId: snapshot.ownerId, conceptId: destination?.conceptId,
        parentVariantId: destination?.parentVariantId ?? null, draftRevision: current.current.draftRevision + 1 }
      destinationExists(snapshot, target)
      const concept = latest.current.concepts.find(row => row.id === target.conceptId)
      if (target.parentVariantId !== null
          ? !concept.variants?.some(variant => variant.id === target.parentVariantId && variant.imageUrl)
          : !concept.imageUrl) throw fail('invalid_source')
      if (destination.ownerId && destination.ownerId !== snapshot.ownerId) throw fail('owner_changed')
      releaseSource()
      patch({ open: true, source: null, destination: target, draftRevision: target.draftRevision,
        phase: 'preparing', comparison: null, error: null })
      prepared = await prepareRefinementSource(blob)
      destinationExists(snapshot, target)
      if (current.current.destination !== target) throw fail('draft_changed')
      patch({ source: prepared, phase: 'ready' })
      return prepared
    } catch (error) {
      if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl)
      if (snapshot) report(error, snapshot, { phase: 'ready' })
      return null
    } finally { if (busy.current === operation) busy.current = null }
  }

  function setDraft(fields) {
    const draft = { ...current.current.draft }
    for (const key of ['change', 'keep', 'palette']) if (Object.hasOwn(fields, key)) draft[key] = fields[key]
    patch({ draft, draftRevision: current.current.draftRevision + 1, error: null })
  }

  async function sendPending(pending, snapshot) {
    const job = await latest.current.relay.submit(pending)
    assertSession(snapshot)
    // A newer draft does not change the already-sent request or its destination.
    patch({ job, pending: { ...pending, jobId: job.id, accepted: true, source: null }, phase: 'waiting' })
    await latest.current.journal.markAccepted(snapshot.ownerId, pending.requestId, job.id)
    assertSession(snapshot)
    return job
  }

  async function submit({ storageWarningAccepted = false } = {}) {
    if (busy.current) return null
    const operation = Symbol('submit')
    busy.current = operation
    let snapshot
    try {
      snapshot = capture()
      const captured = { source: current.current.source, revision: current.current.draftRevision,
        destination: current.current.destination, draft: { ...current.current.draft } }
      if (!captured.source || !captured.destination) throw fail('source_unavailable')
      assertDraft(snapshot, captured)
      if (!latest.current.commitConcepts?.supported) throw fail('commit_unavailable')
      if (current.current.pending && !current.current.pending.accepted) throw fail('acceptance_unknown')
      if (current.current.job && (ACTIVE.has(current.current.job.state)
          || current.current.job.state === 'outcome_unknown')) throw fail('confirmation_required')
      patch({ phase: 'submitting', error: null })
      const caps = await latest.current.relay.capabilities()
      assertDraft(snapshot, captured)
      patch({ capabilities: caps })
      if (!caps.enabled) throw fail('relay_disabled')
      if (caps.quota.active) throw fail('active_quota_exceeded')
      if (!caps.quota.dailyRemaining) throw fail('daily_quota_exceeded')
      const request = validateRefinementRequest({ version: 1, operation: 'refine', profileId: caps.profile.id,
        ...captured.draft, prompt: compileRefinementPrompt(captured.draft) })
      const persistence = await getStoragePersistence(undefined, { request: true })
      assertDraft(snapshot, captured)
      patch({ persistence })
      if (persistence !== 'granted' && !storageWarningAccepted) throw fail('storage_warning_required')
      patch({ storageWarningAccepted })
      const issuedAt = latest.current.relay.serverNow()
      const pending = { requestId: createRequestId(issuedAt, crypto.randomUUID()), ownerId: snapshot.ownerId,
        source: captured.source.blob, sourceImageDigest: captured.source.digest, request,
        destination: { ...captured.destination, draftRevision: captured.revision }, createdAt: Date.now(),
        jobId: null, accepted: false }
      await latest.current.journal.put(pending)
      assertDraft(snapshot, captured)
      patch({ pending })
      return await sendPending(pending, snapshot)
    } catch (error) {
      if (snapshot) report(error, snapshot, { phase: current.current.pending?.accepted ? 'waiting' : 'ready' })
      return null
    } finally { if (busy.current === operation) busy.current = null }
  }

  async function importRecovered(jobId, chosenConceptId) {
    if (busy.current) return null
    const operation = Symbol('import')
    busy.current = operation
    let snapshot
    try {
      snapshot = capture()
      variantIdForJob(jobId)
      if (!latest.current.commitConcepts?.supported) throw fail('commit_unavailable')
      const markers = await latest.current.journal.list(snapshot.ownerId)
      assertSession(snapshot)
      const job = await latest.current.relay.status(jobId)
      assertSession(snapshot)
      const marker = markers.find(row => row.jobId === jobId || row.requestId === job.requestId)
      const conceptId = chosenConceptId ?? marker?.destination.conceptId
      const destination = { ownerId: snapshot.ownerId, conceptId, parentVariantId: marker?.destination.parentVariantId ?? null,
        draftRevision: marker?.destination.draftRevision ?? 0 }
      destinationExists(snapshot, destination)
      if (job.state !== 'succeeded') throw fail('job_conflict')
      if (marker && (marker.requestId !== job.requestId
          || (job.request && canonicalRequest(marker.request) !== canonicalRequest(job.request)))) throw fail('idempotency_conflict')
      patch({ phase: 'importing', job, error: null })
      const existing = latest.current.concepts.find(row => row.id === conceptId)?.variants
        ?.find(variant => variant.id === variantIdForJob(jobId))
      let commit
      if (!job.request) {
        // An ack response may be lost after the service has already scrubbed its
        // output. Verify the previously saved canonical variant, never invent metadata.
        const imageKey = keyForUrl(existing?.imageUrl) || existing?.image?.key
        if (!imageKey || existing?.generation?.jobId !== jobId) throw fail('result_expired')
        commit = () => latest.current.commitConcepts(rows => rows, {
          ownerId: snapshot.ownerId, conceptId, variantId: variantIdForJob(jobId), imageKey })
      } else {
        const result = await latest.current.relay.result(jobId)
        destinationExists(snapshot, destination)
        commit = () => importCheckedConceptResult({ blob: result.blob, job, destination,
          sourceLineage: marker ? { sourceConceptId: marker.destination.conceptId,
            parentVariantId: marker.destination.parentVariantId } : undefined,
          ownerScope: latest.current.ownerScope, blobs: latest.current.blobs,
          commitConcepts: latest.current.commitConcepts })
      }
      const receipt = await importAndAcknowledge({ jobId,
        commit: async () => {
          destinationExists(snapshot, destination)
          const receipt = await commit()
          destinationExists(snapshot, destination)
          if (receipt.ownerId !== snapshot.ownerId || receipt.conceptId !== conceptId) throw fail('commit_unverified')
          return receipt
        }, ack: async id => {
          destinationExists(snapshot, destination)
          await latest.current.relay.ack(id)
          destinationExists(snapshot, destination)
        } })
      destinationExists(snapshot, destination)
      if (marker) {
        await latest.current.journal.remove(snapshot.ownerId, marker.requestId)
        destinationExists(snapshot, destination)
      }
      const sourceConcept = marker && latest.current.concepts.find(row => row.id === marker.destination.conceptId)
      const sourceUrl = marker?.destination.parentVariantId
        ? sourceConcept?.variants?.find(variant => variant.id === marker.destination.parentVariantId)?.imageUrl
        : sourceConcept?.imageUrl
      patch({ phase: 'saved', comparison: { jobId, conceptId, variantId: receipt.variantId,
        sourceUrl: sourceUrl ?? null, resultUrl: getCachedBlobUrl(receipt.imageKey) || existing?.imageUrl || null },
      pending: current.current.pending?.requestId === marker?.requestId ? null : current.current.pending,
      recoverableJobs: current.current.recoverableJobs.filter(row => row.id !== jobId), error: null })
      return receipt
    } catch (error) {
      if (snapshot) report(error, snapshot, { phase: 'recoverable' })
      return null
    } finally { if (busy.current === operation) busy.current = null }
  }

  async function recover({ open = false } = {}) {
    let snapshot
    try {
      snapshot = capture()
      const revision = current.current.draftRevision
      patch({ recovering: true, ...(open ? { open: true } : {}) })
      await latest.current.journal.expire()
      assertSession(snapshot)
      const markers = await latest.current.journal.list(snapshot.ownerId)
      assertSession(snapshot)
      const caps = await latest.current.relay.capabilities()
      assertSession(snapshot)
      const jobs = caps.provider ? await latest.current.relay.list() : []
      assertSession(snapshot)
      for (const marker of markers.filter(row => !row.accepted)) {
        const found = jobs.find(job => job.requestId === marker.requestId)
        if (found) {
          if (found.request && canonicalRequest(found.request) !== canonicalRequest(marker.request)) throw fail('idempotency_conflict')
          await latest.current.journal.markAccepted(snapshot.ownerId, marker.requestId, found.id)
          assertSession(snapshot)
          marker.accepted = true; marker.jobId = found.id; marker.source = null
        }
      }
      const recoverableJobs = jobs.map(job => ({ ...job,
        destination: markers.find(row => row.jobId === job.id)?.destination ?? null }))
      const pending = current.current.pending ?? markers.find(row => !row.accepted) ?? null
      if (pending?.source && !current.current.source && current.current.draftRevision === revision) {
        // These bytes already passed preparation before the journal committed.
        patch({ source: { blob: pending.source, digest: pending.sourceImageDigest,
          previewUrl: URL.createObjectURL(pending.source) }, destination: pending.destination,
        draft: { change: pending.request.change, keep: pending.request.keep, palette: pending.request.palette },
        draftRevision: pending.destination.draftRevision, phase: 'recoverable' })
      }
      patch({ capabilities: caps, recoverableJobs, pending, recovering: false,
        job: current.current.job ?? jobs.find(job => ACTIVE.has(job.state)) ?? null })
      for (const job of recoverableJobs) {
        if (job.state === 'succeeded' && job.destination
            && latest.current.concepts.some(row => row.id === job.destination.conceptId)) {
          await api.current.importRecovered(job.id)
          assertSession(snapshot)
        }
      }
      return recoverableJobs
    } catch (error) {
      if (snapshot) report(error, snapshot, { recovering: false })
      return []
    }
  }

  async function retryUnaccepted({ confirmed = false } = {}) {
    if (busy.current) return null
    const operation = Symbol('retry')
    busy.current = operation
    let snapshot
    try {
      snapshot = capture()
      if (!latest.current.commitConcepts?.supported) throw fail('commit_unavailable')
      let pending = current.current.pending
      if (!pending || pending.accepted) {
        if (!confirmed) throw fail('confirmation_required')
        if (!current.current.source) throw fail('source_unavailable')
        if (current.current.job?.state !== 'outcome_unknown') throw fail('job_conflict')
        const storageWarningAccepted = current.current.storageWarningAccepted
        patch({ pending: null, job: null, error: null })
        busy.current = null
        return await submit({ storageWarningAccepted })
      }
      if (current.current.error?.code === 'request_expired') {
        if (!confirmed) throw fail('request_expired')
        const caps = await latest.current.relay.capabilities()
        assertSession(snapshot)
        if (!caps.enabled) throw fail('relay_disabled')
        const issuedAt = latest.current.relay.serverNow()
        const old = pending
        pending = { ...old, requestId: createRequestId(issuedAt, crypto.randomUUID()), createdAt: Date.now() }
        await latest.current.journal.put(pending)
        assertSession(snapshot)
        await latest.current.journal.remove(snapshot.ownerId, old.requestId)
        assertSession(snapshot)
      }
      if (pending.ownerId !== snapshot.ownerId) throw fail('owner_changed')
      destinationExists(snapshot, pending.destination)
      patch({ pending, phase: 'submitting', error: null })
      return await sendPending(pending, snapshot)
    } catch (error) {
      if (snapshot) report(error, snapshot, { phase: 'recoverable' })
      return null
    } finally { if (busy.current === operation) busy.current = null }
  }

  async function discard(jobId) {
    let snapshot
    try {
      snapshot = capture()
      variantIdForJob(jobId)
      await latest.current.relay.discard(jobId)
      assertSession(snapshot)
      const markers = await latest.current.journal.list(snapshot.ownerId)
      assertSession(snapshot)
      for (const marker of markers.filter(row => row.jobId === jobId)) {
        await latest.current.journal.remove(snapshot.ownerId, marker.requestId)
        assertSession(snapshot)
      }
      patch({ recoverableJobs: current.current.recoverableJobs.filter(row => row.id !== jobId),
        job: current.current.job?.id === jobId ? null : current.current.job,
        pending: current.current.pending?.jobId === jobId ? null : current.current.pending })
      return true
    } catch (error) { if (snapshot) report(error, snapshot); return false }
  }

  useLayoutEffect(() => {
    latest.current = { ownerId, ownerScope, concepts, commitConcepts, blobs, relay, journal }
    api.current = { importRecovered, recover, releaseSource, assertSession, capture, patch, report }
  })
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; api.current.releaseSource() }
  }, [])

  useEffect(() => {
    api.current.releaseSource()
    busy.current = null
    current.current = initialState()
    setState(current.current)
    void api.current.recover()
  }, [ownerId, ownerScope, relay, journal])

  const jobId = state.job?.id
  const jobState = state.job?.state
  useEffect(() => {
    if (!jobId || !ACTIVE.has(jobState)) return
    let stopped = false
    let timer
    let delay = 1000
    let snapshot
    try { snapshot = api.current.capture() } catch { return }
    const poll = async () => {
      try {
        const job = await latest.current.relay.status(jobId)
        api.current.assertSession(snapshot)
        if (stopped || current.current.job?.id !== jobId) return
        api.current.patch({ job, recoverableJobs: current.current.recoverableJobs.map(row => row.id === jobId ? { ...row, ...job } : row) })
        if (!ACTIVE.has(job.state)) {
          if (job.state === 'succeeded') await api.current.importRecovered(jobId)
          return
        }
      } catch (error) { if (!stopped) api.current.report(error, snapshot) }
      if (!stopped) { delay = Math.min(delay * 2, 10_000); timer = setTimeout(poll, delay) }
    }
    timer = setTimeout(poll, delay)
    return () => { stopped = true; clearTimeout(timer) }
  }, [jobId, jobState, ownerId, ownerScope])

  return { state, openSource, setDraft, submit, recover, importRecovered, retryUnaccepted, discard,
    close: () => patch({ open: false }) }
}
