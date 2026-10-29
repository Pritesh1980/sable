import { useState, useRef } from 'react'
import { createBackupWithImages, parseBackup, replaceLibraryQuestion, restoreBackupImages, requestBackupDownload } from '../data/export'
import { useAuth } from '../context/useAuth'

// Compact: a v2 backup carries every photo as base64, so indentation would only
// add weight to a file that is already large.
export default function BackupPanel({ artists, setArtists, ideas, setIdeas, boards, setBoards, concepts, setConcepts, conventionOverrides, setConventionOverrides, onExport }) {
  const fileRef = useRef()
  const userId = useAuth()?.user?.id || null
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const photos = (n) => `${n} photo${n === 1 ? '' : 's'}`

  async function exportBackup() {
    if (busy) return
    setBusy(true)
    if (onExport) setMessage('Preparing portable backup…')
    try {
      if (onExport) {
        await onExport()
        setMessage('Download requested—check the file was saved.')
        return
      }
      const { backup, skipped } = await createBackupWithImages(
        { artists, ideas, boards, concepts, conventionOverrides },
        { onProgress: (done, total) => setMessage(`Exporting photos… ${done} of ${total}`) },
      )
      requestBackupDownload(backup)
      setMessage(skipped
        ? `Backup exported. ${photos(skipped)} couldn't be read right now (offline?) and ${skipped === 1 ? 'is' : 'are'} not included.`
        : 'Backup exported.')
    } catch (error) {
      setMessage(error.message || 'Could not export backup.')
    } finally {
      setBusy(false)
    }
  }

  async function importBackup(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy(true)
    try {
      const raw = JSON.parse(await file.text())
      const parsed = parseBackup(raw)
      // Validated first, so a bad file shows its error without a question. Asked
      // before any photo is staged: declining must leave nothing behind (#158).
      const question = replaceLibraryQuestion(
        { artists, ideas, boards, concepts, conventionOverrides }, parsed, raw.exportedAt)
      if (question && !window.confirm(question)) {
        setMessage('Import cancelled. Your library is unchanged.')
        return
      }
      // Photos embedded in the backup go through the normal staging/upload path
      // first, so the state set below already carries the new account's keys.
      const { data, failed } = await restoreBackupImages(parsed, { userId })
      setArtists(data.artists)
      setIdeas(data.ideas)
      setBoards(data.boards)
      setConcepts(data.concepts)
      setConventionOverrides(data.conventionOverrides)
      setMessage(failed
        ? `Backup imported. ${photos(failed)} couldn't be saved and ${failed === 1 ? 'was' : 'were'} left out.`
        : 'Backup imported.')
    } catch (error) {
      setMessage(error.message || 'Could not import backup.')
    } finally {
      setBusy(false)
      e.target.value = ''
    }
  }

  return (
    <div className="bg-ink-card border border-ink-border rounded-xs p-4 mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Backup</p>
          <p className="text-cream-muted/90 text-sm font-body leading-relaxed">
            Export or restore your library. Local saved images are embedded; external portfolio links remain references.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={exportBackup}
          disabled={busy}
          className="px-4 min-h-11 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-cream disabled:opacity-60"
        >
          {busy ? 'Preparing…' : 'Export Backup'}
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
        <button
          onClick={() => fileRef.current.click()}
          disabled={busy}
          className="px-4 min-h-11 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-cream text-sm font-body rounded-xs transition-colors"
        >
          Import Backup
        </button>
      </div>
      {message && <p role="status" className="text-xs font-mono text-cream-muted/90 mt-3">{message}</p>}
    </div>
  )
}
