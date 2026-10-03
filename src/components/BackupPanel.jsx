import { useState, useRef } from 'react'
import { parseBackup } from '../data/export'

export default function BackupPanel({ setArtists, setIdeas, setBoards, setConcepts, setConventionOverrides, onExport }) {
  const fileRef = useRef()
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function exportBackup() {
    if (busy) return
    setBusy(true)
    setMessage('Preparing portable backup…')
    try {
      await onExport()
      setMessage('Download requested—check the file was saved.')
    } catch (error) {
      setMessage(error?.message || 'Could not prepare a complete backup. Nothing was downloaded.')
    } finally {
      setBusy(false)
    }
  }

  async function importBackup(e) {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const data = parseBackup(await file.text())
      setArtists(data.artists)
      setIdeas(data.ideas)
      setBoards(data.boards)
      setConcepts(data.concepts)
      setConventionOverrides(data.conventionOverrides)
      setMessage('Backup imported.')
    } catch (error) {
      setMessage(error.message || 'Could not import backup.')
    } finally {
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
          className="px-4 min-h-11 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-cream text-sm font-body rounded-xs transition-colors"
        >
          Import Backup
        </button>
      </div>
      {message && <p role="status" className="text-xs font-mono text-cream-muted/90 mt-3">{message}</p>}
    </div>
  )
}
