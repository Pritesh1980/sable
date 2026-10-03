import { useEffect, useState } from 'react'
import { getBackupSummary, hasPersistenceAcknowledgement, acknowledgePersistenceWarning, requiresPersistenceAcknowledgement } from '../data/backupStatus'
import { getStoragePersistence } from '../data/storagePersistence'

// The same full-library action used by Settings. This is not a separate
// concepts-only JSON export, and a request is not proof the file was saved.
export default function ConceptBackupStatus({ ownerId, concepts, onExport, revision = 0 }) {
  const [persistence, setPersistence] = useState(null)
  const [acknowledged, setAcknowledged] = useState(() => hasPersistenceAcknowledgement(ownerId))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    let current = true
    if (ownerId) getStoragePersistence().then((value) => { if (current) setPersistence(value) })
    return () => { current = false }
  }, [ownerId])
  if (!ownerId) return null
  const { requestedAt, paidSinceExport } = getBackupSummary(ownerId, concepts)
  void revision // ensures a fresh render after a request from Settings

  async function exportBackup() {
    setBusy(true)
    setMessage('Preparing portable backup…')
    try {
      await onExport()
      setMessage('Download requested—check the file was saved.')
    } catch (error) {
      setMessage(error?.message || 'Could not prepare a complete backup.')
    } finally { setBusy(false) }
  }

  return (
    <section aria-label="Paid image backup" className="border border-v2-hairline bg-v2-surface p-4 rounded-xs text-v2-cream font-v2-ui">
      <p className="font-v2-display text-lg">Paid image backup</p>
      <p className="text-sm text-v2-muted mt-1">{requestedAt ? `Download requested ${new Date(requestedAt).toLocaleString()}—check the file was saved` : 'No export requested'}</p>
      {paidSinceExport > 0 && <p className="text-sm text-v2-cream mt-1">Paid results saved since last export request: {paidSinceExport}</p>}
      <button type="button" disabled={busy} onClick={exportBackup} className="mt-3 min-h-11 px-4 border border-v2-cream text-v2-cream rounded-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-cream disabled:opacity-60">
        {busy ? 'Preparing…' : 'Export full library backup'}
      </button>
      {persistence && !acknowledged && requiresPersistenceAcknowledgement(ownerId, persistence) && (
        <div className="mt-3 border-l-2 border-v2-cream pl-3 text-sm text-v2-cream">
          <p>Browser storage may be cleared. It is not an off-device backup. Acknowledge this risk before your first paid refinement.</p>
          <button type="button" onClick={() => { acknowledgePersistenceWarning(ownerId); setAcknowledged(true) }} className="mt-2 min-h-11 px-3 border border-v2-cream rounded-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-v2-cream">I understand</button>
        </div>
      )}
      {message && <p role="status" className="mt-2 text-sm text-v2-muted">{message}</p>}
    </section>
  )
}
