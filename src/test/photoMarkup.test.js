import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  MAX_PHOTO_MARKS,
  MAX_MARK_LABEL_LENGTH,
  normalizePhotoMark,
  normalizePhotoMarkup,
  buildMarkFromPoints,
  createDefaultMark,
  createMarkupHistory,
  pushMarkupHistory,
  undoMarkupHistory,
  redoMarkupHistory,
  projectPhotoMarkToSlot,
} from '../data/photoMarkup'
import {
  normalizeReferenceImages,
  referenceOccurrenceIdentity,
  moveReferenceImage,
  setReferenceCrop,
  setReferenceNote,
  setReferenceMarkup,
  setReferenceMarkupOnCard,
} from '../data/referenceImages'
import { setImageNote } from '../data/planning'
import { ideasCodec } from '../data/imageCodec'
import { registerBlobUrl, clearBlobUrls } from '../data/blobUrls'
import { createBackupWithImages, parseBackup, restoreBackupImages } from '../data/export'
import { createPortableBackup } from '../data/portableBackup'
import { computeBriefCardCrop, collectBriefCardPhotos, prepareBriefCardImage } from '../data/briefCard'

vi.mock('../data/imageStaging', async (importOriginal) => ({
  ...(await importOriginal()),
  stageInlineOnce: async () => 'user/u2/ideas/i1/restored.png',
  stageImage: async () => ({ key: 'user/u2/ideas/i1/restored.png', url: 'blob:http://localhost/restored', failed: false }),
}))

describe('photoMarkup normalization and bounds', () => {
  it('normalizes circles and arrows, clamps out-of-range coordinates, and strips unsafe extra fields', () => {
    const dirty = [
      {
        id: 'm1',
        kind: 'circle',
        x: 1.4,
        y: -0.2,
        r: 0.9,
        label: '  Keep this leaf vein   ',
        blobUrl: 'blob:http://localhost/should-strip',
      },
      {
        id: 'm2',
        kind: 'arrow',
        x: -0.5,
        y: 0.25,
        toX: 1.2,
        toY: 0.75,
        label: 'A'.repeat(MAX_MARK_LABEL_LENGTH + 20),
      },
      { kind: 'circle', x: 0.5, y: 0.5, r: 'bad', label: '   ' },
      { kind: 'triangle', x: 0.2, y: 0.2 },
      { kind: 'circle', x: Number.NaN, y: 0.5 },
      null,
    ]

    const normalized = normalizePhotoMarkup(dirty)
    expect(normalized).toEqual([
      { id: 'm1', kind: 'circle', x: 1, y: 0, r: 0.48, label: 'Keep this leaf vein' },
      { id: 'm2', kind: 'arrow', x: 0, y: 0.25, toX: 1, toY: 0.75, label: 'A'.repeat(MAX_MARK_LABEL_LENGTH) },
      { id: 'mark-3', kind: 'circle', x: 0.5, y: 0.5, r: 0.12 },
    ])
    expect(normalizePhotoMarkup([])).toBeUndefined()
    expect(normalizePhotoMarkup(null)).toBeUndefined()
    expect(normalizePhotoMark({ kind: 'arrow', x: 0.1, y: 0.2 })).toBeNull()
  })

  it('caps mark count at MAX_PHOTO_MARKS', () => {
    const many = Array.from({ length: MAX_PHOTO_MARKS + 5 }, (_, i) => ({
      id: `m-${i}`,
      kind: 'circle',
      x: 0.5,
      y: 0.5,
      r: 0.1,
    }))
    expect(normalizePhotoMarkup(many)).toHaveLength(MAX_PHOTO_MARKS)
  })

  it('builds visible marks from drags, single taps, and keyboard placement', () => {
    const draggedCircle = buildMarkFromPoints('circle', { x: 0.4, y: 0.5 }, { x: 0.55, y: 0.5 }, { id: 'c1' })
    expect(draggedCircle).toEqual({ id: 'c1', kind: 'circle', x: 0.4, y: 0.5, r: 0.15 })

    const tappedCircle = buildMarkFromPoints('circle', { x: 0.3, y: 0.4 }, { x: 0.302, y: 0.402 }, { id: 'c2' })
    expect(tappedCircle).toEqual({ id: 'c2', kind: 'circle', x: 0.3, y: 0.4, r: 0.12 })

    const tappedArrow = buildMarkFromPoints('arrow', { x: 0.6, y: 0.6 }, { x: 0.6, y: 0.6 }, { id: 'a1' })
    expect(tappedArrow.toX).toBe(0.6)
    expect(tappedArrow.toY).toBe(0.6)
    expect(Math.hypot(tappedArrow.toX - tappedArrow.x, tappedArrow.toY - tappedArrow.y)).toBeGreaterThan(0.1)

    const kbd1 = createDefaultMark('circle', [])
    const kbd2 = createDefaultMark('arrow', [kbd1])
    expect(kbd1.id).not.toBe(kbd2.id)
    expect(kbd1.x).not.toBe(kbd2.x)
  })

  it('supports multi-step undo and redo without mutating initial marks', () => {
    const initial = [{ id: 'm1', kind: 'circle', x: 0.2, y: 0.3, r: 0.1 }]
    let history = createMarkupHistory(initial)
    history = pushMarkupHistory(history, [...history.present, { id: 'm2', kind: 'arrow', x: 0.2, y: 0.3, toX: 0.6, toY: 0.7 }])
    expect(history.present).toHaveLength(2)

    history = pushMarkupHistory(history, [
      history.present[0],
      { ...history.present[1], label: 'Tapered tip' },
    ])
    expect(history.present[1].label).toBe('Tapered tip')

    history = undoMarkupHistory(history)
    expect(history.present).toHaveLength(2)
    expect(history.present[1].label).toBeUndefined()

    history = undoMarkupHistory(history)
    expect(history.present).toEqual(initial)

    history = redoMarkupHistory(history)
    expect(history.present).toHaveLength(2)
    expect(initial).toEqual([{ id: 'm1', kind: 'circle', x: 0.2, y: 0.3, r: 0.1 }])
  })
})

