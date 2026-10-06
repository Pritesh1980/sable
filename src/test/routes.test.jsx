import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
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
    expect(screen.getByText(/boards group them/i)).toBeInTheDocument()
  })
})

describe('root and pipeline routes', () => {
  beforeEach(() => {
    localStorage.clear()
    seedSession()
  })

  it('renders the Wall at /', async () => {
    renderAt('/')
    await waitFor(() => expect(screen.getByText('Sable')).toBeInTheDocument())
  })

  it('renders the old Dashboard content at /pipeline', async () => {
    renderAt('/pipeline')
    await waitFor(() => expect(screen.getByText(/how sable works/i)).toBeInTheDocument())
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
