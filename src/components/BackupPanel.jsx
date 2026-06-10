import { useState, useRef } from 'react'
import { createBackup, parseBackup } from '../data/export'

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function BackupPanel({ artists, setArtists, ideas, setIdeas, boards, setBoards, concepts, setConcepts, conventionOverrides, setConventionOverrides }) {
  const fileRef = useRef()
  const [message, setMessage] = useState('')

  function exportBackup() {
    const backup = createBackup({ artists, ideas, boards, concepts, conventionOverrides })
    const date = backup.exportedAt.slice(0, 10)
    downloadJson(`tattoo-backup-${date}.json`, backup)
    setMessage('Backup exported.')
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
    <div className="bg-ink-card border border-ink-border rounded-sm p-4 mb-8">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-mono text-cream-muted tracking-widest uppercase mb-1">Backup</p>
          <p className="text-cream-muted/90 text-sm font-body leading-relaxed">
            Export or restore artists, ideas, boards, concepts, notes, ranks, tags, and saved images.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={exportBackup}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-cream text-sm font-body rounded-sm transition-colors"
        >
          Export Backup
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importBackup} />
        <button
          onClick={() => fileRef.current.click()}
          className="px-4 py-2 border border-ink-border hover:border-cream-muted/50 text-cream-muted hover:text-cream text-sm font-body rounded-sm transition-colors"
        >
          Import Backup
        </button>
      </div>
      {message && <p className="text-xs font-mono text-cream-muted/90 mt-3">{message}</p>}
    </div>
  )
}
