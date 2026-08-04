import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import DemoIntro from '../components/DemoIntro'
import { DEMO_SESSION, DEMO_INTRO_KEY } from '../data/demoSeed'

// The demo is the funnel's landing pad: someone arriving from the README badge
// lands on a populated Wall with no idea what Sable is for. This strip is the
// only place the proposition reaches them, so the conditions under which it
// shows (and stays hidden) are worth pinning down.

function seedDemoSession() {
  localStorage.setItem('tattoo_local_session', JSON.stringify(DEMO_SESSION))
}

describe('DemoIntro', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('states the proposition on a demo session', () => {
    seedDemoSession()
    render(<DemoIntro />)
    expect(screen.getByText(/every tattoo artist you love/i)).toBeTruthy()
  })

  it('renders nothing for a real signed-in session', () => {
    // A real account gets no marketing copy on its own wall.
    localStorage.setItem(
      'tattoo_local_session',
      JSON.stringify({ user: { id: 'me@pritesh.net', email: 'me@pritesh.net' } })
    )
    const { container } = render(<DemoIntro />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when there is no session at all', () => {
    const { container } = render(<DemoIntro />)
    expect(container.firstChild).toBeNull()
  })

  it('stays dismissed across remounts', () => {
    seedDemoSession()
    const { unmount } = render(<DemoIntro />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/every tattoo artist you love/i)).toBeNull()

    unmount()
    render(<DemoIntro />)
    expect(screen.queryByText(/every tattoo artist you love/i)).toBeNull()
  })

  it('records the dismissal device-locally, never in a synced collection', () => {
    seedDemoSession()
    render(<DemoIntro />)
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    // Same contract as tattoo_guide_dismissed: a plain flag under a tattoo_ key,
    // not an entry in any collection that useStorage would mirror to the backend.
    expect(localStorage.getItem(DEMO_INTRO_KEY)).toBe('1')
  })

  it('survives unreadable storage rather than blanking the wall', () => {
    localStorage.setItem('tattoo_local_session', '{ not json')
    const { container } = render(<DemoIntro />)
    expect(container.firstChild).toBeNull()
  })
})
