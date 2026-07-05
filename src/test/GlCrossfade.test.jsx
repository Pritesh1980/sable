import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import GlCrossfade from '../components/GlCrossfade'

// Mock the engine factory so we can assert the component drives it correctly on
// mount, src change and unmount — without touching real WebGL.
const h = vi.hoisted(() => ({
  engine: null,
  createGlEngine: vi.fn(),
}))

vi.mock('../lib/glCrossfade', () => ({ createGlEngine: h.createGlEngine }))
// Dynamic import('three') must resolve to *something*; the mocked engine never
// actually reads it.
vi.mock('three', () => ({ __esModule: true, default: {}, Scene: class {} }))

beforeEach(() => {
  h.engine = { setImage: vi.fn(), transitionTo: vi.fn(), resize: vi.fn(), dispose: vi.fn() }
  h.createGlEngine.mockReset()
  h.createGlEngine.mockReturnValue(h.engine)
})

describe('GlCrossfade', () => {
  it('creates the engine and shows the first image via setImage', async () => {
    render(<GlCrossfade src="a.jpg" label="Victor" className="w-full h-full" />)
    await waitFor(() => expect(h.createGlEngine).toHaveBeenCalledTimes(1))
    expect(h.engine.setImage).toHaveBeenCalledWith('a.jpg')
  })

  it('animates to a new image via transitionTo when src changes', async () => {
    const { rerender } = render(<GlCrossfade src="a.jpg" label="Victor" />)
    await waitFor(() => expect(h.createGlEngine).toHaveBeenCalled())
    rerender(<GlCrossfade src="b.jpg" label="Victor" />)
    await waitFor(() => expect(h.engine.transitionTo).toHaveBeenCalledWith('b.jpg'))
  })

  it('disposes the engine on unmount (no leaked WebGL context)', async () => {
    const { unmount } = render(<GlCrossfade src="a.jpg" label="Victor" />)
    await waitFor(() => expect(h.createGlEngine).toHaveBeenCalled())
    unmount()
    expect(h.engine.dispose).toHaveBeenCalledTimes(1)
  })

  it('falls back to the image/monogram when the engine cannot be created', async () => {
    h.createGlEngine.mockReturnValue(null)
    render(<GlCrossfade src="a.jpg" label="Victor" fallbackImageClassName="object-contain" />)
    // The fallback renders a real <img> with the label as alt text.
    const img = await screen.findByAltText('Victor')
    expect(img).toBeInTheDocument()
    expect(img).toHaveAttribute('src', 'a.jpg')
  })

  it('renders the monogram fallback without touching WebGL when src is empty', () => {
    render(<GlCrossfade src="" label="Zoia" />)
    expect(h.createGlEngine).not.toHaveBeenCalled()
    // ArtistImage monogram uses the first letter of the label.
    expect(screen.getByText('Z')).toBeInTheDocument()
  })
})
