import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ArtistImage from '../components/ArtistImage'

describe('ArtistImage', () => {
  it('renders an <img> with the given src and a derived alt', () => {
    render(<ArtistImage src="/images/artists/zoia.ink/1.jpg" label="@zoia.ink" />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', '/images/artists/zoia.ink/1.jpg')
    expect(img).toHaveAttribute('alt', '@zoia.ink')
  })

  it('falls back to a monogram placeholder when the image fails to load', () => {
    render(<ArtistImage src="/images/artists/missing/1.jpg" label="@zoia.ink" />)
    fireEvent.error(screen.getByRole('img'))
    // The broken <img> is gone, replaced by the first-letter monogram.
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Z')).toBeInTheDocument()
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