describe('reference attachment, identity isolation, reordering, and crops', () => {
  const markA = [{ id: 'a', kind: 'circle', x: 0.25, y: 0.25, r: 0.12, label: 'Shoulder curve' }]
  const markB = [{ id: 'b', kind: 'arrow', x: 0.7, y: 0.7, toX: 0.85, toY: 0.85, label: 'Fine dotwork' }]

  it('keeps markup attached to its exact reference occurrence across notes, crops, and reordering', () => {
    const images = [
      { key: 'user/u1/ideas/shared.png', note: 'First copy' },
      { key: 'user/u1/ideas/shared.png', note: 'Second copy', briefCrop: { x: 1, y: 0, zoom: 2 } },
      { url: '/images/demo/vesper_noctis/1.svg', note: 'Third' },
    ]

    const marked = setReferenceMarkup(images, 1, markB, { includeMarkupInBrief: false })
    expect(marked[0]).toEqual({ key: 'user/u1/ideas/shared.png', note: 'First copy' })
    expect(marked[1]).toEqual({
      key: 'user/u1/ideas/shared.png',
      note: 'Second copy',
      briefCrop: { x: 1, y: 0, zoom: 2 },
      markup: markB,
      includeMarkupInBrief: false,
    })

    // Toggling card inclusion and editing note/crop keep markup intact and key untouched
    const included = setReferenceMarkupOnCard(marked, 1, true)
    expect(included[1].includeMarkupInBrief).toBeUndefined()
    expect(included[1].markup).toEqual(markB)

    const renoted = setImageNote(setReferenceNote(included, 1, 'Edited shading'), included[0], 'Updated first')
    expect(renoted[1].markup).toEqual(markB)
    expect(renoted[0].markup).toBeUndefined()

    const recropped = setReferenceCrop(renoted, 1, { x: 0.5, y: 0.5, zoom: 1.5 })
    expect(recropped[1].markup).toEqual(markB)
    expect(recropped[1].key).toBe('user/u1/ideas/shared.png')

    const reordered = moveReferenceImage(recropped, 1, 0)
    expect(reordered[0].markup).toEqual(markB)
    expect(reordered[0].briefCrop).toEqual({ x: 0.5, y: 0.5, zoom: 1.5 })
    expect(reordered[1].markup).toBeUndefined()
  })

  it('distinguishes identical image refs that differ only by markup or export toggle', () => {
    const base = { key: 'user/u1/ideas/shared.png', note: 'Same note' }
    const annotated = { ...base, markup: markA }
    const hiddenOnCard = { ...annotated, includeMarkupInBrief: false }

    expect(referenceOccurrenceIdentity(base)).not.toBe(referenceOccurrenceIdentity(annotated))
    expect(referenceOccurrenceIdentity(annotated)).not.toBe(referenceOccurrenceIdentity(hiddenOnCard))
    expect(normalizeReferenceImages([{ key: 'user/u1/ideas/x.png', url: 'blob:http://localhost/tmp', markup: markA }]))
      .toEqual([{ key: 'user/u1/ideas/x.png', note: '', markup: markA }])
  })
})

