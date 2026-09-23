import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WallViewer from '../components/WallViewer'
import ConceptViewer from '../components/ConceptViewer'

// #93 — on a touch screen the viewer opens clean (image + a slim top row with
// Close and the counter); a tap on the image toggles a bottom sheet holding
// everything else, and swipes replace the arrow keys. Desktop is unchanged.

vi.mock('../components/GlCrossfade', () => ({ default: () => null }))

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  window.matchMedia = vi.fn((query) => ({
    matches: query === '(hover: none)',
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

function tap(el) {
  fireEvent.pointerDown(el, { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 100 })
  fireEvent.pointerUp(el, { pointerType: 'touch', pointerId: 1, clientX: 101, clientY: 101 })
}

function swipe(el, dx, dy) {
  fireEvent.pointerDown(el, { pointerType: 'touch', pointerId: 1, clientX: 200, clientY: 300 })
  fireEvent.pointerUp(el, { pointerType: 'touch', pointerId: 1, clientX: 200 + dx, clientY: 300 + dy })
}

const wallItems = [
  { artistId: 'a', artistName: 'Mora Lane', handle: 'mora', styles: ['blackwork'], image: '/a1.jpg', imageIndex: 0 },
  { artistId: 'a', artistName: 'Mora Lane', handle: 'mora', styles: ['blackwork'], image: '/a2.jpg', imageIndex: 1 },
  { artistId: 'b', artistName: 'Iris Vale', handle: 'iris', styles: ['fine-line'], image: '/b1.jpg', imageIndex: 0 },
]
const wallArtists = [
  { id: 'a', status: 'shortlisted', notes: 'Great linework.' },
  { id: 'b', status: 'researching', notes: '' },
]

function renderWall(props = {}) {
  return render(
    <WallViewer items={wallItems} initialIndex={0} artists={wallArtists} ideas={[]} onClose={vi.fn()} onGenerate={vi.fn()} {...props} />
  )
}

const surface = () => screen.getByTestId('viewer-surface')
const dialogLabel = () => screen.getByRole('dialog').getAttribute('aria-label')

describe('WallViewer on a touch screen (#93)', () => {
  it('opens clean: Close and the counter, but no sheet, arrows or keys legend', () => {
    renderWall()
    expect(screen.getByRole('button', { name: /close viewer/i })).toBeInTheDocument()
    expect(screen.getByText(/artist 1 of 2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /generate a concept/i })).not.toBeInTheDocument()
    expect(screen.queryByTitle(/next image/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/back to wall/i)).not.toBeInTheDocument()
  })

  it('a tap on the image toggles the sheet', () => {
    renderWall()
    tap(surface())
    expect(screen.getByRole('button', { name: /generate a concept/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mora Lane' })).toBeInTheDocument()

    tap(surface())
    expect(screen.queryByRole('button', { name: /generate a concept/i })).not.toBeInTheDocument()
  })

  it('the sheet offers Info & notes, since there is no I key on a phone', () => {
    renderWall()
    tap(surface())
    fireEvent.click(screen.getByRole('button', { name: /info & notes/i }))
    expect(screen.getByText('Great linework.')).toBeInTheDocument()
  })

  it('swipe left/right moves within the artist, wrapping', () => {
    renderWall()
    swipe(surface(), -100, 0)
    expect(dialogLabel()).toMatch(/Mora Lane — image 2 of 2/)
    swipe(surface(), -100, 0)
    expect(dialogLabel()).toMatch(/Mora Lane — image 1 of 2/)
    swipe(surface(), 100, 0)
    expect(dialogLabel()).toMatch(/Mora Lane — image 2 of 2/)
  })

  it('swipe up goes to the next artist; the sheet has Previous artist to go back', () => {
    renderWall()
    swipe(surface(), 0, -120)
    expect(dialogLabel()).toMatch(/Iris Vale/)
    tap(surface())
    fireEvent.click(screen.getByRole('button', { name: /previous artist/i }))
    expect(dialogLabel()).toMatch(/Mora Lane/)
  })

  // iOS convention (agy review): pulling a full-screen photo down dismisses it.
  it('swipe down closes the viewer', () => {
    const onClose = vi.fn()
    renderWall({ onClose })
    swipe(surface(), 0, 120)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Screen readers activate with a synthesized click, never a raw pointer
  // tap, so the sheet needs a real button too (codex review). It also tells a
  // first-time user the controls exist (agy review).
  it('a visible Show controls button toggles the sheet, with aria-expanded', () => {
    renderWall()
    const show = screen.getByRole('button', { name: /show controls/i })
    expect(show).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(show)
    expect(screen.getByRole('button', { name: /generate a concept/i })).toBeInTheDocument()
    const hide = screen.getByRole('button', { name: /hide controls/i })
    expect(hide).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(hide)
    expect(screen.queryByRole('button', { name: /generate a concept/i })).not.toBeInTheDocument()
  })
})

const concepts = [
  { id: 'c1', title: 'Raven', imageUrl: '/c1.png', tags: [], concept: { id: 'c1', prompt: 'a raven', tags: [] } },
  { id: 'c2', title: 'Moth', imageUrl: '/c2.png', tags: [], concept: { id: 'c2', prompt: 'a moth', tags: [] } },
]

describe('ConceptViewer on a touch screen (#93)', () => {
  it('opens clean and a tap reveals the sheet with Delete and Variants', () => {
    render(<ConceptViewer items={concepts} onClose={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /close viewer/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/back to wall/i)).not.toBeInTheDocument()

    tap(surface())
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /variants & stl/i })).toBeInTheDocument()
  })

  it('swipe down closes, and Show controls works here too', () => {
    const onClose = vi.fn()
    render(<ConceptViewer items={concepts} onClose={onClose} onDelete={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /show controls/i }))
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
    swipe(surface(), 0, 120)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('swipe left/right moves between concepts', () => {
    render(<ConceptViewer items={concepts} onClose={vi.fn()} />)
    swipe(surface(), -100, 0)
    expect(screen.getByAltText('Moth')).toBeInTheDocument()
    swipe(surface(), 100, 0)
    expect(screen.getByAltText('Raven')).toBeInTheDocument()
  })
})
