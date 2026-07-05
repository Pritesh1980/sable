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
    fireEvent.click(screen.getByRole('img').closest('figure'))
    expect(onOpen).toHaveBeenCalledWith(item)
  })

  it('is a no-op drop target when onDropImage is not provided', () => {
    render(<WallPiece item={item} onOpen={vi.fn()} />)
    const figure = screen.getByRole('img').closest('figure')
    expect(() => fireEvent.drop(figure, makeDropEvent(new File(['x'], 'a.jpg', { type: 'image/jpeg' })))).not.toThrow()
  })
})
