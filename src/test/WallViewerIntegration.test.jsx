import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
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

function renderApp(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
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
      </Routes>
    </MemoryRouter>
  )
}

function clickPiece(artistName) {
  // Scope to the masonry <main> so the RankRail dock (which also renders artist
  // names) can't shadow the wall-piece <figure> we mean to click.
  fireEvent.click(within(screen.getByRole('main')).getAllByText(artistName)[0].closest('figure'))
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
})
