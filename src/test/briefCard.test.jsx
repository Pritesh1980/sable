import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import {
  BRIEF_CARD_WIDTH,
  BRIEF_CARD_HEIGHT,
  layoutBriefCard,
  collectBriefCardPhotos,
  drawBriefCardOnCanvas,
  exportBriefCardImage,
  shareOrDownloadBriefCard,
} from '../data/briefCard'
import { registerBlobUrl, clearBlobUrls } from '../data/blobUrls'
import Brief from '../pages/Brief'

function hasLoneSurrogate(text) {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

function boxesOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

describe('layoutBriefCard', () => {
  it('defaults to 1080×1350 Instagram portrait and keeps all boxes inside the canvas', () => {
    const layout = layoutBriefCard({
      title: 'Botanical forearm study',
      placement: 'forearm',
      tags: ['dark-illustrative', 'fine-line'],
      description: 'A fern unfolding along the forearm with soft black-and-grey shading.',
      images: [{ url: '/images/demo/mora.blackfern/1.svg' }],
      linkedArtists: ['a1'],
    }, {
      artists: [{ id: 'a1', name: 'Mora Vane', handle: 'mora.blackfern' }],
    })

    expect(layout.width).toBe(BRIEF_CARD_WIDTH)
    expect(layout.height).toBe(BRIEF_CARD_HEIGHT)
    expect(layout.width).toBe(1080)
    expect(layout.height).toBe(1350)
    expect(layout.header.artistLine).toContain('Mora Vane')
    expect(layout.header.artistLine).toContain('@mora.blackfern')

    const boxes = [
      layout.header.box,
      layout.title.box,
      layout.pillsBox,
      layout.description.box,
      layout.photos.box,
      layout.footer.box,
    ].filter(Boolean)

    for (const box of boxes) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(layout.width)
      expect(box.y + box.height).toBeLessThanOrEqual(layout.height)
    }
  })

  it('wraps and truncates a very long title without overflowing width or vertical bounds', () => {
    const longTitle = 'An intricately shaded botanical and celestial sleeve weaving moths, crescent moons, ferns, hourglasses, and gothic arches from shoulder to wrist'
    const layout = layoutBriefCard({
      title: longTitle,
      placement: 'sleeve',
      tags: ['blackwork', 'dark-illustrative'],
      description: 'Detailed notes for the sleeve composition.',
      images: [{ url: '/images/demo/mora.blackfern/1.svg' }],
    })

    expect(layout.title.lines.length).toBeGreaterThanOrEqual(2)
    expect(layout.title.lines.length).toBeLessThanOrEqual(3)
    expect(layout.title.truncated).toBe(true)
    expect(layout.title.lines.at(-1)).toMatch(/…$/)
    expect(layout.title.box.y + layout.title.box.height).toBeLessThanOrEqual(layout.pillsBox.y)
  })

  it('lays out an idea with no photos and gives description extra vertical room', () => {
    const longDescription = Array.from(
      { length: 10 },
      (_, i) => `Line ${i + 1}: Keep breathing room between the fronds and follow the natural curve of the ulna.`,
    ).join(' ')

    const withoutPhotos = layoutBriefCard({
      title: 'Minimal fern study',
      placement: 'forearm',
      tags: ['fine-line'],
      description: longDescription,
      images: [],
    })
    const withPhotos = layoutBriefCard({
      title: 'Minimal fern study',
      placement: 'forearm',
      tags: ['fine-line'],
      description: longDescription,
      images: [{ url: '/images/demo/mora.blackfern/1.svg' }],
    })

    expect(withoutPhotos.photos.slots).toEqual([])
    expect(withoutPhotos.photos.box).toBeNull()
    expect(withoutPhotos.description.lines.length).toBeGreaterThan(withPhotos.description.lines.length)
  })

  it('lays out four photos in a 2×2 grid without overlapping slots and caps >4 photos at four', () => {
    const layout = layoutBriefCard({
      title: 'Four-reference study',
      placement: 'back',
      tags: ['blackwork', 'surrealism'],
      description: 'Reference angles and shading studies.',
      images: [
        { url: '/images/demo/1.png', note: 'Top left' },
        { url: '/images/demo/2.png', note: 'Top right' },
        { url: '/images/demo/3.png', note: 'Bottom left' },
        { url: '/images/demo/4.png', note: 'Bottom right' },
        { url: '/images/demo/5.png', note: 'Extra ignored' },
      ],
    })

    expect(layout.photos.slots).toHaveLength(4)
    expect(layout.photos.box).not.toBeNull()

    const { slots, box } = layout.photos
    for (let i = 0; i < slots.length; i += 1) {
      const s = slots[i]
      expect(s.x).toBeGreaterThanOrEqual(box.x)
      expect(s.y).toBeGreaterThanOrEqual(box.y)
      expect(s.x + s.width).toBeLessThanOrEqual(box.x + box.width)
      expect(s.y + s.height).toBeLessThanOrEqual(box.y + box.height)
      for (let j = i + 1; j < slots.length; j += 1) {
        expect(boxesOverlap(s, slots[j])).toBe(false)
      }
    }
  })

  it('wraps and truncates emoji without splitting surrogate pairs or ZWJ sequences', () => {
    const emojiTitle = '🐉✨ Celestial dragon & moon study 🌙🗡️👩‍🎨🖤🔥🐉✨🌙🗡️👩‍🎨🖤🔥🐉✨🌙🗡️👩‍🎨🖤🔥'
    const emojiDesc = 'Mood: 🌑🕯️🦇🦉🕸️ — keep the linework crisp ✍️ and avoid heavy fill around the wrist 🐉✨🌙🗡️👩‍🎨🖤 '.repeat(8)

    const layout = layoutBriefCard({
      title: emojiTitle,
      placement: 'forearm',
      tags: ['dark-fantasy'],
      description: emojiDesc,
      images: [{ url: '/images/demo/1.png' }],
    })

    for (const line of [...layout.title.lines, ...layout.description.lines]) {
      expect(hasLoneSurrogate(line)).toBe(false)
    }
    expect(layout.title.lines.join(' ')).toContain('🐉')
    expect(layout.description.lines.join(' ')).toContain('🕯️')
  })

  it('counts skipped cross-origin web URLs and formats the notice', () => {
    const layout = layoutBriefCard({
      title: 'Web refs test',
      images: [
        { url: 'https://instagram.com/p/abc/image.jpg' },
        { url: 'https://example.com/ref2.jpg' },
        { url: '/images/demo/mora.blackfern/1.svg' },
      ],
    })

    expect(layout.photos.slots).toHaveLength(1)
    expect(layout.photos.skippedWebCount).toBe(2)
    expect(layout.photos.skippedNotice).toBe('2 web images not included')
  })

  it('measures title with weight 600 and truncates overflowing linked artist lines', () => {
    const measuredSpecs = []
    const layout = layoutBriefCard(
      {
        title: 'weight_check_title',
        linkedArtists: ['a1', 'a2', 'a3'],
      },
      {
        artists: [
          { id: 'a1', name: 'Aurelia Blackthorn-Vane', handle: 'aurelia_blackthorn_vane_tattoo' },
          { id: 'a2', name: 'Severin Nocturne-Ash', handle: 'severin_nocturne_ash_studio' },
          { id: 'a3', name: 'Mora Vesper-Holloway', handle: 'mora_vesper_holloway_ink' },
        ],
        measureText: (text, fontSpec, fontSize) => {
          measuredSpecs.push(fontSpec)
          return text.length * fontSize * 0.56
        },
      },
    )

    expect(measuredSpecs.some((spec) => spec.startsWith('600 56px'))).toBe(true)
    expect(layout.header.artistTruncated).toBe(true)
    expect(layout.header.artistLine.endsWith('…')).toBe(true)
  })
})

