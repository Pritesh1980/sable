import { describe, it, expect, vi } from 'vitest'
import * as refs from '../data/referenceImages'
import { ideasCodec } from '../data/imageCodec'

vi.mock('../data/imageStaging', () => ({
  stageInlineOnce: async () => 'user/new/ideas/photo.png',
}))

describe('reference occurrence edits', () => {
  const crop = { x: 1, y: 0, zoom: 2 }
  const images = [
    { key: 'user/u/a.png', note: 'Shape', briefCrop: crop },
    { key: 'user/u/a.png', note: 'Shading' },
    { url: '/c.png', note: '' }, { url: '/d.png', note: '' }, { url: '/e.png', note: 'Cover' },
  ]
  it('moves the chosen occurrence without changing originals or notes', () => {
    const moved = refs.moveReferenceImage(images, 4, 0)
    expect(moved.map((image) => image.note)).toEqual(['Cover', 'Shape', 'Shading', '', ''])
    expect(moved[1]).toEqual({ key: 'user/u/a.png', note: 'Shape', briefCrop: crop })
    expect(images[0].note).toBe('Shape')
    expect(refs.moveReferenceImage(images, -1, 0)).toEqual(images)
    expect(refs.moveReferenceImage(images, 0, 9)).toEqual(images)
  })
  it('changes only one duplicate occurrence and resets only its crop', () => {
    const noted = refs.setReferenceNote(images, 1, 'Fine shading')
    const cropped = refs.setReferenceCrop(noted, 1, { x: 0, y: 1, zoom: 3 })
    expect(cropped[0]).toEqual(images[0])
    expect(cropped[1]).toEqual({ key: 'user/u/a.png', note: 'Fine shading', briefCrop: { x: 0, y: 1, zoom: 3 } })
    expect(refs.setReferenceCrop(cropped, 1, null)[1]).toEqual({ key: 'user/u/a.png', note: 'Fine shading' })
  })
  it('clamps finite crops and does not add metadata to legacy references', () => {
    expect(refs.normalizeBriefCrop({ x: 5, y: -1, zoom: 8 })).toEqual({ x: 1, y: 0, zoom: 3 })
    expect(refs.normalizeBriefCrop({ x: NaN, y: Infinity, zoom: '2' })).toEqual({ x: 0.5, y: 0.5, zoom: 1 })
    expect(refs.normalizeReferenceImages(['/a.png', { key: 'user/u/a', url: 'blob:old', note: 'n', briefCrop: crop }]))
      .toEqual([{ url: '/a.png', note: '' }, { key: 'user/u/a', note: 'n', briefCrop: crop }])
  })
  it('preserves crops in canonical storage and inline migration', async () => {
    const rows = [{ id: 'i', images: [{ url: 'data:image/png;base64,QUJD', note: 'n', briefCrop: crop }] }]
    expect(ideasCodec.toCanonical(rows)[0].images[0].briefCrop).toEqual(crop)
    const uploaded = await ideasCodec.ensureUploaded(rows, { userId: 'new' })
    expect(uploaded.value[0].images).toEqual([{ key: 'user/new/ideas/photo.png', note: 'n', briefCrop: crop }])
  })
})
