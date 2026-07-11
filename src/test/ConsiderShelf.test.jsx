import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ConsiderShelf from '../components/ConsiderShelf'

// The shelf always mounts collapsed now; isolate any stray state between tests.
beforeEach(() => localStorage.clear())

const artists = [
  { id: 'a1', handle: 'a1', tags: ['blackwork', 'dark-illustrative'] },
]
const pool = [
  { handle: 'kamilczapiga', name: 'Kamil Czapiga', tags: ['blackwork', 'dark-illustrative'], note: 'Stark black symbolism' },
  { handle: 'oscar.hove', name: 'Oscar Hove', tags: ['surrealism', 'fine-line'], note: 'Abstract surreal linework' },
]

// Cards live behind the collapsed header — open the shelf to reach them.
function expand() {
  fireEvent.click(screen.getByRole('button', { name: /consider/i }))
}

describe('ConsiderShelf', () => {
  it('shows only style-matched suggestions with name, note and an Instagram verify link', () => {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} />)
    expand()
    expect(screen.getByText('Kamil Czapiga')).toBeInTheDocument()
    expect(screen.queryByText('Oscar Hove')).toBeNull() // zero style overlap
    const link = screen.getByRole('link', { name: /@kamilczapiga/i })
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/kamilczapiga/')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('fires onAdd with the suggestion', () => {
    const onAdd = vi.fn()
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={onAdd} />)
    expand()
    fireEvent.click(screen.getByRole('button', { name: /^\+ add$/i }))
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ handle: 'kamilczapiga' }))
  })

  it('fires onDismiss with the handle', () => {
    const onDismiss = vi.fn()
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={onDismiss} onAdd={vi.fn()} />)
    expand()
    fireEvent.click(screen.getByRole('button', { name: /not for me/i }))
    expect(onDismiss).toHaveBeenCalledWith('kamilczapiga')
  })

  it('respects the dismissed list', () => {
    // The only style match is dismissed, so nothing is suggested and the shelf
    // renders nothing at all — no header to open.
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={['kamilczapiga']} onDismiss={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.queryByText('Kamil Czapiga')).toBeNull()
    expect(screen.queryByRole('button', { name: /consider/i })).toBeNull()
  })

  it('renders nothing at all when there are no matches', () => {
    const { container } = render(
      <ConsiderShelf artists={[]} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('ConsiderShelf — always minimised by default', () => {
  it('mounts collapsed, showing just the slim header line', () => {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.queryByText('Kamil Czapiga')).toBeNull()
    expect(screen.getByText(/1 suggested artist/)).toBeInTheDocument()
  })

  it('expands and collapses on toggle within the session', () => {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} />)
    expand()
    expect(screen.getByText('Kamil Czapiga')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /consider/i }))
    expect(screen.queryByText('Kamil Czapiga')).toBeNull()
  })

  it('does not remember an expand — a remount starts collapsed again', () => {
    const props = { artists, pool, dismissed: [], onDismiss: vi.fn(), onAdd: vi.fn() }
    const { unmount } = render(<ConsiderShelf {...props} />)
    expand()
    expect(screen.getByText('Kamil Czapiga')).toBeInTheDocument()
    unmount()
    render(<ConsiderShelf {...props} />)
    expect(screen.queryByText('Kamil Czapiga')).toBeNull() // no memory of the previous expand
  })

  it('writes no collapse preference to localStorage', () => {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} />)
    expand()
    expect(localStorage.getItem('tattoo_consider_collapsed')).toBeNull()
  })
})

describe('ConsiderShelf — Refresh', () => {
  // Refresh lives in the header of the expanded shelf.
  function renderExpanded(extra) {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} {...extra} />)
    expand()
  }

  it('shows no refresh control when onRefresh is not provided', () => {
    renderExpanded()
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull()
  })

  it('keeps the refresh control out of the collapsed header', () => {
    render(<ConsiderShelf artists={artists} pool={pool} dismissed={[]} onDismiss={vi.fn()} onAdd={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /refresh/i })).toBeNull() // collapsed by default
  })

  it('renders a refresh control when onRefresh is provided and the shelf is open', () => {
    renderExpanded({ onRefresh: vi.fn() })
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })

  it('fires onRefresh when the refresh control is clicked', () => {
    const onRefresh = vi.fn()
    renderExpanded({ onRefresh })
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('disables the refresh control and signals progress while refreshing', () => {
    const onRefresh = vi.fn()
    renderExpanded({ onRefresh, refreshing: true })
    const btn = screen.getByRole('button', { name: /refreshing/i })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onRefresh).not.toHaveBeenCalled()
  })

  it('surfaces a refresh error message', () => {
    renderExpanded({ onRefresh: vi.fn(), refreshError: 'Gemini error 429' })
    expect(screen.getByText('Gemini error 429')).toBeInTheDocument()
  })
})
