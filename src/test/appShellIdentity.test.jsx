import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { backend } from '../backend'

// Collection stores are per signed-in user (#111), so the shell that owns them
// must remount when the identity changes. Unkeyed, a direct A→B sign-in kept
// A's in-memory ideas, reconciled them into B's state and wrote them to B's
// offline cache (ARCHITECTURE §10, before #111).

const A = { id: 'local-artist-a@studio.com', email: 'artist-a@studio.com' }
const A_IDEA = {
  id: 'a-idea',
  title: 'A private idea',
  description: '',
  tags: [],
  placement: '',
  images: [],
  linkedArtists: [],
  status: 'idea',
  updatedAt: '2026-06-01T00:00:00.000Z',
}

function renderApp(route) {
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

describe('app shell and identity', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('tattoo_local_session', JSON.stringify({ user: A }))
  })

  it("remounts on a direct sign-in as someone else, so none of the last user's data carries over", async () => {
    await backend.store.upsert('ideas', [A_IDEA])
    renderApp('/brief')
    await screen.findByRole('heading', { name: 'A private idea' }, { timeout: 5000 })

    await act(() => backend.auth.signIn({ email: 'artist-b@studio.com', password: 'x' }))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'A private idea' })).not.toBeInTheDocument()
    )
    // Let B's first pull and any push settle before checking what B now holds.
    await act(() => new Promise((r) => setTimeout(r, 700)))
    expect(screen.queryByRole('heading', { name: 'A private idea' })).not.toBeInTheDocument()
    expect(localStorage.getItem('tattoo_ideas') ?? '').not.toContain('A private idea')
    expect(JSON.stringify(await backend.store.list('ideas'))).not.toContain('A private idea')
  }, 15000)
})
