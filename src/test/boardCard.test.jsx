import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearBlobUrls, registerBlobUrl } from '../data/blobUrls'
import {
  BRIEF_CARD_HEIGHT,
  BRIEF_CARD_WIDTH,
  boardCardFilename,
  collectBoardCardPhotos,
  exportBoardCardImage,
  layoutBoardCard,
} from '../data/briefCard'
import Brief from '../pages/Brief'

function assertBoxWithinCanvas(box, width = BRIEF_CARD_WIDTH, height = BRIEF_CARD_HEIGHT) {
  if (!box) return
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.width).toBeGreaterThan(0)
  expect(box.height).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(width)
  expect(box.y + box.height).toBeLessThanOrEqual(height)
}

describe('layoutBoardCard (#207)', () => {
  it('lays out an empty board (0 ideas) within 1080×1350 bounds', () => {
    const board = {
      id: 'b-empty',
      name: 'Dark botanical sleeve',
      description: 'Cohesive forearm-to-shoulder flow with negative space.',
      ideaIds: [],
    }
    const layout = layoutBoardCard(board, [])

    expect(layout.width).toBe(1080)
    expect(layout.height).toBe(1350)
    expect(layout.header.kicker).toBe('SABLE · TATTOO BOARD')
    expect(layout.title.lines.join(' ')).toContain('Dark botanical sleeve')
    expect(layout.description.lines.join(' ')).toContain('Cohesive forearm-to-shoulder flow')
    expect(layout.photos.slots).toEqual([])
    assertBoxWithinCanvas(layout.header.box)
    assertBoxWithinCanvas(layout.title.box)
    assertBoxWithinCanvas(layout.description.box)
    assertBoxWithinCanvas(layout.footer.box)
  })

  it('lays out 1–4 member ideas with hero photos, idea captions, aggregated pills, and linked artists', () => {
    const ideas = [
      {
        id: 'i1',
        title: 'Botanical forearm study',
        placement: 'forearm',
        tags: ['dark-illustrative', 'fine-line'],
        images: [{ url: '/images/demo/mora.blackfern/1.svg', note: 'Fern silhouette' }],
        linkedArtists: ['a1'],
      },
      {
        id: 'i2',
        title: 'Lunar moth shoulder',
        placement: 'upper-arm',
        tags: ['blackwork', 'fine-line'],
        images: [{ url: '/images/demo/vesper.noctis/1.svg', note: 'Wing stippling' }],
        linkedArtists: ['a2'],
      },
      {
        id: 'i3',
        title: 'Thorn wrist cuff',
        placement: 'forearm',
        tags: ['blackwork'],
        images: [{ url: '/images/demo/mora.blackfern/2.svg', note: '' }],
        linkedArtists: ['a1'],
      },
    ]
    const board = {
      id: 'b1',
      name: 'Botanical studies',
      description: 'Fern, moth and thorn studies for the left arm.',
      ideaIds: ['i1', 'i2', 'i3'],
    }
    const artists = [
      { id: 'a1', name: 'Mora Vane', handle: 'mora.blackfern' },
      { id: 'a2', name: 'Vesper Ash', handle: 'vesper_noctis' },
    ]

    const layout = layoutBoardCard(board, ideas, { artists })

    expect(layout.header.kicker).toBe('SABLE · TATTOO BOARD · 3 IDEAS')
    expect(layout.header.artistLine).toBe('For Mora Vane (@mora.blackfern) · Vesper Ash (@vesper_noctis)')
    expect(layout.pills.map((p) => p.label)).toEqual([
      'FOREARM',
      'UPPER-ARM',
      'DARK-ILLUSTRATIVE',
      'FINE-LINE',
      'BLACKWORK',
    ])
    expect(layout.photos.slots).toHaveLength(3)
    expect(layout.photos.slots[0].caption.lines.join(' ')).toContain('Botanical forearm study · forearm')
    expect(layout.photos.slots[1].caption.lines.join(' ')).toContain('Lunar moth shoulder · upper-arm')
    expect(layout.photos.slots[2].caption.lines.join(' ')).toContain('Thorn wrist cuff · forearm')
    expect(layout.photos.overflowLabel).toBe('')
  })

  it('caps board photo slots at 4 and shows +N more ideas in the footer when >4 ideas belong to the board', () => {
    const ideas = Array.from({ length: 6 }, (_, i) => ({
      id: `i${i + 1}`,
      title: `Piece ${i + 1}`,
      placement: 'forearm',
      tags: ['blackwork'],
      images: [{ url: `/images/demo/p${i + 1}.png` }],
    }))
    const board = {
      id: 'b6',
      name: 'Six-piece patchwork',
      description: 'Full arm patchwork plan.',
      ideaIds: ideas.map((i) => i.id),
    }

    const layout = layoutBoardCard(board, ideas)

    expect(layout.photos.slots).toHaveLength(4)
    expect(layout.photos.overflowLabel).toBe('+2 more ideas')
    assertBoxWithinCanvas(layout.photos.box)
  })

  it('lists member ideas in the card body when the board ideas have no photos', () => {
    const ideas = [
      { id: 'i1', title: 'Serpent collarbone', placement: 'chest', tags: ['fine-line'], images: [] },
      { id: 'i2', title: 'Hourglass sternum', placement: 'chest', tags: ['blackwork'], images: [] },
    ]
    const board = {
      id: 'b-text',
      name: 'Torso symmetry',
      description: 'Paired fine-line and blackwork pieces.',
      ideaIds: ['i1', 'i2'],
    }

    const layout = layoutBoardCard(board, ideas)

    expect(layout.photos.slots).toHaveLength(0)
    const descText = layout.description.lines.join(' ')
    expect(descText).toContain('Paired fine-line and blackwork pieces.')
    expect(descText).toContain('1. Serpent collarbone (chest)')
    expect(descText).toContain('2. Hourglass sternum (chest)')
  })

  it('wraps and truncates a very long board name and description and counts skipped cross-origin web images', () => {
    const ideas = [
      {
        id: 'i1',
        title: 'Web-only idea',
        placement: 'back',
        tags: ['surrealism'],
        images: [
          { url: 'https://instagram.com/p/1/img.jpg' },
          { url: 'https://example.com/2.jpg' },
        ],
      },
      {
        id: 'i2',
        title: 'Local idea',
        placement: 'ribs',
        tags: ['dark-fantasy'],
        images: [{ url: '/images/demo/local.png' }],
      },
    ]
    const board = {
      id: 'b-long',
      name: 'Architectural gothic cathedral arches and botanical overgrowth across full back and ribs '.repeat(2),
      description: 'Detailed notes on negative space, spine alignment, and stippled rib transitions. '.repeat(20),
      ideaIds: ['i1', 'i2'],
    }

    const layout = layoutBoardCard(board, ideas)

    expect(layout.title.lines.length).toBeLessThanOrEqual(2)
    expect(layout.title.truncated).toBe(true)
    expect(layout.description.truncated).toBe(true)
    expect(layout.photos.slots).toHaveLength(1)
    expect(layout.photos.skippedWebCount).toBe(2)
    expect(layout.photos.skippedNotice).toBe('2 web images not included')
    expect(layout.photos.overflowLabel).toBe('+1 more idea')
  })
})