describe('collectBriefCardPhotos & shareOrDownloadBriefCard', () => {
  beforeEach(() => {
    clearBlobUrls()
  })

  it('resolves ready blob keys, skips unavailable keys, and reports cross-origin web URLs', async () => {
    registerBlobUrl('user/local/ideas/i1/ready.png', 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')

    const loadImage = vi.fn(async (src) => ({ src, naturalWidth: 100, naturalHeight: 100 }))
    const result = await collectBriefCardPhotos(
      [
        { key: 'user/local/ideas/i1/ready.png', note: 'Ready ref' },
        { key: 'user/local/ideas/i1/missing.png', note: 'Offline ref' },
        { url: 'https://cdn.instagram.com/photo1.jpg', note: 'External 1' },
        { url: 'https://example.com/photo2.jpg', note: 'External 2' },
      ],
      { loadImage, onlyReadyKeys: true },
    )

    expect(result.photos).toHaveLength(1)
    expect(result.skippedWebCount).toBe(2)
    expect(result.skippedNotice).toBe('2 web images not included')
  })

  it('uses navigator.share({ files }) when navigator.canShare accepts files, and downloads otherwise', async () => {
    const fakeBlob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const canShare = vi.fn(() => true)
    const share = vi.fn(async () => {})
    const download = vi.fn()

    const shared = await shareOrDownloadBriefCard(fakeBlob, 'sable-brief-fern.png', {
      nav: { canShare, share },
      download,
    })

    expect(shared.method).toBe('share')
    expect(canShare).toHaveBeenCalledTimes(1)
    expect(share).toHaveBeenCalledTimes(1)
    const sharedArg = share.mock.calls[0][0]
    expect(sharedArg.files).toHaveLength(1)
    expect(sharedArg.files[0].name).toBe('sable-brief-fern.png')
    expect(sharedArg.files[0].type).toBe('image/png')
    expect(download).not.toHaveBeenCalled()

    const downloaded = await shareOrDownloadBriefCard(fakeBlob, 'sable-brief-fern.png', {
      nav: { canShare: () => false, share },
      download,
    })
    expect(downloaded.method).toBe('download')
    expect(download).toHaveBeenCalledWith(fakeBlob, 'sable-brief-fern.png')
  })

  it('draws onto a 1080×1350 canvas context and awaits document.fonts.ready before measuring', async () => {
    let fontsResolved = false
    const origFonts = document.fonts
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        ready: new Promise((resolve) => {
          setTimeout(() => {
            fontsResolved = true
            resolve()
          }, 10)
        }),
      },
    })

    const fillText = vi.fn()
    const drawImage = vi.fn()
    const fakeCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textBaseline: 'top',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText,
      drawImage,
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      measureText: (t) => ({ width: t.length * 12 }),
    }

    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: () => fakeCtx,
    }
    const layout = layoutBriefCard({
      title: 'Raven & hourglass',
      placement: 'chest',
      tags: ['blackwork'],
      description: 'High-contrast etching.',
      images: [{ url: '/images/demo/1.png' }],
      linkedArtists: ['a1'],
    }, {
      artists: [{ id: 'a1', name: 'Vesper Ash', handle: 'vesper_noctis' }],
    })

    const drew = drawBriefCardOnCanvas(fakeCanvas, layout, [
      { element: { naturalWidth: 600, naturalHeight: 800 }, note: '' },
    ])
    expect(drew).toBe(true)
    expect(fakeCanvas.width).toBe(1080)
    expect(fakeCanvas.height).toBe(1350)
    expect(drawImage).toHaveBeenCalledTimes(1)
    const renderedTexts = fillText.mock.calls.map((c) => c[0])
    expect(renderedTexts).toContain('Raven & hourglass')
    expect(renderedTexts).toContain('For Vesper Ash (@vesper_noctis)')
    expect(renderedTexts).toContain('CHEST')
    expect(renderedTexts).toContain('BLACKWORK')

    try {
      const download = vi.fn()
      await exportBriefCardImage(
        { title: 'Font wait check', images: [] },
        { download, nav: {} },
      )
      expect(fontsResolved).toBe(true)
      expect(download).toHaveBeenCalledTimes(1)

      const brokenCanvas = {
        width: 0,
        height: 0,
        getContext: () => fakeCtx,
        toBlob: (cb) => cb(null),
      }
      await expect(
        exportBriefCardImage(
          { title: 'Broken canvas check', images: [] },
          { createCanvas: () => brokenCanvas, download, nav: {} },
        ),
      ).rejects.toThrow(/empty blob/i)
    } finally {
      if (origFonts !== undefined) {
        Object.defineProperty(document, 'fonts', { configurable: true, value: origFonts })
      } else {
        delete document.fonts
      }
    }
  })
})

describe('IdeaModal Share as image button', () => {
  it('renders Share as image next to Copy brief and shows skipped web image notice', async () => {
    const ideas = [
      {
        id: 'i1',
        title: 'Botanical forearm',
        status: 'idea',
        placement: 'forearm',
        tags: ['fine-line'],
        description: 'Fern and seed heads',
        images: [
          { url: 'https://example.com/one.jpg', note: '' },
          { url: 'https://example.com/two.jpg', note: '' },
        ],
        linkedArtists: [],
      },
    ]

    render(
      <MemoryRouter initialEntries={['/brief']}>
        <Brief ideas={ideas} setIdeas={vi.fn()} artists={[]} boards={[]} setBoards={vi.fn()} />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByText('Botanical forearm'))
    const shareBtn = screen.getByRole('button', { name: /share as image/i })
    expect(shareBtn).toBeInTheDocument()
    expect(shareBtn).not.toBeDisabled()

    fireEvent.click(shareBtn)
    await waitFor(() => {
      expect(screen.getByText(/2 web images not included/i)).toBeInTheDocument()
    })
  })
})
