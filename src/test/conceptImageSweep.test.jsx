import { useState } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import ConceptPiece from '../components/ConceptPiece'
import Concepts from '../pages/Concepts'
import { buildConceptWallItems } from '../data/concepts'
import { clearBlobUrls } from '../data/blobUrls'
import { backend } from '../backend'

// Concept state holds stored refs (#117), so every surface that shows a concept
// or variant image meets a blob key: one whose bytes load, and one whose bytes
// can't be fetched right now.

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
