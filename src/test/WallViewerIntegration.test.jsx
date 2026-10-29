import { StrictMode, useEffect } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'
import Wall from '../pages/Wall'

// t6b — the wave that makes "open app → click any image → full screen, 1
// click" real. These specs exercise Wall + WallViewer wired together, the way
// App.jsx actually renders them (Wall owns the viewer's open/closed state).

const artists = [
  {
    id: 'zoia.ink',
    handle: 'zoia.ink',
    name: '',
    tags: ['dark-illustrative', 'surrealism'],
    images: ['/images/artists/zoia.ink/1.jpg', '/images/artists/zoia.ink/2.jpg'],
  },
  {
    id: 'carlosvalera',
    handle: 'carl245tattoo',
    name: 'Carlos Valera',
    tags: ['realism'],
    images: [{ key: 'blob-key', url: '/images/artists/carlosvalera/1.jpg' }],
  },
]

// Exposes the router to the test: where we are, and the browser's Back.
const probe = {}
function Probe() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => { Object.assign(probe, { location, navigate }) })
  return null
}
const here = () => `${probe.location.pathname}${probe.location.search}`
const back = () => act(() => { probe.navigate(-1) })

function renderApp(props = {}, { entries = ['/'], strict = false } = {}) {
  const Wrap = strict ? StrictMode : 'div'
  return render(
    <Wrap>
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Probe />
      <Routes>
        <Route
          path="/"
          element={(
            <Wall
              artists={artists}
              ideas={[]}
              onAddArtist={vi.fn()}
              onOpenDrawer={vi.fn()}
              onSwitchView={vi.fn()}
              activeView="artists"
              {...props}
            />
          )}
        />
        <Route path="/concepts" element={<div>Concepts page mock</div>} />
        <Route path="/brief" element={<div>Brief page mock</div>} />
      </Routes>
    </MemoryRouter>
    </Wrap>
  )
}

function clickPiece(artistName) {
  // Scope to the masonry <main> so the RankRail dock (which also renders artist
  // names) can't shadow the wall piece we mean to click.
  fireEvent.click(within(screen.getByRole('main')).getAllByRole('button', { name: `Open ${artistName}` })[0])
}