describe('collectBoardCardPhotos & exportBoardCardImage (#207)', () => {
  beforeEach(() => {
    clearBlobUrls()
  })

  it('collects one ready hero photo per member idea in board order and skips offline keys and external URLs', async () => {
    registerBlobUrl(
      'user/local/ideas/i1/hero.png',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    )

    const ideas = [
      {
        id: 'i1',
        title: 'First idea',
        placement: 'forearm',
        images: [
          { url: 'https://cdn.instagram.com/ext.jpg' },
          { key: 'user/local/ideas/i1/hero.png', note: 'Hero' },
        ],
      },
      {
        id: 'i2',
        title: 'Offline idea',
        placement: 'back',
        images: [{ key: 'user/local/ideas/i2/missing.png' }],
      },
      {
        id: 'i3',
        title: 'Third idea',
        placement: 'calf',
        images: [{ url: '/images/demo/local.svg' }],
      },
    ]
    const board = {
      id: 'b1',
      name: 'Botanical studies',
      description: 'Studies',
      ideaIds: ['i1', 'i2', 'i3'],
    }

    const loadImage = vi.fn(async (src) => ({ src, naturalWidth: 200, naturalHeight: 200 }))
    const collected = await collectBoardCardPhotos(board, ideas, { loadImage, onlyReadyKeys: true })

    expect(collected.photos).toHaveLength(2)
    expect(collected.photos[0].note).toBe('First idea · forearm')
    expect(collected.photos[1].note).toBe('Third idea · calf')
    expect(collected.skippedWebCount).toBe(1)
    expect(collected.skippedNotice).toBe('1 web image not included')
    expect(collected.overflowCount).toBe(1)
    expect(boardCardFilename(board)).toBe('sable-board-botanical-studies.png')

    const fillText = vi.fn()
    const fakeCtx = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: 'top',
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText, drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      measureText: (t) => ({ width: t.length * 12 }),
    }
    const fakeCanvas = {
      width: 0, height: 0,
      getContext: () => fakeCtx,
      toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })),
    }
    const download = vi.fn()
    const exported = await exportBoardCardImage(board, ideas, {
      createCanvas: () => fakeCanvas,
      loadImage,
      download,
      nav: {},
    })

    expect(exported.filename).toBe('sable-board-botanical-studies.png')
    expect(exported.photoCount).toBe(2)
    expect(exported.skippedWebCount).toBe(1)
    expect(download).toHaveBeenCalledTimes(1)
    const texts = fillText.mock.calls.map(([t]) => t)
    expect(texts).toContain('SABLE · TATTOO BOARD · 3 IDEAS')
    expect(texts).toContain('Botanical studies')
    expect(texts).toContain('+1 more idea')
  })
})

