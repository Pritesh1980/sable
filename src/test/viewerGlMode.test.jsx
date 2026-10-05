import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import WallViewer from '../components/WallViewer'
import ConceptViewer from '../components/ConceptViewer'
import { resolveTransitionMode } from '../lib/gl'
import { registerBlobUrl, clearBlobUrls } from '../data/blobUrls'

// Stub the real GL stage with a sentinel so we can detect which branch each
// viewer renders. The mode gate itself (resolveTransitionMode) is unit-tested
// in gl.spec.js; here we only assert the wiring picks the right stage.
vi.mock('../components/GlCrossfade', () => ({
  default: ({ src }) => <div data-testid="gl-crossfade" data-src={src} />,
}))

vi.mock('../lib/gl', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, resolveTransitionMode: vi.fn(() => 'css') }
})

const wallItems = [
  {
    artistId: 'victorportugal',
    artistName: 'Victor Portugal',
    handle: 'victorportugal',
    styles: ['blackwork'],
    image: '/images/victorportugal/1.jpg',
    imageIndex: 0,
  },
]

const conceptItems = [
  { id: 'c1', title: 'Raven', imageUrl: '/concepts/1.png', tags: ['blackwork'] },
]

beforeEach(() => {
  resolveTransitionMode.mockReset()
})

describe('WallViewer transition-mode wiring', () => {
  it('renders the GlCrossfade stage when mode is webgl', () => {
    resolveTransitionMode.mockReturnValue('webgl')
    render(<WallViewer items={wallItems} onClose={vi.fn()} onGenerate={vi.fn()} />)
    const stage = screen.getByTestId('gl-crossfade')
    expect(stage).toBeInTheDocument()
    expect(stage).toHaveAttribute('data-src', '/images/victorportugal/1.jpg')
  })

  it('keeps the plain <img> stage when mode is css', () => {
    resolveTransitionMode.mockReturnValue('css')
    render(<WallViewer items={wallItems} onClose={vi.fn()} onGenerate={vi.fn()} />)
    expect(screen.queryByTestId('gl-crossfade')).not.toBeInTheDocument()
    // css path renders the ArtistImage <img> with the artist label as alt text.
    expect(screen.getByAltText(/Victor Portugal — blackwork/)).toBeInTheDocument()
  })
})

// Wall items carry the stored ref (#113), so the viewer must resolve the
// current image itself before handing a URL to the imperative GL stage.
describe('WallViewer resolves the ref for the GL stage (#113)', () => {
  const item = (image) => [{ ...wallItems[0], image }]
  const glSrc = () => screen.getByTestId('gl-crossfade').getAttribute('data-src')

  beforeEach(() => {
    clearBlobUrls()
    resolveTransitionMode.mockReturnValue('webgl')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('applies the deploy base to a base-relative static path', () => {
    vi.stubEnv('BASE_URL', '/sable/')
    render(<WallViewer items={item('images/victorportugal/1.jpg')} onClose={vi.fn()} onGenerate={vi.fn()} />)
    expect(glSrc()).toBe('/sable/images/victorportugal/1.jpg')
  })

  it('resolves a cached { key } ref to its display url', () => {
    registerBlobUrl('user/u1/a.jpg', 'https://signed.example/a')
    render(<WallViewer items={item({ key: 'user/u1/a.jpg' })} onClose={vi.fn()} onGenerate={vi.fn()} />)
    expect(glSrc()).toBe('https://signed.example/a')
  })
})

describe('ConceptViewer transition-mode wiring', () => {
  it('renders the GlCrossfade stage when mode is webgl', () => {
    resolveTransitionMode.mockReturnValue('webgl')
    render(<ConceptViewer items={conceptItems} onClose={vi.fn()} />)
    const stage = screen.getByTestId('gl-crossfade')
    expect(stage).toBeInTheDocument()
    expect(stage).toHaveAttribute('data-src', '/concepts/1.png')
  })

  it('keeps the plain <img> stage when mode is css', () => {
    resolveTransitionMode.mockReturnValue('css')
    render(<ConceptViewer items={conceptItems} onClose={vi.fn()} />)
    expect(screen.queryByTestId('gl-crossfade')).not.toBeInTheDocument()
    expect(screen.getByAltText('Raven')).toBeInTheDocument()
  })
})
