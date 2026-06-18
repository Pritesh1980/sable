import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'

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
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Artists' })).toBeInTheDocument())
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
