import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import Gallery from '../pages/Gallery'

// #46: today you must click "+ Add" before you can paste a screenshot in.
// Pasting anywhere on the Artists page (with an image on the clipboard)
// should open the same quick-add intake already used by the share-target
// flow, rather than silently doing nothing.
vi.mock('../hooks/useImageUpload', () => ({
  compressImages: vi.fn(async () => ['data:image/jpeg;base64,SHOT']),
}))
vi.mock('../data/screenshotIntake', () => ({
  analyzeScreenshotWithGemini: vi.fn(async () => null),
}))
vi.mock('../data/styleIndex', () => ({
  loadVectors: vi.fn(async () => new Map()),
}))

const baseArtists = [
  { id: 'zoia.ink', handle: 'zoia.ink', name: '', tags: ['surrealism'], images: [], rank: 1, status: 'contact-next', notes: '', studio: null },
]

function renderGallery({ artists = baseArtists, setArtists = vi.fn() } = {}) {
  render(
    <MemoryRouter initialEntries={['/gallery']}>
      <Gallery artists={artists} setArtists={setArtists} />
    </MemoryRouter>
  )
  return { setArtists }
}

function pasteImageAt(target) {
  const file = new File(['x'], 'shot.png', { type: 'image/png' })
  fireEvent.paste(target, { clipboardData: { files: [file], types: ['Files'] } })
}

describe('Artists page: paste anywhere (#46)', () => {
  beforeEach(() => localStorage.clear())

  it('opens quick-add from a page-level paste when nothing has focus', async () => {
    renderGallery()
    expect(screen.queryByText(/add an artist/i)).not.toBeInTheDocument()

    pasteImageAt(document.body)

    await waitFor(() => expect(screen.getByText(/add an artist/i)).toBeInTheDocument())
  })

  it('does not intercept a paste while a text input has focus', async () => {
    renderGallery()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    pasteImageAt(input)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/add an artist/i)).not.toBeInTheDocument()

    document.body.removeChild(input)
  })

  it('ignores a text-only paste (no image on the clipboard)', async () => {
    renderGallery()
    fireEvent.paste(document.body, { clipboardData: { files: [], types: ['text/plain'] } })
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByText(/add an artist/i)).not.toBeInTheDocument()
  })

  it('does not open a second quick-add when one is already open', async () => {
    renderGallery()
    fireEvent.click(screen.getByRole('button', { name: /^\+ add$/i }))
    await waitFor(() => expect(screen.getByText(/add an artist/i)).toBeInTheDocument())

    pasteImageAt(document.body)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.getAllByText(/add an artist/i)).toHaveLength(1)
  })
})
