import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ArtistImage is the render boundary (#113): it takes a stored image *ref* and
// resolves it itself, so callers never pre-resolve. Display strings keep working
// (ArtistImage.test.jsx); this covers the blob-key refs state moves to later.

const getUrl = vi.fn()
vi.mock('../backend', () => ({
  backend: { blobs: { getUrl: (...args) => getUrl(...args) } },
}))

const { registerBlobUrl, clearBlobUrls } = await import('../data/blobUrls')
const { default: ArtistImage } = await import('../components/ArtistImage')

beforeEach(() => {
  clearBlobUrls()
  getUrl.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('ArtistImage with stored refs (#113)', () => {
  it('renders a cached { key } ref on the first paint', () => {
    registerBlobUrl('user/u1/a.jpg', 'https://signed.example/a')
    render(<ArtistImage src={{ key: 'user/u1/a.jpg' }} label="Zoia" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/a')
    expect(getUrl).not.toHaveBeenCalled()
  })

  it('shows the sized fallback while an uncached key loads, then the photo', async () => {
    getUrl.mockResolvedValue('https://signed.example/b')
    render(<ArtistImage src={{ key: 'user/u1/b.jpg' }} label="Zoia" />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Zoia')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/b'))
  })

  it('stays on the fallback when the key cannot be resolved', async () => {
    getUrl.mockRejectedValue(new Error('offline'))
    render(<ArtistImage src={{ key: 'user/u1/gone.jpg' }} label="Zoia" />)
    await waitFor(() => expect(getUrl).toHaveBeenCalled())
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Zoia')).toBeInTheDocument()
  })

  it('unwraps a { url, addedAt } ref and applies the deploy base', () => {
    render(<ArtistImage src={{ url: 'images/artists/a/1.jpg', addedAt: '2026-01-01T00:00:00Z' }} label="A" />)
    expect(screen.getByRole('img')).toHaveAttribute('src', '/images/artists/a/1.jpg')
  })
})
