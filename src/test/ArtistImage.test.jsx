import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
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

// A controllable promise, for tests that need to observe state *while* a
// retry is still in flight rather than only after it settles.
function deferred() {
  let resolve
  const promise = new Promise((r) => { resolve = r })
  return { promise, resolve }
}

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

  // Cross-model review (codex): React can re-render and reattach the same
  // still-failing src before the first retry resolves, firing a second
  // error for the exact same image. That must wait for the in-flight
  // attempt rather than racing ahead to the monogram before it even had a
  // chance to succeed.
  it('waits for an in-flight retry instead of failing early on a duplicate error for the same image', async () => {
    const first = deferred()
    refreshedBlobUrl.mockReturnValue(first.promise)
    render(<ArtistImage src="https://signed.example/expired" label="@zoia.ink" />)

    fireEvent.error(screen.getByRole('img'))
    fireEvent.error(screen.getByRole('img')) // duplicate, while the retry is still pending

    // Neither error should have resolved anything yet — still showing the
    // (broken, but not yet given up on) original image, not the monogram.
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/expired')
    expect(refreshedBlobUrl).toHaveBeenCalledTimes(1)

    first.resolve('https://signed.example/fresh')
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/fresh')
    )
    // The duplicate must not have triggered its own refresh attempt.
    expect(refreshedBlobUrl).toHaveBeenCalledTimes(1)
  })

  // Cross-model review (codex): a slow retry for a previous image (the src
  // prop changed while it was in flight — a reused component instance, e.g.
  // a table row) must not clobber a newer image that's *already recovered
  // from its own, separate failure* by the time the stale retry settles.
  it('discards a stale retry result for a previous image once a newer image has already recovered from its own failure', async () => {
    const forA = deferred()
    refreshedBlobUrl.mockImplementation((failedUrl) =>
      failedUrl === 'https://signed.example/a-expired'
        ? forA.promise
        : Promise.resolve('https://signed.example/b-fresh')
    )
    const { rerender } = render(<ArtistImage src="https://signed.example/a-expired" label="@zoia.ink" />)
    fireEvent.error(screen.getByRole('img')) // A's retry starts, stays pending on forA

    // Move on to a different image before A's retry settles — one that also
    // fails, and (unlike A) recovers quickly.
    rerender(<ArtistImage src="https://signed.example/b-expired" label="@vesper_noctis" />)
    fireEvent.error(screen.getByRole('img'))
    await waitFor(() =>
      expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/b-fresh')
    )

    // A's retry finally resolves — it must not overwrite B's already-fixed display.
    await act(async () => {
      forA.resolve('https://signed.example/a-fresh')
      await forA.promise
      // Let the resolved handleError's own continuation (the code after the
      // await) actually run and commit any resulting state update.
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://signed.example/b-fresh')
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
