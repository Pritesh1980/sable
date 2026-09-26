import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AddArtistForm from '../components/AddArtistForm'
import DiscoverMore from '../components/DiscoverMore'
import Login from '../pages/Login'
import { AuthProvider } from '../context/AuthContext'

// Every visible label names its control (SonarQube S6853, #104): a screen
// reader announces the label on focus, and tapping the label focuses the field.
// getByLabelText only resolves through a real label-control association.
describe('form labels are linked to their controls', () => {
  it('add-artist form', () => {
    render(<AddArtistForm onAdd={vi.fn()} />)
    expect(screen.getByLabelText(/instagram handle/i)).toHaveAttribute('placeholder', '@handle')
    expect(screen.getByLabelText(/display name/i)).toHaveAttribute('placeholder', 'Full name (optional)')
  })

  it('sign-in form', () => {
    render(<AuthProvider><Login /></AuthProvider>)
    expect(screen.getByLabelText(/^email$/i)).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('type', 'password')
  })

  it('discovery paste box', () => {
    render(<DiscoverMore artists={[]} onResults={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /find more like this/i }))
    expect(screen.getByLabelText(/paste the reply back/i).tagName).toBe('TEXTAREA')
  })

  it('keeps ids unique when two forms render at once', () => {
    render(<><AddArtistForm onAdd={vi.fn()} /><AddArtistForm onAdd={vi.fn()} /></>)
    const [a, b] = screen.getAllByLabelText(/instagram handle/i)
    expect(a.id).toBeTruthy()
    expect(a.id).not.toBe(b.id)
  })
})
