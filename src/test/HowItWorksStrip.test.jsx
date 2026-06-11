import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import HowItWorksStrip from '../components/HowItWorksStrip'
import { KEY_TO_COLLECTION } from '../backend/sync'

function renderStrip() {
  return render(
    <MemoryRouter>
      <HowItWorksStrip />
    </MemoryRouter>
  )
}

describe('HowItWorksStrip', () => {
  beforeEach(() => localStorage.clear())

  it('shows the three workflow steps with their destinations', () => {
    renderStrip()
    expect(screen.getByRole('link', { name: /curate your artists/i })).toHaveAttribute('href', '/gallery?mode=manage')
    expect(screen.getByRole('link', { name: /rank & shortlist/i })).toHaveAttribute('href', '/gallery')
    expect(screen.getByRole('link', { name: /match ideas & contact/i })).toHaveAttribute('href', '/brief')
  })

  it('dismisses persistently via a device-local key', () => {
    renderStrip()
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/how tattoo works/i)).not.toBeInTheDocument()
    expect(localStorage.getItem('tattoo_guide_dismissed')).toBe('1')
  })

  it('stays hidden on later mounts once dismissed', () => {
    localStorage.setItem('tattoo_guide_dismissed', '1')
    renderStrip()
    expect(screen.queryByText(/how tattoo works/i)).not.toBeInTheDocument()
  })

  it('uses a key that is never synced to the backend', () => {
    expect(Object.keys(KEY_TO_COLLECTION)).not.toContain('tattoo_guide_dismissed')
  })
})
