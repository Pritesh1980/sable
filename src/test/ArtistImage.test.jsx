import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ArtistImage from '../components/ArtistImage'

// #82: a resolved blob URL baked into React state can go stale (its
// backend's TTL passed with nothing re-deriving it since). Mocking
// refreshedBlobUrl directly here proves ArtistImage's own retry-once wiring
// without needing a real blobUrls cache/backend — that function's own
// behavior is covered by blobUrlExpiry.test.js.
const refreshedBlobUrl = vi.fn()
vi.mock('../data/blobUrls', () => ({
  refreshedBlobUrl: (...args) => refreshedBlobUrl(...args),
}))

describe('ArtistImage', () => {
  beforeEach(() => {
    refreshedBlobUrl.mockReset()
    refreshedBlobUrl.mockResolvedValue(null)
  })

  it('renders an <img> with the given src and a derived alt', () => {
    render(<ArtistImage src="/images/artists/zoia.ink/1.jpg" label="@zoia.ink" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', '/images/artists/zoia.ink/1.jpg')
    expect(img).toHaveAttribute('alt', '@zoia.ink')
  })

  it('falls back to a monogram placeholder when the image fails to load', async () => {
    render(<ArtistImage src="/images/artists/missing/1.jpg" label="@zoia.ink" />)
    fireEvent.error(screen.getByRole('img'))
    // The onError path now tries a blob-url refresh first (#82) before
    // giving up — a static path has no known blob key, so that resolves to
    // null and the fallback still lands, just after a microtask.
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull())
    expect(screen.getByText('Z')).toBeInTheDocument()
  })

  // #82: a resolved blob URL baked into state can go stale (its backend TTL
  // passed with nothing re-deriving it since #29's cache-level fix). onError
  // is the last-resort recovery point — try one refresh before giving up to
  // the monogram, which is for genuinely missing images, not expired ones.
  it('retries once with a fresh blob URL on error, and shows that image instead of the monogram', async () => {
    refreshedBlobUrl.mockResolvedValue('https://signed.example/fresh')
    render(<ArtistImage src="https://signed.example/expired" label="@zoia.ink" />)

    fireEvent.error(screen.getByRole('img'))

    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/fresh')
    )
    expect(refreshedBlobUrl).toHaveBeenCalledWith('https://signed.example/expired')
  })

  it('falls back to the monogram if the retried URL also fails, without retrying forever', async () => {
    refreshedBlobUrl.mockResolvedValue('https://signed.example/fresh')
    render(<ArtistImage src="https://signed.example/expired" label="@zoia.ink" />)

    fireEvent.error(screen.getByRole('img'))
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/fresh')
    )

    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull())
    expect(screen.getByText('Z')).toBeInTheDocument()
    // Only the first error should have triggered a refresh attempt.
    expect(refreshedBlobUrl).toHaveBeenCalledTimes(1)
  })

  it('resets the retry and any prior failure when the src prop changes to a new image', async () => {
    const { rerender } = render(<ArtistImage src="https://signed.example/a-expired" label="@zoia.ink" />)
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() => expect(screen.queryByRole('img')).toBeNull())

    rerender(<ArtistImage src="https://signed.example/b-fine" label="@vesper_noctis" />)

    // A different, never-failed image must render normally, not stay stuck
    // showing the previous image's monogram fallback.
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/b-fine')
  })

  it('renders the monogram immediately when no src is provided', () => {
    render(<ArtistImage src={undefined} label="Carlos Valera" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('passes className through to the rendered image', () => {
    render(<ArtistImage src="/x.jpg" label="@x" className="w-full h-full object-cover" />)
    expect(screen.getByRole('img')).toHaveClass('object-cover')
  })

  it('derives the monogram from the first letter, stripping a leading @', () => {
    render(<ArtistImage src={undefined} label="@m3.inkd" />)
    expect(screen.getByText('M')).toBeInTheDocument()
  })
})
