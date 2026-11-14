import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WallPiece from '../components/WallPiece'

const item = {
  artistId: 'zoia.ink',
  artistName: 'zoia.ink',
  handle: 'zoia.ink',
  styles: ['surrealism'],
  image: '/images/zoia/1.jpg',
  imageIndex: 0,
}

function makeDropEvent(file) {
  return { preventDefault: () => {}, dataTransfer: { files: file ? [file] : [] } }
}

describe('WallPiece drop-zone', () => {
  it('labels generated demo artwork even without a demo session', () => {
    render(<WallPiece item={{ ...item, image: '/sable/images/demo/mora.blackfern/fern-v4.webp' }} onOpen={vi.fn()} />)
    expect(screen.getByText(/AI-generated imagery/i)).toBeInTheDocument()
  })

  it('does not label a real artist image as generated', () => {
    render(<WallPiece item={item} onOpen={vi.fn()} />)
    expect(screen.queryByText(/AI-generated imagery/i)).toBeNull()
  })
  it('highlights with a v2-accent ring while a file is dragged over it', () => {
    render(<WallPiece item={item} onOpen={vi.fn()} onDropImage={vi.fn()} />)
    const figure = screen.getByRole('img').closest('figure')

    fireEvent.dragOver(figure)
    expect(figure.className).toMatch(/ring-v2-accent/)

    fireEvent.dragLeave(figure)
    expect(figure.className).not.toMatch(/ring-v2-accent/)
  })

  it('calls onDropImage with the artist id and dropped file, targeting this piece\'s artist', () => {
    const onDropImage = vi.fn()
    render(<WallPiece item={item} onOpen={vi.fn()} onDropImage={onDropImage} />)
    const figure = screen.getByRole('img').closest('figure')
    const file = new File(['x'], 'ref.jpg', { type: 'image/jpeg' })

    fireEvent.drop(figure, makeDropEvent(file))

    expect(onDropImage).toHaveBeenCalledWith('zoia.ink', file)
  })

  it('does not intercept the click that opens the piece', () => {
    const onOpen = vi.fn()
    render(<WallPiece item={item} onOpen={onOpen} onDropImage={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open zoia.ink' }))
    expect(onOpen).toHaveBeenCalledWith(item)
  })

  it('is a no-op drop target when onDropImage is not provided', () => {
    render(<WallPiece item={item} onOpen={vi.fn()} />)
    const figure = screen.getByRole('img').closest('figure')
    expect(() => fireEvent.drop(figure, makeDropEvent(new File(['x'], 'a.jpg', { type: 'image/jpeg' })))).not.toThrow()
  })
})

describe('WallPiece keyboard access', () => {
  it('opens from a native button named for its artist, so Tab + Enter/Space work', () => {
    const onOpen = vi.fn()
    render(<WallPiece item={item} onOpen={onOpen} />)
    const piece = screen.getByRole('button', { name: 'Open zoia.ink' })
    expect(piece.tagName).toBe('BUTTON')
    expect(piece).toHaveAttribute('type', 'button')
    fireEvent.click(piece)
    expect(onOpen).toHaveBeenCalledWith(item)
  })

  it('keeps the figure for its caption and drop target', () => {
    render(<WallPiece item={item} onOpen={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Open zoia.ink' }).closest('figure')).not.toBeNull()
  })
})

// #220: the name is always on the piece, on phone and laptop alike; only the
// studio line waits for a hover-capable device.
describe('WallPiece caption', () => {
  const withStudio = { ...item, artistName: 'Zoia', studioName: 'No Regrets London' }

  it('always shows the artist name, with no hover gate on the plate', () => {
    render(<WallPiece item={withStudio} onOpen={vi.fn()} />)
    const caption = screen.getByText('Zoia', { selector: 'span' }).closest('figcaption')
    expect(caption.className).not.toMatch(/opacity-0/)
    expect(caption.className).toMatch(/pointer-events-none/)
  })

  it('hides only the studio name until hover, and only where hover exists', () => {
    render(<WallPiece item={withStudio} onOpen={vi.fn()} />)
    const studio = screen.getByText('No Regrets London')
    expect(studio.tagName).toBe('SMALL')
    expect(studio.className).toMatch(/can-hover:opacity-0/)
    expect(studio.className).toMatch(/group-hover:opacity-100/)
  })
})
