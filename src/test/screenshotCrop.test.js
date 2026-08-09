import { describe, expect, it } from 'vitest'
import { parseArtworkBox, cropRect, dataUrlToFile } from '../data/screenshotCrop'

describe('parseArtworkBox', () => {
  it('reads four 0-1000 integers as a normalised rectangle', () => {
    expect(parseArtworkBox('0,250,1000,750')).toEqual({ x: 0, y: 0.25, w: 1, h: 0.5 })
  })

  it('accepts whitespace and stray brackets the model may add', () => {
    expect(parseArtworkBox(' [100, 200, 900, 800] ')).toEqual({ x: 0.1, y: 0.2, w: 0.8, h: 0.6 })
  })

  it('clamps values that stray outside the coordinate space', () => {
    expect(parseArtworkBox('-50,-50,1200,1200')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })

  it('is null for anything that is not four numbers', () => {
    for (const bad of ['', '-', 'x,y,z,w', '100,200,900', 'the tattoo is centred', null, undefined]) {
      expect(parseArtworkBox(bad)).toBeNull()
    }
  })

  it('is null for an inverted or empty rectangle', () => {
    expect(parseArtworkBox('900,200,100,800')).toBeNull()   // x1 < x0
    expect(parseArtworkBox('100,800,900,200')).toBeNull()   // y1 < y0
    expect(parseArtworkBox('500,500,500,500')).toBeNull()   // zero area
  })

  // A sliver is far more likely to be a misread than a real crop, and cropping
  // to it would throw away the artwork entirely.
  it('is null for a box too small to be a real crop', () => {
    expect(parseArtworkBox('0,0,80,1000')).toBeNull()       // 8% wide
    expect(parseArtworkBox('0,0,1000,80')).toBeNull()       // 8% tall
  })

  it('keeps a box that covers most of the image', () => {
    expect(parseArtworkBox('0,0,1000,1000')).toEqual({ x: 0, y: 0, w: 1, h: 1 })
  })
})

describe('cropRect', () => {
  it('converts a normalised box to pixels', () => {
    expect(cropRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 800, 1200))
      .toEqual({ sx: 200, sy: 600, sw: 400, sh: 300 })
  })

  it('never runs past the edges of the image', () => {
    const r = cropRect({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 100, 100)

    expect(r.sx + r.sw).toBeLessThanOrEqual(100)
    expect(r.sy + r.sh).toBeLessThanOrEqual(100)
  })

  it('always yields at least one pixel', () => {
    const r = cropRect({ x: 0, y: 0, w: 0.0001, h: 0.0001 }, 10, 10)

    expect(r.sw).toBeGreaterThanOrEqual(1)
    expect(r.sh).toBeGreaterThanOrEqual(1)
  })

  it('is null without a usable box or size', () => {
    expect(cropRect(null, 100, 100)).toBeNull()
    expect(cropRect({ x: 0, y: 0, w: 1, h: 1 }, 0, 100)).toBeNull()
  })
})

describe('dataUrlToFile', () => {
  it('round-trips a data URL into a File of the same type', async () => {
    // 1x1 transparent GIF.
    const url = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    const file = dataUrlToFile(url, 'crop.gif')

    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/gif')
    expect(file.name).toBe('crop.gif')
    expect(file.size).toBeGreaterThan(0)
  })

  it('is null for something that is not a base64 data URL', () => {
    expect(dataUrlToFile('https://example.com/a.png', 'x.png')).toBeNull()
    expect(dataUrlToFile('', 'x.png')).toBeNull()
  })
})
