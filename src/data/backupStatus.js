const key = (ownerId) => `tattoo_backup_status_${encodeURIComponent(ownerId)}`
const acknowledgementKey = (ownerId) => `tattoo_persistence_ack_${encodeURIComponent(ownerId)}`

export function paidVariantIds(concepts = []) {
  return [...new Set(concepts.flatMap((concept) => (concept.variants || [])
    .filter((variant) => variant?.generation?.provenance === 'relay' && typeof variant.id === 'string')
    .map((variant) => variant.id)))]
}

export function readBackupStatus(ownerId) {
  if (!ownerId) return null
  try {
    const parsed = JSON.parse(localStorage.getItem(key(ownerId)))
    return parsed && typeof parsed.requestedAt === 'string' && Array.isArray(parsed.paidVariantIds)
      ? parsed : null
  } catch { return null }
}

export function recordExportRequested(ownerId, at, paidVariantIdsAtRequest) {
  if (!ownerId) throw new Error('Cannot record a backup request without an owner.')
  const status = { requestedAt: at, paidVariantIds: [...new Set(paidVariantIdsAtRequest)] }
  localStorage.setItem(key(ownerId), JSON.stringify(status))
  return status
}

export function getBackupSummary(ownerId, concepts = []) {
  const status = readBackupStatus(ownerId)
  const recorded = new Set(status?.paidVariantIds || [])
  return {
    requestedAt: status?.requestedAt || null,
    paidSinceExport: paidVariantIds(concepts).filter((id) => !recorded.has(id)).length,
  }
}

export function hasPersistenceAcknowledgement(ownerId) {
  return !!ownerId && localStorage.getItem(acknowledgementKey(ownerId)) === '1'
}

// Paid-send UI calls this after requesting persistence. Manual concept actions
// do not consult it; the acknowledgement is scoped to this owner only.
export function requiresPersistenceAcknowledgement(ownerId, persistence) {
  return persistence !== 'granted' && !hasPersistenceAcknowledgement(ownerId)
}

export function acknowledgePersistenceWarning(ownerId) {
  if (!ownerId) throw new Error('Cannot acknowledge storage risk without an owner.')
  localStorage.setItem(acknowledgementKey(ownerId), '1')
}
