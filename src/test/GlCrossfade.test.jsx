import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
    // The component resolves the ref itself, so a base-relative path arrives anchored.
    expect(h.engine.setImage).toHaveBeenCalledWith('/a.jpg')
  })

  it('animates to a new image via transitionTo when src changes', async () => {
    const { rerender } = render(<GlCrossfade src="a.jpg" label="Victor" />)
    await waitFor(() => expect(h.createGlEngine).toHaveBeenCalled())
    rerender(<GlCrossfade src="b.jpg" label="Victor" />)
    await waitFor(() => expect(h.engine.transitionTo).toHaveBeenCalledWith('/b.jpg'))
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
    // Anchored to the deploy base — a bare relative src would otherwise
    // resolve against the current route, not the app root.
    expect(img).toHaveAttribute('src', '/a.jpg')
  })

  it('renders the monogram fallback without touching WebGL when src is empty', () => {
    render(<GlCrossfade src="" label="Zoia" />)
    expect(h.createGlEngine).not.toHaveBeenCalled()
    // ArtistImage monogram uses the first letter of the label.
    expect(screen.getByText('Z')).toBeInTheDocument()
  })
})

// #114: WebGL reads the texture's pixels, and a cross-origin url without CORS is
// refused (every Supabase signed url). The component resolves the ref to a
// same-origin blob: copy before the engine sees it.
describe('GlCrossfade with a cross-origin source (#114)', () => {
  const remote = 'https://signed.example/a.jpg'
  afterEach(() => vi.unstubAllGlobals())

  function stubBytes({ ok = true } = {}) {
    let n = 0
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:copy-${(n += 1)}`),
      revokeObjectURL: vi.fn(),
    }))
    vi.stubGlobal('fetch', vi.fn(async () => {
      if (!ok) throw new Error('offline')
      return { ok: true, blob: async () => new Blob(['x'], { type: 'image/jpeg' }) }
    }))
  }

  it('shows the first image from the copy, with no fade from nothing, once it has loaded', async () => {
    stubBytes()
    render(<GlCrossfade src={remote} label="Victor" />)
    await waitFor(() => expect(h.engine.setImage).toHaveBeenCalledWith('blob:copy-1'))
    expect(h.engine.setImage).not.toHaveBeenCalledWith(remote)
    expect(h.engine.transitionTo).not.toHaveBeenCalled()
  })

  it('applies the deploy base to a base-relative path before the engine sees it', async () => {
    vi.stubEnv('BASE_URL', '/sable/')
    render(<GlCrossfade src="images/victorportugal/1.jpg" label="Victor" />)
    await waitFor(() => expect(h.engine.setImage).toHaveBeenCalledWith('/sable/images/victorportugal/1.jpg'))
    vi.unstubAllEnvs()
  })

  it('crossfades to the next image from its own copy', async () => {
    stubBytes()
    const { rerender } = render(<GlCrossfade src={remote} label="Victor" />)
    await waitFor(() => expect(h.engine.setImage).toHaveBeenCalledWith('blob:copy-1'))
    rerender(<GlCrossfade src="https://signed.example/b.jpg" label="Victor" />)
    await waitFor(() => expect(h.engine.transitionTo).toHaveBeenCalledWith('blob:copy-2'))
  })

  it('falls back to the plain image when the bytes cannot be read', async () => {
    stubBytes({ ok: false })
    render(<GlCrossfade src={remote} label="Victor" />)
    const img = await screen.findByAltText('Victor')
    expect(img).toHaveAttribute('src', remote)
    expect(h.engine.setImage).not.toHaveBeenCalled()
  })
})