describe('sync codec and backup/restore preservation', () => {
  beforeEach(() => {
    clearBlobUrls()
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      blob: async () => new Blob(['PNG_BYTES'], { type: 'image/png' }),
    })))
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const markup = [{ id: 'm1', kind: 'circle', x: 0.3, y: 0.4, r: 0.14, label: 'Keep negative space' }]

  it('preserves markup across ideasCodec normalization and inline staging', async () => {
    const idea = {
      id: 'i1',
      images: [{ url: 'data:image/png;base64,QUJD', note: 'Sketch', briefCrop: { x: 0, y: 1, zoom: 2 }, markup, includeMarkupInBrief: false }],
    }
    expect(ideasCodec.toCanonical([idea])[0].images[0].markup).toEqual(markup)
    const { value } = await ideasCodec.ensureUploaded([idea], { userId: 'u2' })
    expect(value[0].images[0]).toEqual({
      key: 'user/u2/ideas/i1/restored.png',
      note: 'Sketch',
      briefCrop: { x: 0, y: 1, zoom: 2 },
      markup,
      includeMarkupInBrief: false,
    })
  })

  it('survives v2 backup and restore without altering image identity', async () => {
    registerBlobUrl('user/u1/ideas/i1/1.png', 'blob:http://localhost/1')
    const ideas = [{
      id: 'i1',
      title: 'Back study',
      images: [{ key: 'user/u1/ideas/i1/1.png', note: 'Original note', briefCrop: { x: 1, y: 0, zoom: 2 }, markup, includeMarkupInBrief: false }],
    }]

    const { backup, skipped } = await createBackupWithImages({ ideas })
    expect(skipped).toBe(0)
    const parsed = parseBackup(JSON.stringify(backup))
    expect(parsed.ideas[0].images[0].markup).toEqual(markup)
    expect(parsed.ideas[0].images[0].includeMarkupInBrief).toBe(false)

    const { data, failed } = await restoreBackupImages(parsed, { userId: 'u2' })
    expect(failed).toBe(0)
    expect(data.ideas[0].images[0]).toEqual({
      key: 'user/u2/ideas/i1/restored.png',
      note: 'Original note',
      briefCrop: { x: 1, y: 0, zoom: 2 },
      markup,
      includeMarkupInBrief: false,
    })
  })

  it('preserves markup, includeMarkupInBrief, and briefCrop in portable backups', async () => {
    const bytes = 'data:image/jpeg;base64,aW1hZ2U='
    const backup = await createPortableBackup({
      ideas: [{
        id: 'i1',
        images: [{ key: 'user/A/ideas/i1/1.jpg', note: '花 — keep curve', briefCrop: { x: 0.25, y: 0.75, zoom: 1.5 }, markup, includeMarkupInBrief: false }],
      }],
    }, { ownerId: 'A', blobs: { getUrl: async () => bytes } })

    const restored = parseBackup(JSON.stringify(backup))
    expect(restored.ideas[0].images).toEqual([{
      url: bytes,
      note: '花 — keep curve',
      briefCrop: { x: 0.25, y: 0.75, zoom: 1.5 },
      markup,
      includeMarkupInBrief: false,
    }])
  })
})