describe('BoardModal Share board controls (#207)', () => {
  it('renders Copy brief and Share as image in the board editor and shows skipped web image notice', async () => {
    const ideas = [
      {
        id: 'i1',
        title: 'Botanical forearm',
        status: 'idea',
        placement: 'forearm',
        tags: ['fine-line'],
        description: 'Fern and seed heads',
        images: [{ url: 'https://example.com/one.jpg', note: '' }],
        linkedArtists: [],
      },
    ]
    const boards = [
      {
        id: 'b1',
        name: 'Botanical studies',
        description: 'Fern and seed studies',
        ideaIds: ['i1'],
        cover: '',
      },
    ]

    render(
      <MemoryRouter initialEntries={['/brief?tab=boards']}>
        <Brief ideas={ideas} setIdeas={vi.fn()} artists={[]} boards={boards} setBoards={vi.fn()} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Botanical studies'))
    const shareBtn = screen.getByRole('button', { name: /share as image/i })
    const copyBtn = screen.getByRole('button', { name: /copy brief/i })
    expect(shareBtn).toBeInTheDocument()
    expect(copyBtn).toBeInTheDocument()

    const ctx = {
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      measureText: (t) => ({ width: t.length * 12 }),
    }
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })))
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      fireEvent.click(shareBtn)
      await waitFor(() => {
        expect(screen.getByText(/1 web image not included/i)).toBeInTheDocument()
      })
      const receipt = screen.getByRole('button', { name: /download requested/i })
      expect(receipt).toHaveAttribute('aria-disabled', 'true')
      await act(async () => fireEvent.click(receipt))
      expect(download).toHaveBeenCalledTimes(1)
    } finally {
      download.mockRestore()
      getContext.mockRestore()
      toBlob.mockRestore()
    }
  })
})
