import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Nav from '../components/Nav'
import { ThemeProvider } from '../context/ThemeContext'
import { AuthProvider } from '../context/AuthContext'
import { AuthContext } from '../context/auth-context'
import { backend } from '../backend'

function renderNav(initialEntries = ['/']) {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Nav />
        </MemoryRouter>
      </ThemeProvider>
    </AuthProvider>
  )
}

describe('Nav', () => {
  beforeEach(() => localStorage.clear())

  it('shows the four primary tabs in workflow order', () => {
    renderNav(['/gallery'])
    const links = screen.getAllByRole('link')
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/', '/gallery', '/brief', '/concepts'])
    // Word labels are the accessible names; glyphs are decorative.
    ;['Home', 'Artists', 'Ideas', 'AI'].forEach((label) => {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    })
  })

  it('lists Radar, Studios, Settings and Help in the More menu', () => {
    renderNav(['/gallery'])
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    expect(screen.getByText('Radar')).toBeInTheDocument()
    expect(screen.getByText('Conventions near you')).toBeInTheDocument()
    expect(screen.getByText('Studios')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
    expect(screen.getByText('Help')).toBeInTheDocument()
  })

  it('has no links to retired routes', () => {
    renderNav(['/gallery'])
    fireEvent.click(screen.getByRole('button', { name: /more/i }))
    expect(screen.queryByText('Manage')).not.toBeInTheDocument()
    expect(screen.queryByText('Boards')).not.toBeInTheDocument()
  })

  it('does not render on the Wall route (/)', () => {
    renderNav(['/'])
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /more/i })).not.toBeInTheDocument()
  })

  it('renders on legacy routes such as /gallery', () => {
    renderNav(['/gallery'])
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0)
  })

  it('keeps the text-size/theme controls inside the nav bar, never floating over content', () => {
    renderNav(['/gallery'])
    const fontBtn = screen.getByTitle(/font size/i)
    const themeBtn = screen.getByTitle(/switch to/i)
    // Both live inside the <nav> chrome…
    expect(fontBtn.closest('nav')).not.toBeNull()
    expect(themeBtn.closest('nav')).not.toBeNull()
    // …and no ancestor between them and the nav is position:fixed (the old
    // top-right cluster overlapped page headers and sticky bars).
    let el = fontBtn.parentElement
    while (el && el.tagName !== 'NAV') {
      expect(el.className).not.toMatch(/fixed/)
      el = el.parentElement
    }
  })
})

// #161: the bottom bar's ⏻ sits right against the theme toggle, so a stray tap
// must not sign out. The Settings page's own Sign out button is unchanged.
describe('Nav sign-out (#161)', () => {
  const originalKind = backend.kind
  let signOut
  let confirm
  beforeEach(() => {
    localStorage.clear()
    signOut = vi.fn()
    confirm = vi.spyOn(window, 'confirm')
  })
  afterEach(() => {
    backend.kind = originalKind
    vi.restoreAllMocks()
  })

  function renderSignedIn() {
    return render(
      <AuthContext.Provider value={{ user: { id: 'u', email: 'me@example.test' }, signOut }}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/gallery']}>
            <Nav />
          </MemoryRouter>
        </ThemeProvider>
      </AuthContext.Provider>
    )
  }
  const signOutButton = () => screen.getByRole('button', { name: 'Sign out (me@example.test)' })

  it('asks before signing out, and stays signed in when declined', () => {
    confirm.mockReturnValue(false)
    renderSignedIn()
    fireEvent.click(signOutButton())
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0][0]).toMatch(/^Sign out of Sable\?/)
    expect(signOut).not.toHaveBeenCalled()
  })

  it('signs out once confirmed', () => {
    confirm.mockReturnValue(true)
    renderSignedIn()
    fireEvent.click(signOutButton())
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('says a device-only library stays on this device', () => {
    backend.kind = 'local'
    confirm.mockReturnValue(false)
    renderSignedIn()
    fireEvent.click(signOutButton())
    expect(confirm.mock.calls[0][0]).toMatch(/device-only library stays on this device/i)
  })

  it('says a cloud library syncs back on sign-in', () => {
    backend.kind = 'supabase'
    confirm.mockReturnValue(false)
    renderSignedIn()
    fireEvent.click(signOutButton())
    expect(confirm.mock.calls[0][0]).toMatch(/syncs back when you sign in/i)
  })
})
