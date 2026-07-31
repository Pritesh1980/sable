import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from '../context/AuthContext'
import Login from '../pages/Login'

// The public GitHub Pages build runs the local backend, where no account
// exists — so the bare URL shows a sign-in form nobody can get through. The
// demo dataset is the point of that deploy, and `?demo=1` is the only thing
// that seeds it (session included). Without a visible entry point the front
// door is a dead end.
describe('Login demo entry', () => {
  it('offers a demo link that carries ?demo=1', async () => {
    render(<AuthProvider><Login /></AuthProvider>)

    const link = await screen.findByRole('link', { name: /demo/i })
    expect(link.getAttribute('href')).toContain('demo=1')
  })

  it('builds the link from BASE_URL so it survives a sub-path deploy', async () => {
    render(<AuthProvider><Login /></AuthProvider>)

    const link = await screen.findByRole('link', { name: /demo/i })
    // A full page load is required: maybeSeedDemo runs once at boot in
    // main.jsx, so a client-side route change would not seed anything.
    expect(link.getAttribute('href')).toBe(`${import.meta.env.BASE_URL}?demo=1`)
  })

  it('still renders the sign-in form', async () => {
    render(<AuthProvider><Login /></AuthProvider>)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy()
    })
  })
})