describe('brief card projection and export rendering with crops', () => {
  it('projects marks accurately across zoomed/panned crops and hides out-of-frame marks', () => {
    const iw = 1200
    const ih = 800
    const slot = { x: 100, y: 200, width: 400, height: 400 }
    const crop = { x: 1, y: 0, zoom: 2 } // Top-right square zoom: scale = 400/800 * 2 = 1 -> sw=400, sh=400, sx=800, sy=0
    const cropBox = computeBriefCardCrop(iw, ih, slot.width, slot.height, crop)
    expect(cropBox).toEqual({ sx: 800, sy: 0, sw: 400, sh: 400 })

    const visibleCircle = projectPhotoMarkToSlot(
      { id: 'v', kind: 'circle', x: 0.75, y: 0.25, r: 0.1, label: 'Leaf' },
      { iw, ih, ...cropBox, slot },
    )
    // x=0.75*1200=900 -> (900-800)/400 * 400 + 100 = 200; y=0.25*800=200 -> 200 + 200 = 400
    expect(visibleCircle.cx).toBeCloseTo(200)
    expect(visibleCircle.cy).toBeCloseTo(400)
    expect(visibleCircle.r).toBeCloseTo(80)
    expect(visibleCircle.visible).toBe(true)

    const offCropCircle = projectPhotoMarkToSlot(
      { id: 'off', kind: 'circle', x: 0.1, y: 0.9, r: 0.05, label: 'Hidden' },
      { iw, ih, ...cropBox, slot },
    )
    expect(offCropCircle.visible).toBe(false)
  })

  it('renders markup on exported Brief card when enabled and keeps original clean when disabled', async () => {
    const makeCtx = () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textBaseline: 'top',
      fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), drawImage: vi.fn(),
      save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
      moveTo: vi.fn(), lineTo: vi.fn(), arc: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
      measureText: (t) => ({ width: t.length * 10 }),
    })

    const loadImage = async () => ({ naturalWidth: 800, naturalHeight: 600 })
    const markup = [
      { id: 'm1', kind: 'circle', x: 0.5, y: 0.5, r: 0.12, label: 'Line weight' },
      { id: 'm2', kind: 'arrow', x: 0.2, y: 0.2, toX: 0.4, toY: 0.4, label: 'Stem' },
    ]

    const selectedOn = await collectBriefCardPhotos([{ url: '/a.png', note: 'Study', markup }], { loadImage })
    expect(selectedOn.photos[0].markup).toEqual(markup)

    const ctxOn = makeCtx()
    await prepareBriefCardImage(
      { title: 'Botanical study', images: [{ url: '/a.png', note: 'Study', markup }] },
      {
        loadImage,
        createCanvas: () => ({ getContext: () => ctxOn, toBlob: (cb) => cb(new Blob(['on'], { type: 'image/png' })) }),
      },
    )
    expect(ctxOn.arc).toHaveBeenCalled()
    expect(ctxOn.fillText.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['Line weight', 'Stem']))

    const ctxOff = makeCtx()
    await prepareBriefCardImage(
      { title: 'Botanical study', images: [{ url: '/a.png', note: 'Study', markup, includeMarkupInBrief: false }] },
      {
        loadImage,
        createCanvas: () => ({ getContext: () => ctxOff, toBlob: (cb) => cb(new Blob(['off'], { type: 'image/png' })) }),
      },
    )
    expect(ctxOff.arc).not.toHaveBeenCalled()
    expect(ctxOff.fillText.mock.calls.map((c) => c[0])).not.toContain('Line weight')
  })
})
