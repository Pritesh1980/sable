import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ConceptPiece from '../components/ConceptPiece'
import Concepts from '../pages/Concepts'
import ConceptVariantLab from '../components/ConceptVariantLab'
import ConceptViewer from '../components/ConceptViewer'
import ConceptVisualMatches from '../components/ConceptVisualMatches'
import SkinPreviewDrawer from '../components/SkinPreviewDrawer'
import { loadVectors, vectorFor } from '../data/styleIndex'
import { buildConceptWallItems } from '../data/concepts'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

// Concept state holds stored refs (#117), so every surface that shows a concept
// or variant image meets a blob key: one whose bytes load, and one whose bytes
// can't be fetched right now.

vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map([['path:/a.jpg', [1, 0]]])),
  vectorFor: vi.fn(async () => [1, 0]),
}))
vi.mock('../components/LiveTryOn', () => ({ default: () => null }))

const HERE = 'user/u1/concepts/c1/here.jpg'
const ALSO = 'user/u1/concepts/c3/also.jpg'
const GONE = 'user/u1/concepts/c2/gone.jpg'
const PHOTO = 'data:image/jpeg;base64,QUJD'

beforeEach(async () => {
  localStorage.clear()
  clearBlobUrls()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  await backend.blobs.upload('u1', HERE, PHOTO, 'image/jpeg')
  await backend.blobs.upload('u1', ALSO, PHOTO, 'image/jpeg')
  const realGetUrl = backend.blobs.getUrl.bind(backend.blobs)
  vi.spyOn(backend.blobs, 'getUrl').mockImplementation((key) => (
    key === GONE ? Promise.reject(new Error('offline')) : realGetUrl(key)
  ))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

const item = (imageUrl) => buildConceptWallItems([{ id: 'c', prompt: 'Moth', imageUrl }], [])[0]

describe('concept images resolve at the leaf', () => {
  it('ConceptPiece shows a stored key once it resolves, never the key as a src', async () => {
    const onOpen = vi.fn()
    render(<ConceptPiece item={item(HERE)} onOpen={onOpen} />)
    const img = await screen.findByRole('img', { name: 'Moth' })
    expect(img.getAttribute('src')).toBe(PHOTO)
    fireEvent.click(img)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('ConceptPiece shows the offline placeholder for a key it cannot fetch, and does not open', async () => {
    const onOpen = vi.fn()
    const { container } = render(<ConceptPiece item={item(GONE)} onOpen={onOpen} />)
    expect(await screen.findByRole('img', { name: 'Photo available when online' })).toBeInTheDocument()
    fireEvent.click(container.querySelector('figure'))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('ConceptPiece applies the deploy base to a static path exactly once', async () => {
    vi.stubEnv('BASE_URL', '/sable/')
    render(<ConceptPiece item={item('images/demo/moth.jpg')} onOpen={vi.fn()} />)
    const img = await screen.findByRole('img', { name: 'Moth' })
    expect(img.getAttribute('src')).toBe('/sable/images/demo/moth.jpg')
  })
})

describe('the concept viewer only holds pieces it can show', () => {
  function Harness({ initial }) {
    const [concepts, setConcepts] = useState(initial)
    return (
      <MemoryRouter initialEntries={['/concepts']}>
        <Concepts concepts={concepts} setConcepts={setConcepts} artists={[]} ideas={[]} />
      </MemoryRouter>
    )
  }

  it('skips a piece whose image is unavailable, which stays on the wall', async () => {
    render(<Harness initial={[
      { id: 'c1', prompt: 'Moth', imageUrl: HERE, tags: [] },
      { id: 'c2', prompt: 'Raven', imageUrl: GONE, tags: [] },
      { id: 'c3', prompt: 'Wolf', imageUrl: ALSO, tags: [] },
    ]} />)
    expect(await screen.findByRole('img', { name: 'Photo available when online' })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('img', { name: 'Wolf' }))

    const viewer = await screen.findByRole('dialog', { name: 'Concept: Wolf' })
    // Second of the two it can show — not third of three.
    await waitFor(() => expect(viewer.textContent).toMatch(/02\s*\/\s*2/))
  })
})

describe('variants, the viewer and its tools resolve a stored key', () => {
  const noop = () => {}
  const variant = (imageUrl) => ({ id: 'v1', provider: 'pasted', imageUrl, createdAt: '2026-10-01T00:00:00.000Z' })
  const lab = (imageUrl) => (
    <ConceptVariantLab
      concept={{ id: 'c1', prompt: 'Moth', imageUrl: HERE, variants: [variant(imageUrl)] }}
      onAddVariant={noop} onMarkBest={noop} onDeleteVariant={noop} onRateVariant={noop}
    />
  )

  it('a variant shows its image once the key resolves', async () => {
    const { container } = render(lab(HERE))
    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).toBeInTheDocument())
    expect(container.querySelector('img[src*="user/u1"]')).not.toBeInTheDocument()
  })

  it('a variant with a key it cannot fetch says so, rather than "No image"', async () => {
    render(lab(GONE))
    await waitFor(() => (
      expect(screen.getAllByRole('img', { name: 'Photo available when online' }).length).toBeGreaterThan(0)
    ))
    expect(screen.queryByText(/no image/i)).not.toBeInTheDocument()
  })

  it('a variant that never had an image still says "No image"', () => {
    render(lab(''))
    expect(screen.getByText('No image')).toBeInTheDocument()
  })

  it('the viewer shows the resolved image, never the key', async () => {
    const items = buildConceptWallItems([{ id: 'c1', prompt: 'Moth', imageUrl: HERE, tags: [] }], [])
    render(<MemoryRouter><ConceptViewer items={items} onClose={noop} /></MemoryRouter>)
    const img = await screen.findByRole('img', { name: 'Moth' })
    await waitFor(() => expect(img.getAttribute('src')).toBe(PHOTO))
  })

  it('the on-skin drawer shows the design from its key', async () => {
    const { container } = render(
      <SkinPreviewDrawer source={{ conceptId: 'c1', conceptLabel: 'Moth', imageUrl: HERE }} apiKey="k" onSave={noop} onClose={noop} />,
    )
    await waitFor(() => expect(container.querySelector(`img[src="${PHOTO}"]`)).toBeInTheDocument())
    expect(container.querySelector('img[src*="user/u1"]')).not.toBeInTheDocument()
  })

  it('visual matching embeds the resolved image, not the key', async () => {
    render(<ConceptVisualMatches artists={[{ id: 'a', handle: 'a', images: ['/a.jpg'], tags: [] }]} concept={{ id: 'c1', imageUrl: HERE }} />)
    await waitFor(() => expect(vectorFor).toHaveBeenCalled())
    expect(vectorFor).toHaveBeenCalledWith(PHOTO, 'concept:c1')
    expect(loadVectors).toHaveBeenCalled()
  })

  it('visual matching reports failure for a key it cannot fetch, without embedding', async () => {
    vectorFor.mockClear()
    render(<ConceptVisualMatches artists={[{ id: 'a', handle: 'a', images: ['/a.jpg'], tags: [] }]} concept={{ id: 'c2', imageUrl: GONE }} />)
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(vectorFor).not.toHaveBeenCalled()
  })
})
