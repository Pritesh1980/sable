import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import {
  BRIEF_CARD_WIDTH,
  BRIEF_CARD_HEIGHT,
  layoutBriefCard,
  collectBriefCardPhotos,
  drawBriefCardOnCanvas,
  exportBriefCardImage,
  shareOrDownloadBriefCard,
  prepareBriefCardImage,
  computeBriefCardCrop,
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

describe('export-only crop and prepared PNG', () => {
  it('uses bounded source coordinates for an edge crop without stretching', () => {
    expect(computeBriefCardCrop(800, 600, 200, 400, { x: 1, y: 0, zoom: 2 }))
      .toEqual({ sx: 650, sy: 0, sw: 150, sh: 300 })
    expect(computeBriefCardCrop(800, 600, 200, 400))
      .toEqual({ sx: 250, sy: 0, sw: 300, sh: 600 })
  })
  it('keeps source occurrence and crop attached after exclusions and decode failures', async () => {
    const crop = { x: 1, y: 0, zoom: 2 }
    const result = await collectBriefCardPhotos([
      { url: 'https://example.com/x.jpg' }, { url: '/bad.png' },
      { url: '/good.png', note: 'Shape', briefCrop: crop },
      { url: '/good.png', note: 'Shading' },
    ], { loadImage: async (src) => src.endsWith('/bad.png') ? null : { width: 800, height: 600 } })
    expect(result.photos.map((p) => p.sourceIndex)).toEqual([2, 3])
    expect(result.photos[0]).toMatchObject({ note: 'Shape', crop, ref: { url: '/good.png', note: 'Shape', briefCrop: crop } })
    expect(result.unavailableCount).toBe(1)
  })
  it('prepares a PNG without triggering delivery', async () => {
    const ctx = {
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), measureText: (t) => ({ width: t.length * 12 }),
    }
    const blob = new Blob(['actual PNG'], { type: 'image/png' })
    const result = await prepareBriefCardImage({ title: 'Prepared' }, {
      createCanvas: () => ({ getContext: () => ctx, toBlob: (cb) => cb(blob) }),
    })
    expect(result.blob).toBe(blob)
    expect(result.filename).toBe('sable-brief-prepared.png')
    expect(result.layout.width).toBe(1080)
  })
})

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

  it('balances a short text-only brief between the masthead and footer', () => {
    const layout = layoutBriefCard({ title: 'Fern study', description: 'Keep the fronds soft.' })
    const withPhoto = layoutBriefCard({ title: 'Fern study', images: ['/images/fern.png'] })
    const topGap = layout.title.box.y - layout.header.box.y - layout.header.box.height
    const bottomGap = layout.footer.box.y - layout.description.box.y - layout.description.box.height
    expect(Math.abs(topGap - bottomGap)).toBeLessThanOrEqual(2)
    expect(layout.title.fontSize).toBeGreaterThan(withPhoto.title.fontSize)
    expect(layout.description.fontSize).toBeGreaterThan(withPhoto.description.fontSize)
  })

  it('keeps two photo crops at or wider than 4:5 even on a short brief', () => {
    const { photos } = layoutBriefCard({
      title: 'Fern study',
      images: [
        { url: '/images/fern.png', note: 'Shape' },
        { url: '/images/fronds.png', note: 'Shading' },
      ],
    })
    expect(photos.slots).toHaveLength(2)
    expect(photos.slots[0].y).toBe(photos.slots[1].y)
    for (const slot of photos.slots) {
      expect(slot.height / slot.width).toBeLessThanOrEqual(1.25)
    }
  })

  it('aligns both photos even if only one of them has a caption', () => {
    const { photos } = layoutBriefCard({
      title: 'Fern study',
      images: [{ url: '/images/fern.png', note: 'Shape' }, { url: '/images/fronds.png' }],
    })
    const [first, second] = photos.slots
    expect(first.imageHeight).toBeLessThan(first.height)
    expect(first.imageHeight).toBe(second.imageHeight)
  })

  it('fits placement, readable tags and a truthful overflow badge in two rows', () => {
    const measureText = (text, _font, size) => text.length * size * 0.6
    const { pills, pillsBox, description } = layoutBriefCard({
      title: 'Fern study',
      placement: 'inner forearm',
      description: 'Keep the fronds soft.',
      tags: ['dark-illustrative', 'fine-line', 'blackwork', 'surrealism', 'dark-fantasy',
        'realism', ...Array.from({ length: 9 }, (_, i) => `extra imported style ${i + 1}`)],
    }, { measureText })

    expect(pills[0]).toMatchObject({ label: 'INNER FOREARM', kind: 'placement' })
    expect(new Set(pills.map((p) => p.y)).size).toBe(2)
    const visibleTags = pills.filter((p) => p.kind === 'tag')
    expect(visibleTags.length).toBeGreaterThan(0)
    expect(pills.at(-1).label).toBe(`+${15 - visibleTags.length}`)
    for (const pill of pills) {
      expect(pill.fontSize).toBeGreaterThanOrEqual(26)
      expect(pill.x + pill.width).toBeLessThanOrEqual(pillsBox.x + pillsBox.width)
      expect(pill.y + pill.height).toBeLessThan(description.box.y)
    }
  })

  it('ellipsizes oversized placement labels within the pill', () => {
    const measureText = (text, _font, size) => text.length * size * 0.6
    const { pills } = layoutBriefCard({
      placement: 'wrapping from the front of the shoulder round to the inside of the upper arm',
      tags: ['fine-line'],
    }, { measureText })
    expect(pills[0].label).toMatch(/…$/)
    expect(measureText(pills[0].label, '', pills[0].fontSize)).toBeLessThan(pills[0].width)
    expect(pills[1].label).toBe('FINE-LINE')
  })

  it('keeps a short style visible when the preceding style is too wide to fit beside the count', () => {
    const measureText = (text, _font, size) => text.length * size * 0.6
    const { pills } = layoutBriefCard({
      placement: 'Shoulder '.repeat(12).trim(),
      tags: ['Decorative botanical '.repeat(8).trim(), 'fine-line'],
    }, { measureText })
    expect(pills.map((pill) => pill.kind)).toEqual(['placement', 'tag', 'overflow'])
    expect(pills[1].label).toBe('FINE-LINE')
    expect(pills[2].label).toBe('+1')
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
        images: ['/images/demo/1.png'],
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

  it('counts omitted local references consistently before and after the four rendered photos', async () => {
    const broken = '/unreadable.png'
    const photos = ['/first.png', '/second.png', '/third.png', '/fourth.png']
    for (const images of [[broken, ...photos], [...photos, broken]]) {
      const result = await collectBriefCardPhotos(images, {
        loadImage: async (src) => src.endsWith(broken) ? null : { naturalWidth: 400, naturalHeight: 400 },
      })
      expect(result.photos).toHaveLength(4)
      expect(result.overflowCount).toBe(1)
    }
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
      const workingCanvas = {
        width: 0,
        height: 0,
        getContext: () => fakeCtx,
        toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })),
      }
      await exportBriefCardImage(
        { title: 'Font wait check', images: [] },
        { createCanvas: () => workingCanvas, download, nav: {} },
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

describe('brief card review fixes (#198)', () => {
  function makeFakeCtx() {
    return {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: 'top',
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
      measureText: (t) => ({ width: t.length * 12 }),
    }
  }

  it('falls back to download when share is refused (iOS activation expired)', async () => {
    const blob = new Blob(['png'], { type: 'image/png' })
    const download = vi.fn()
    const share = vi.fn(async () => {
      throw Object.assign(new Error('Activation expired'), { name: 'NotAllowedError' })
    })
    const result = await shareOrDownloadBriefCard(blob, 'sable-brief-x.png', {
      nav: { canShare: () => true, share },
      download,
    })
    expect(result.method).toBe('download')
    expect(download).toHaveBeenCalledWith(blob, 'sable-brief-x.png')
  })

  it('rejects instead of exporting a 1×1 placeholder when the canvas has no 2D context', async () => {
    const download = vi.fn()
    const noContextCanvas = { width: 0, height: 0, getContext: () => null, toBlob: vi.fn() }
    await expect(
      exportBriefCardImage(
        { title: 'No context', images: [] },
        { createCanvas: () => noContextCanvas, download, nav: {} },
      ),
    ).rejects.toThrow(/canvas/i)
    expect(download).not.toHaveBeenCalled()
  })

  it('explicitly loads the card font faces before measuring', async () => {
    const origFonts = document.fonts
    const loaded = []
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { ready: Promise.resolve(), load: vi.fn(async (spec) => { loaded.push(spec); return [] }) },
    })
    try {
      const ctx = makeFakeCtx()
      const canvas = {
        width: 0, height: 0, getContext: () => ctx,
        toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })),
      }
      await exportBriefCardImage(
        { title: 'Fonts', images: [] },
        { createCanvas: () => canvas, download: vi.fn(), nav: {} },
      )
      expect(loaded.some((s) => /600 .*Playfair Display/.test(s))).toBe(true)
      expect(loaded.some((s) => /DM Sans/.test(s))).toBe(true)
      expect(loaded.some((s) => /DM Mono/.test(s))).toBe(true)
    } finally {
      Object.defineProperty(document, 'fonts', { configurable: true, value: origFonts })
    }
  })

  it('keeps the skipped-web-images notice off the exported card', () => {
    const ctx = makeFakeCtx()
    const canvas = { width: 0, height: 0, getContext: () => ctx }
    const layout = layoutBriefCard(
      { title: 'Notice', images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'] },
      { skippedWebCount: 2 },
    )
    drawBriefCardOnCanvas(canvas, layout, [])
    const texts = ctx.fillText.mock.calls.map((c) => c[0])
    expect(texts.some((t) => /not included/i.test(t))).toBe(false)
  })

  it('draws notes beneath their own decoded photos and counts only the references beyond the limit', async () => {
    const ctx = makeFakeCtx()
    const canvas = {
      getContext: () => ctx,
      toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })),
    }
    const images = [
      { url: 'https://example.com/external.jpg', note: 'External note' },
      { url: '/unreadable.png', note: 'Unreadable note' },
      { url: '/first.png', note: 'Use this silhouette' },
      { url: '/second.png', note: 'Soft shading '.repeat(14) },
      { url: '/third.png', note: '   ' },
      { url: '/fourth.png', note: 'Keep the negative space' },
      { url: '/fifth.png', note: 'Not on card' },
      { url: '/sixth.png' },
    ]
    const result = await exportBriefCardImage({ title: 'Fern study', images }, {
      createCanvas: () => canvas, download: () => {}, nav: {},
      loadImage: async (src) => src.endsWith('/unreadable.png') ? null : { naturalWidth: 400, naturalHeight: 400 },
    })
    expect(result.photoCount).toBe(4)
    expect(result.skippedWebCount).toBe(1)
    const texts = ctx.fillText.mock.calls.map(([text]) => text)
    expect(texts).toContain('+3 more references')
    expect(texts).toContain('Keep the negative space')
    expect(texts).not.toContain('External note')
    expect(texts).not.toContain('Unreadable note')
    expect(texts).not.toContain('Not on card')
    const firstPhoto = ctx.drawImage.mock.calls[0]
    const firstCaption = ctx.fillText.mock.calls.find(([text]) => text === 'Use this silhouette')
    expect(firstCaption).toBeDefined()
    expect(firstCaption[1]).toBeGreaterThan(firstPhoto[5])
    expect(firstCaption[2]).toBeGreaterThanOrEqual(firstPhoto[6] + firstPhoto[8])
    const [, , , , , photoX, photoY, photoW, photoH] = ctx.drawImage.mock.calls[1]
    const longCaption = ctx.fillText.mock.calls
      .filter(([, x, y]) => x >= photoX && x < photoX + photoW &&
        y >= photoY + photoH && y < result.layout.photos.slots[2].y)
      .map(([text]) => text)
    expect(longCaption).toHaveLength(2)
    expect(longCaption[0]).toMatch(/^Soft shading/)
    expect(longCaption.at(-1)).toMatch(/…$/)
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

    // jsdom has no 2D canvas; stub one so the export succeeds rather than erroring.
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
      render(
        <MemoryRouter initialEntries={['/brief']}>
          <Brief ideas={ideas} setIdeas={vi.fn()} artists={[]} boards={[]} setBoards={vi.fn()} />
        </MemoryRouter>,
      )
      fireEvent.click(screen.getByText('Botanical forearm'))
      const shareBtn = screen.getByRole('button', { name: /share as image/i })
      await waitFor(() => expect(shareBtn).toBeEnabled())
      fireEvent.click(shareBtn)
      await waitFor(() => {
        expect(screen.getByText(/2 web images not included/i)).toBeInTheDocument()
      })
      const receipt = screen.getByRole('button', { name: /download (started|requested)/i })
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
