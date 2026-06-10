import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Settings from '../pages/Settings'

const noop = () => {}

function renderSettings(props = {}) {
  return render(
    <Settings
      artists={[]}
      setArtists={noop}
      ideas={[]}
      setIdeas={noop}
      boards={[]}
      setBoards={noop}
      concepts={[]}
      setConcepts={noop}
      conventionOverrides={{}}
      setConventionOverrides={noop}
      {...props}
    />
  )
}

describe('Settings page', () => {
  beforeEach(() => {
    // jsdom has no object-URL support; the export path needs both.
    URL.createObjectURL = vi.fn(() => 'blob:fake')
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    delete URL.createObjectURL
    delete URL.revokeObjectURL
  })

  it('renders the backup panel with export and import actions', () => {
    renderSettings()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export backup/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /import backup/i })).toBeInTheDocument()
  })

  it('exports a backup when Export Backup is clicked', () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /export backup/i }))
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Backup exported.')).toBeInTheDocument()
  })
})