describe('Wall → WallViewer integration', () => {
  it('opens the viewer full screen at the clicked item on a single click', () => {
    renderApp()
    clickPiece('zoia.ink')

    // The viewer overlay is up, showing the clicked artist's plate.
    expect(screen.getByRole('heading', { name: 'zoia.ink' })).toBeInTheDocument()
    expect(screen.getByText(/artist 1 of 2/)).toBeInTheDocument()
  })

  it('opens at the right index for a deep (non-first) artist', () => {
    renderApp()
    clickPiece('Carlos Valera')

    expect(screen.getByRole('heading', { name: 'Carlos Valera' })).toBeInTheDocument()
    expect(screen.getByText(/artist 2 of 2/)).toBeInTheDocument()
  })

  it('hides the wall bar while the viewer is open', () => {
    renderApp()
    expect(screen.getByText('Sable')).toBeInTheDocument()
    clickPiece('zoia.ink')
    expect(screen.queryByText('Sable')).not.toBeInTheDocument()
  })

  it('Escape closes the viewer and restores the wall bar', () => {
    renderApp()
    clickPiece('zoia.ink')
    expect(screen.getByRole('heading', { name: 'zoia.ink' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('heading', { name: 'zoia.ink' })).not.toBeInTheDocument()
    expect(screen.getByText('Sable')).toBeInTheDocument()
  })

  it('the close button returns to the wall without a keyboard (#89)', () => {
    renderApp()
    clickPiece('zoia.ink')

    fireEvent.click(screen.getByRole('button', { name: /close viewer/i }))

    expect(screen.queryByRole('heading', { name: 'zoia.ink' })).not.toBeInTheDocument()
    expect(screen.getByText('Sable')).toBeInTheDocument()
  })

  it('locks body scroll while open and releases it on close', () => {
    renderApp()
    expect(document.body.style.overflow).not.toBe('hidden')

    clickPiece('zoia.ink')
    expect(document.body.style.overflow).toBe('hidden')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('G navigates to /concepts with a steer param for the current artist, closing the viewer first', () => {
    renderApp()
    clickPiece('Carlos Valera')

    fireEvent.keyDown(window, { key: 'g' })

    expect(screen.getByText('Concepts page mock')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Carlos Valera' })).not.toBeInTheDocument()
  })

  it('clicking the generate button also navigates to /concepts with steer', () => {
    renderApp()
    clickPiece('zoia.ink')

    fireEvent.click(screen.getByText(/generate a concept/i))

    expect(screen.getByText('Concepts page mock')).toBeInTheDocument()
  })

  it('↓ crosses from one artist to the next using the full flat items list', () => {
    renderApp()
    clickPiece('zoia.ink')
    expect(screen.getByRole('heading', { name: 'zoia.ink' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowDown' })

    expect(screen.getByRole('heading', { name: 'Carlos Valera' })).toBeInTheDocument()
  })

  it('still invokes an onOpenArtist callback if one is passed, alongside opening the viewer', () => {
    const onOpenArtist = vi.fn()
    renderApp({ onOpenArtist })
    clickPiece('zoia.ink')

    expect(onOpenArtist).toHaveBeenCalledTimes(1)
    expect(onOpenArtist.mock.calls[0][0]).toMatchObject({ artistId: 'zoia.ink' })
    expect(screen.getByRole('heading', { name: 'zoia.ink' })).toBeInTheDocument()
  })

  // #159: the open photo lives in the URL, so the browser's Back closes the
  // viewer instead of leaving the Wall.
  describe('Back button and the URL', () => {
    const viewerHeading = (name) => screen.queryByRole('heading', { name })

    it('opening a photo pushes ?photo=<artist>.<n>, and Back closes the viewer onto the Wall', () => {
      renderApp({}, { entries: ['/brief', '/'] })
      clickPiece('Carlos Valera')
      expect(here()).toBe('/?photo=carlosvalera.1')

      back()

      expect(here()).toBe('/')
      expect(viewerHeading('Carlos Valera')).not.toBeInTheDocument()
      expect(screen.getByText('Sable')).toBeInTheDocument()
    })

    it('under StrictMode, one open is one entry and swipes add none', () => {
      renderApp({}, { entries: ['/brief', '/'], strict: true })
      clickPiece('zoia.ink')
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      expect(here()).toBe('/?photo=zoia.ink.2')
      back()
      expect(here()).toBe('/')
      back()
      expect(screen.getByText('Brief page mock')).toBeInTheDocument()
    })

    it('closing from the UI leaves no entry behind: the next Back leaves the Wall', () => {
      renderApp({}, { entries: ['/brief', '/'] })
      clickPiece('zoia.ink')
      fireEvent.click(screen.getByRole('button', { name: /close viewer/i }))
      expect(here()).toBe('/')
      expect(viewerHeading('zoia.ink')).not.toBeInTheDocument()

      back()
      expect(screen.getByText('Brief page mock')).toBeInTheDocument()
    })

    it('Escape closes the same way, once, even if pressed twice before Back lands', () => {
      renderApp({}, { entries: ['/brief', '/'] })
      clickPiece('zoia.ink')
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(here()).toBe('/')
      expect(screen.getByText('Sable')).toBeInTheDocument()
    })

    it('moving between photos replaces the entry instead of stacking one per photo', () => {
      renderApp({}, { entries: ['/brief', '/'] })
      clickPiece('zoia.ink')
      fireEvent.keyDown(window, { key: 'ArrowRight' })
      expect(here()).toBe('/?photo=zoia.ink.2')
      fireEvent.keyDown(window, { key: 'ArrowDown' })
      expect(here()).toBe('/?photo=carlosvalera.1')

      back()
      expect(here()).toBe('/')
      expect(viewerHeading('Carlos Valera')).not.toBeInTheDocument()
    })

    it('keeps the other query params (?demo=1) through open and close', () => {
      renderApp({}, { entries: ['/?demo=1'] })
      clickPiece('zoia.ink')
      expect(here()).toBe('/?demo=1&photo=zoia.ink.1')
      fireEvent.click(screen.getByRole('button', { name: /close viewer/i }))
      expect(here()).toBe('/?demo=1')
    })

    it('a deep link opens that photo, and closing it stays on the Wall', () => {
      renderApp({}, { entries: ['/brief', '/?photo=zoia.ink.2'] })
      expect(viewerHeading('zoia.ink')).toBeInTheDocument()
      expect(screen.getByText(/artist 1 of 2/)).toHaveTextContent('02')

      fireEvent.click(screen.getByRole('button', { name: /close viewer/i }))
      expect(here()).toBe('/')
      expect(screen.getByText('Sable')).toBeInTheDocument()
      // Replaced in place: nothing between the Wall and the page before it.
      back()
      expect(screen.getByText('Brief page mock')).toBeInTheDocument()
    })

    it('a deep link to a photo that no longer exists just shows the Wall', () => {
      renderApp({}, { entries: ['/?photo=gone.artist.1'] })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Sable')).toBeInTheDocument()
    })

    it('Generate replaces the viewer entry, so Back from Concepts returns to the Wall', () => {
      renderApp({}, { entries: ['/brief', '/'] })
      clickPiece('Carlos Valera')
      fireEvent.keyDown(window, { key: 'g' })
      expect(here()).toBe('/concepts?steer=carlosvalera')

      back()
      expect(here()).toBe('/')
      expect(viewerHeading('Carlos Valera')).not.toBeInTheDocument()
    })
  })
})
