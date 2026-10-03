import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Settings from '../pages/Settings'
import { isIOS, getShareShortcutUrl } from '../data/platform'
import { backend } from '../backend'
import { AuthContext } from '../context/auth-context'

vi.mock('../data/platform', () => ({
  isIOS: vi.fn(() => false),
  getShareShortcutUrl: vi.fn(() => ''),
}))

const noop = () => {}

function renderSettings(props = {}, auth = null) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
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
        onExportBackup={async () => {}}
        {...props}
        />
      </AuthContext.Provider>
    </MemoryRouter>
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

  it('reports a requested download without claiming the file was saved', async () => {
    renderSettings()
    fireEvent.click(screen.getByRole('button', { name: /export backup/i }))
    expect(await screen.findByText('Download requested—check the file was saved.')).toBeInTheDocument()
  })

  it('describes device-only and cloud sign-in restoration separately', () => {
    const original = backend.kind
    try {
      backend.kind = 'local'
      const local = renderSettings({}, { user: { id: 'A', email: 'a@example.test' }, signOut: noop })
      expect(screen.getByText(/same owner on this device/i)).toBeInTheDocument()
      expect(screen.getByText(/not a cloud copy/i)).toBeInTheDocument()
      local.unmount()
      backend.kind = 'supabase'
      renderSettings({}, { user: { id: 'A', email: 'a@example.test' }, signOut: noop })
      expect(screen.getByText(/cloud-stored library syncs/i)).toBeInTheDocument()
    } finally { backend.kind = original }
  })
})

// #45: share-to-Sable needs a Shortcut on iOS (WebKit doesn't support share
// targets), and today the setup only exists in docs/ — invisible to anyone
// who doesn't go looking. Surface it in Settings, gated on iOS.
describe('Settings page: iOS share-to-Sable (#45)', () => {
  beforeEach(() => {
    isIOS.mockReturnValue(false)
    getShareShortcutUrl.mockReturnValue('')
  })

  it('shows nothing on non-iOS', () => {
    renderSettings()
    expect(screen.queryByText(/share to sable/i)).not.toBeInTheDocument()
  })

  it('offers a one-tap install link on iOS when a Shortcut link is configured', () => {
    isIOS.mockReturnValue(true)
    getShareShortcutUrl.mockReturnValue('https://www.icloud.com/shortcuts/fake-id')
    renderSettings()
    const link = screen.getByRole('link', { name: /install/i })
    expect(link).toHaveAttribute('href', 'https://www.icloud.com/shortcuts/fake-id')
  })

  it('falls back to the manual setup guide on iOS when no link is configured', () => {
    isIOS.mockReturnValue(true)
    getShareShortcutUrl.mockReturnValue('')
    renderSettings()
    expect(screen.getByText(/share to sable/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /install/i })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /setup guide/i })).toBeInTheDocument()
  })
})
