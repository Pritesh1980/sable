import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Nav from '../components/Nav'
import { ThemeProvider } from '../context/ThemeContext'
import { AuthProvider } from '../context/AuthContext'

function renderNav() {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <MemoryRouter>
          <Nav />
        </MemoryRouter>
      </ThemeProvider>
    </AuthProvider>
  )
}

describe('Nav', () => {
  beforeEach(() => localStorage.clear())

  it('shows the four primary tabs in workflow order', () => {
    renderNav()
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/gallery', '/brief', '/concepts'])
    // Word labels are the accessible names; glyphs are decorative.
    ;['Home', 'Artists', 'Ideas', 'AI'].forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    })
  })

  it('lists Radar, Studios, Settings and Help in the More menu', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    expect(screen.getByText('Radar')).toBeInTheDocument()
    expect(screen.getByText('Conventions near you')).toBeInTheDocument()
    expect(screen.getByText('Studios')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Help')).toBeInTheDocument()
  })

  it('has no links to retired routes', () => {
    renderNav()
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    expect(screen.queryByText('Manage')).not.toBeInTheDocument()
    expect(screen.queryByText('Boards')).not.toBeInTheDocument()
  })
})
