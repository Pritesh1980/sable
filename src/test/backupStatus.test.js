import { beforeEach, expect, it } from 'vitest'
import { acknowledgePersistenceWarning, getBackupSummary, hasPersistenceAcknowledgement, readBackupStatus, recordExportRequested, requiresPersistenceAcknowledgement } from '../data/backupStatus'

beforeEach(() => localStorage.clear())

it('counts a later saved paid variant since the last download request for its owner', () => {
  recordExportRequested('A', '2026-09-28T12:00:00.000Z', ['relay:first'])
  const concepts = [{ variants: [
    { id: 'relay:first', generation: { provenance: 'relay' } },
    { id: 'relay:later', generation: { provenance: 'relay' } },
    { id: 'manual', generation: { provenance: 'user-import' } },
  ] }]
  expect(getBackupSummary('A', concepts)).toEqual({ requestedAt: '2026-09-28T12:00:00.000Z', paidSinceExport: 1 })
  expect(readBackupStatus('B')).toBeNull()
})

it('treats all paid variants as unrequested when no export was requested', () => {
  expect(getBackupSummary('A', [{ variants: [{ id: 'r', generation: { provenance: 'relay' } }] }])).toEqual({
    requestedAt: null, paidSinceExport: 1,
  })
})

it('requires an explicit owner-specific acknowledgement when persistence is denied or unavailable', () => {
  expect(requiresPersistenceAcknowledgement('A', 'denied')).toBe(true)
  expect(requiresPersistenceAcknowledgement('A', 'unavailable')).toBe(true)
  expect(requiresPersistenceAcknowledgement('A', 'granted')).toBe(false)
  acknowledgePersistenceWarning('A')
  expect(hasPersistenceAcknowledgement('A')).toBe(true)
  expect(requiresPersistenceAcknowledgement('A', 'denied')).toBe(false)
  expect(requiresPersistenceAcknowledgement('B', 'denied')).toBe(true)
})
