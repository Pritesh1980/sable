import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WallViewer from '../components/WallViewer'

const items = [
  {
    artistId: 'victorportugal',
    artistName: 'Victor Portugal',
    handle: 'victorportugal',
    styles: ['dark-illustrative', 'blackwork'],
    image: '/images/victorportugal/1.jpg',
    imageIndex: 0,
  },
  {
    artistId: 'victorportugal',
    artistName: 'Victor Portugal',
    handle: 'victorportugal',
    styles: ['dark-illustrative', 'blackwork'],
    image: '/images/victorportugal/2.jpg',
    imageIndex: 1,
  },
  {
    artistId: 'zoia.ink',
    artistName: 'zoia.ink',
    handle: 'zoia.ink',
    styles: ['surrealism'],
    image: '/images/zoia/1.jpg',
    imageIndex: 0,
  },
]

const artists = [
  { id: 'victorportugal', status: 'shortlisted', notes: 'Loved the last piece.' },
  { id: 'zoia.ink', status: 'researching', notes: '' },
]

const ideas = [
  { id: 'idea-1', title: 'Sleeve concept', linkedArtists: ['victorportugal'] },
]

function renderViewer(props = {}) {
  return render(
    <WallViewer
      items={items}
      initialIndex={0}
      artists={artists}
      ideas={ideas}
      onClose={vi.fn()}
      onGenerate={vi.fn()}
      {...props}
    />
  )
}

describe('WallViewer', () => {
  it('renders the artist plate with name, instagram link-out and styles', () => {
    renderViewer()
    expect(screen.getByText('Victor Portugal')).toBeInTheDocument()
    const link = screen.getByText('@victorportugal ↗')
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/victorportugal/')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(screen.getByText('dark-illustrative · blackwork')).toBeInTheDocument()
  })

  it('renders the index label', () => {
    renderViewer()
    expect(screen.getByText(/artist 1 of 2/)).toBeInTheDocument()
  })

  it('renders a filmstrip of the current artist\'s images', () => {
    renderViewer()
    const imgs = screen.getAllByRole('img')
    // 1 stage image + 2 filmstrip thumbs for victorportugal (2 images)
    expect(imgs.length).toBeGreaterThanOrEqual(3)
  })

  it('jumps to the clicked filmstrip image', () => {
    renderViewer()
    fireEvent.click(screen.getByAltText('Victor Portugal thumbnail 2'))
    expect(screen.getByText(/artist 1 of 2/)).toBeInTheDocument()
    expect(screen.getByText('02')).toBeInTheDocument()
  })

  it('calls onGenerate with the current item when the generate button is clicked', () => {
    const onGenerate = vi.fn()
    renderViewer({ onGenerate })
    fireEvent.click(screen.getByText(/generate a concept/i))
    expect(onGenerate).toHaveBeenCalledTimes(1)
    expect(onGenerate.mock.calls[0][0]).toMatchObject({ artistId: 'victorportugal', imageIndex: 0 })
  })

  it('calls onGenerate on G keypress and onClose on Escape', () => {
    const onGenerate = vi.fn()
    const onClose = vi.fn()
    renderViewer({ onGenerate, onClose })

    fireEvent.keyDown(window, { key: 'g' })
    expect(onGenerate).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens the info panel on I and shows status/notes/linked ideas', () => {
    renderViewer()
    fireEvent.keyDown(window, { key: 'I' })
    expect(screen.getByText('Shortlisted')).toBeInTheDocument()
    expect(screen.getByText('Loved the last piece.')).toBeInTheDocument()
    expect(screen.getByText('Sleeve concept')).toBeInTheDocument()
  })

  it('renders nothing when open is false', () => {
    const { container } = renderViewer({ open: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('does not use banned low-opacity cream-muted utilities', () => {
    // guarded more thoroughly by v2-tokens.spec.js; sanity check here too
    const { container } = renderViewer()
    expect(container.innerHTML).not.toMatch(/cream-muted\/30|cream-muted\/40/)
  })

  describe('paste-to-current-artist', () => {
    function pasteFile(file) {
      const event = new Event('paste', { bubbles: true, cancelable: true })
      Object.defineProperty(event, 'clipboardData', { value: { files: file ? [file] : [] } })
      window.dispatchEvent(event)
    }

    it('adds a pasted image to the artist currently in view', () => {
      const onPasteImage = vi.fn()
      renderViewer({ onPasteImage })
      const file = new File(['x'], 'ref.jpg', { type: 'image/jpeg' })

      pasteFile(file)

      expect(onPasteImage).toHaveBeenCalledWith('victorportugal', file)
    })

    it('targets whichever artist is current after navigating within the viewer', () => {
      const onPasteImage = vi.fn()
      renderViewer({ onPasteImage, initialIndex: 2 }) // zoia.ink
      const file = new File(['x'], 'ref.jpg', { type: 'image/jpeg' })

      pasteFile(file)

      expect(onPasteImage).toHaveBeenCalledWith('zoia.ink', file)
    })

    it('ignores a paste with no file', () => {
      const onPasteImage = vi.fn()
      renderViewer({ onPasteImage })
      pasteFile(null)
      expect(onPasteImage).not.toHaveBeenCalled()
    })
  })
})
