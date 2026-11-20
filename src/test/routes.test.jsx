import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { DEFAULT_ARTISTS } from '../data/artists'
import { takeSharedImage } from '../sw/shareTarget'

vi.mock('../sw/shareTarget', () => ({ takeSharedImage: vi.fn(async () => null) }))

function seedSession(email = 'owner@example.com') {
  localStorage.setItem(
    'tattoo_local_session',
    JSON.stringify({ user: { id: `local-${email}`, email } })
  )
}

function renderAt(route) {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </ThemeProvider>
    </AuthProvider>
  )
}

describe('legacy route redirects', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSession()
  })

  it('redirects /manage to the Artists page in manage mode', async () => {
    renderAt('/manage')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument(), { timeout: 5000 })
    expect(screen.getByText('Add New Artist')).toBeInTheDocument()
  })

  it('redirects /boards to the Ideas page on the Boards tab', async () => {
    renderAt('/boards')
    await waitFor(() => expect(screen.getByRole('heading', { name: /ideas/i })).toBeInTheDocument())
    // The Boards tab is rendered and active (it shows the boards empty state).
    expect(screen.getByRole('button', { name: /boards \(\d+\)/i })).toBeInTheDocument()
    expect(screen.getByText(/a board groups ideas/i)).toBeInTheDocument()
  })
})

describe('unknown routes (#161)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('sends an unknown path home instead of a blank page', async () => {
    seedSession()
    renderAt('/does-not-exist')
    await waitFor(() => expect(screen.getByText('Sable')).toBeInTheDocument())
  })

  it('still shows the sign-in gate first when signed out', async () => {
    renderAt('/does-not-exist')
    await waitFor(() => expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /everything else/i })).not.toBeInTheDocument()
  })
})

describe('root and pipeline routes', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSession()
  })

  it('renders the start page at /, not the wall', async () => {
    renderAt('/')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Sable' })).toBeInTheDocument())
    expect(screen.queryByRole('region', { name: /your top five/i })).not.toBeInTheDocument()
  })

  // #220: the wall moved to Artists; old photo links keep working.
  it('redirects /?photo=<artist>.<n> to the Artists wall with the viewer open', async () => {
    const [first] = [...DEFAULT_ARTISTS].sort((a, b) => a.rank - b.rank)
    renderAt(`/?photo=${first.id}.1`)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument(), { timeout: 5000 })
    expect(await screen.findByRole('heading', { name: first.name || first.handle })).toBeInTheDocument()
  })

  it('renders Plan at /plan', async () => {
    renderAt('/plan')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument())
  })

  // #220 D: Pipeline became Plan; old links and bookmarks keep working.
  it('redirects /pipeline to /plan', async () => {
    renderAt('/pipeline')
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Plan' })).toBeInTheDocument())
    expect(screen.queryByText(/how sable works/i)).toBeNull()
  })

  it('uses the canonical form and shared photo at the Gallery landing', async () => {
    takeSharedImage.mockResolvedValueOnce(new File(['fictional'], 'shared.png', { type: 'image/png' }))
    renderAt('/gallery?shared=1&mode=manage')
    expect(await screen.findByRole('dialog', { name: 'Add an artist' })).toBeInTheDocument()
    expect(await screen.findByAltText('Staged reference 1')).toBeInTheDocument()
    expect(screen.getByText('Details').closest('details')).not.toHaveAttribute('open')
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Add an artist' })).not.toBeInTheDocument()
    expect(screen.getByText('Add New Artist')).toBeInTheDocument()
    vi.restoreAllMocks()
  })
  it('holds Save until the destructive share-stash read finishes', async () => {
    let resolve
    takeSharedImage.mockImplementationOnce(() => new Promise((r) => { resolve = r }))
    renderAt('/gallery?shared=1')
    await screen.findByRole('dialog', { name: 'Add an artist' })
    fireEvent.change(screen.getByLabelText('Instagram *'), { target: { value: 'fixture.share' } })
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
    await act(async () => resolve(new File(['fictional'], 'shared.png', { type: 'image/png' })))
    expect(screen.getByAltText('Staged reference 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  })
})
