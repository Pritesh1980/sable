import { describe, it, expect } from 'vitest'
import {
  circumferenceAt, designSizeCm, clampPlacement, pinchWidth, wrapShare,
  isDarkBackground, toInkPixels, healInkPixels, healedInkFloor, spreadSigmaPx, spreadInk, gaussianKernel, HEALED_SPREAD_MM, MIN_WIDTH_CM, MAX_WRAP, viewFrame, designYaw, WHOLE_ARM,
  snapshotPose, MAX_SNAPSHOT_TURN, formatCm, arcLabel, snapshotVariant,
} from '../data/placement3d'

const TABLE = [[0, 24], [10, 28], [20, 30], [31, 36]]
const ARM = { skinCm: [0, 31], perimeterCm: TABLE }

describe('circumferenceAt', () => {
  it('interpolates between the stations', () => {
    expect(circumferenceAt(TABLE, 5)).toBeCloseTo(26)
    expect(circumferenceAt(TABLE, 20)).toBe(30)
  })
  it('holds level past either end', () => {
    expect(circumferenceAt(TABLE, -4)).toBe(24)
    expect(circumferenceAt(TABLE, 99)).toBe(36)
  })
})

describe('designSizeCm', () => {
  it('takes its height from the image aspect', () => {
    expect(designSizeCm(12, 600, 760)).toEqual({ widthCm: 12, heightCm: 15.2 })
  })
})

describe('clampPlacement', () => {
  it('leaves a placement that fits alone', () => {
    const p = clampPlacement({ widthCm: 10, centreCm: 15, arcCm: 2 }, { ...ARM, aspect: 1 })
    expect(p).toEqual({ widthCm: 10, heightCm: 10, centreCm: 15, arcCm: 2 })
  })
  it('never goes below the minimum width', () => {
    expect(clampPlacement({ widthCm: 0.5, centreCm: 15 }, { ...ARM, aspect: 1 }).widthCm).toBe(MIN_WIDTH_CM)
  })
  it('caps the width at a share of the narrowest arm under the design', () => {
    const p = clampPlacement({ widthCm: 80, centreCm: 15 }, { ...ARM, aspect: 0.5 })
    expect(p.widthCm).toBeLessThanOrEqual(MAX_WRAP * circumferenceAt(TABLE, p.centreCm + p.heightCm / 2))
    expect(p.widthCm).toBeGreaterThan(20)
  })
  it('caps the height at the skin there is, keeping the aspect', () => {
    const p = clampPlacement({ widthCm: 20, centreCm: 15 }, { ...ARM, aspect: 2 })
    expect(p.heightCm).toBe(31)
    expect(p.widthCm).toBe(15.5)
  })
  it('slides the design back onto the skin', () => {
    expect(clampPlacement({ widthCm: 10, centreCm: 1 }, { ...ARM, aspect: 1 }).centreCm).toBe(5)
    expect(clampPlacement({ widthCm: 10, centreCm: 40 }, { ...ARM, aspect: 1 }).centreCm).toBe(26)
  })
  it('wraps the arc onto one turn of the arm', () => {
    const p = clampPlacement({ widthCm: 10, centreCm: 20, arcCm: 20 }, { ...ARM, aspect: 1 })
    expect(p.arcCm).toBeCloseTo(-10)
  })
})

describe('pinchWidth', () => {
  it('scales with the distance between the fingers', () => {
    expect(pinchWidth(12, 100, 150)).toBe(18)
  })
  it('ignores a degenerate start', () => {
    expect(pinchWidth(12, 0, 150)).toBe(12)
  })
})

describe('wrapShare', () => {
  it('is the share of the arm the design goes round at its centre', () => {
    expect(wrapShare({ widthCm: 15, centreCm: 20 }, TABLE)).toBe(0.5)
  })
})

const px = (...rgba) => new Uint8ClampedArray(rgba.flat())

describe('isDarkBackground', () => {
  it('reads the paper from the border', () => {
    const dark = [14, 13, 11, 255]
    const light = [250, 250, 250, 255]
    // 3x3: border dark, centre light
    expect(isDarkBackground(px(dark, dark, dark, dark, light, dark, dark, dark, dark), 3, 3)).toBe(true)
    expect(isDarkBackground(px(light, light, light, light, dark, light, light, light, light), 3, 3)).toBe(false)
  })
  it('treats a transparent border as paper', () => {
    const clear = [0, 0, 0, 0]
    expect(isDarkBackground(px(clear, clear, clear, clear), 2, 2)).toBe(false)
  })
})

describe('toInkPixels', () => {
  it('keeps dark ink on white paper as it is', () => {
    const out = toInkPixels(px([255, 255, 255, 255], [0, 0, 0, 255], [255, 255, 255, 255]), 3, 1)
    expect([...out.slice(0, 8)]).toEqual([255, 255, 255, 255, 0, 0, 0, 255])
  })
  it('flips light lines on a dark card, keeping hue', () => {
    const out = toInkPixels(px([10, 10, 10, 255], [240, 240, 240, 255], [200, 40, 40, 255], [10, 10, 10, 255]), 4, 1)
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 255]) // paper → bare skin, past the white point
    expect([...out.slice(4, 8)]).toEqual([17, 17, 17, 255]) // line → ink
    const [r, g, b] = out.slice(8, 11)
    expect(r).toBeGreaterThan(g) // red stays red
    expect(g).toBe(b)
  })
  it('turns transparency into bare skin', () => {
    const out = toInkPixels(px([0, 0, 0, 0], [0, 0, 0, 255]), 2, 1)
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 255])
  })
})

// Healed ink, ported from render-on-body.py so the phone view and the Blender
// renders agree: what a design looks like once it has settled under the skin.
const srgb = (v) => v / 255
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b

describe('healInkPixels', () => {
  it('leaves bare skin bare', () => {
    expect([...healInkPixels(px([255, 255, 255, 255]))]).toEqual([255, 255, 255, 255])
  })
  it('lets 2% of the skin back through solid black, in linear light', () => {
    const [r, g, b] = healInkPixels(px([0, 0, 0, 255]))
    expect(r).toBe(g)
    expect(g).toBe(b)
    expect(toLinear(srgb(r))).toBeCloseTo(0.02, 2)
  })
  it('fades coloured ink a quarter of the way to grey', () => {
    const [r, g, b] = healInkPixels(px([200, 40, 40, 255]))
    expect(r).toBeGreaterThan(g) // still red
    expect(g).toBeGreaterThan(40) // but less so
    expect(r).toBeLessThan(200)
    expect(g).toBe(b)
  })
})

describe('healedInkFloor', () => {
  const skin = [0.32, 0.18, 0.09] // a warm brown, linear
  it('is as dark as fresh black over this skin at the same strength', () => {
    expect(lum(healedInkFloor(skin, 0.92))).toBeCloseTo(lum(skin) * 0.08, 6)
  })
  it('is a cool blue-green black, not the skin darkened to brown', () => {
    const [r, g, b] = healedInkFloor(skin, 0.92)
    expect(b).toBeGreaterThan(r)
    expect(g).toBeGreaterThan(r)
  })
})

describe('spreadSigmaPx', () => {
  it('spreads a fixed distance of skin, so a bigger print blurs by fewer pixels', () => {
    expect(spreadSigmaPx(1024, 12)).toBeCloseTo((HEALED_SPREAD_MM / 10) * (1024 / 12), 9)
    expect(spreadSigmaPx(1024, 24)).toBeCloseTo(spreadSigmaPx(1024, 12) / 2, 9)
  })
  it('is no blur for a design with no size yet', () => {
    expect(spreadSigmaPx(1024, 0)).toBe(0)
  })
})

describe('gaussianKernel', () => {
  it('is no blur below a quarter of a pixel', () => {
    expect(gaussianKernel(0.2)).toEqual([1])
    expect(gaussianKernel(0)).toEqual([1])
  })
  it('reaches out to three sigma and sums to one', () => {
    const k = gaussianKernel(1.3)
    expect(k).toHaveLength(2 * Math.ceil(3.9) + 1)
    expect(k.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9)
  })
})

describe('spreadInk', () => {
  const W = [255, 255, 255, 255]
  const K = [0, 0, 0, 255]
  const grid = (w, h, at) => px(...Array.from({ length: w * h }, (_, i) => at(i % w, Math.floor(i / w))))
  const inkAt = (out, w, x, y) => 1 - toLinear(srgb(out[4 * (y * w + x)]))

  it('changes nothing when the spread is too small to see', () => {
    const image = grid(3, 1, (x) => (x === 1 ? K : W))
    expect([...spreadInk(image, 3, 1, 0.1)]).toEqual([...image])
  })
  it('spreads a dot into its neighbours, keeping the ink it had', () => {
    const image = grid(9, 9, (x, y) => (x === 4 && y === 4 ? K : W))
    const out = spreadInk(image, 9, 9, 1)
    expect(inkAt(out, 9, 4, 4)).toBeLessThan(1)
    expect(inkAt(out, 9, 5, 4)).toBeGreaterThan(0)
    expect(inkAt(out, 9, 5, 4)).toBeCloseTo(inkAt(out, 9, 4, 5), 6) // round, not streaked
    let total = 0
    for (let y = 0; y < 9; y += 1) for (let x = 0; x < 9; x += 1) total += inkAt(out, 9, x, y)
    // All of it, less what rounds away to bare skin in the faint tails.
    expect(total).toBeGreaterThan(0.9)
    expect(total).toBeLessThan(1.01)
  })
  it('fades ink at the border into the bare skin outside the image', () => {
    const out = spreadInk(grid(9, 9, () => K), 9, 9, 1)
    expect(out[0]).toBeGreaterThan(out[4 * (4 * 9 + 4)]) // corner lighter than middle
    expect(out[4 * (4 * 9 + 4)]).toBe(0) // the middle stays solid
  })
})

describe('viewFrame', () => {
  const placed = { widthCm: 12, heightCm: 15.2, centreCm: 17, arcCm: 0 }
  it('frames the design, not the limb: the tattoo fills most of the view', () => {
    const { focusCm, frameCm } = viewFrame(placed, 'design')
    expect(focusCm).toBe(17)
    expect(placed.heightCm / frameCm).toBeGreaterThan(0.6)
    expect(placed.heightCm / frameCm).toBeLessThan(0.8)
  })
  it('never closes in so far that the arm stops reading as an arm', () => {
    const tiny = viewFrame({ ...placed, widthCm: 3, heightCm: 3.8 }, 'design')
    expect(tiny.frameCm).toBe(14)
  })
  it('follows a wide design too', () => {
    const wide = viewFrame({ ...placed, widthCm: 24, heightCm: 8 }, 'design')
    expect(wide.frameCm).toBeGreaterThan(14)
  })
  it('never frames more than the whole arm', () => {
    expect(viewFrame({ ...placed, heightCm: 60 }, 'design')).toEqual(WHOLE_ARM)
  })
  it('steps back to the whole arm on request', () => {
    expect(viewFrame(placed, 'arm')).toEqual(WHOLE_ARM)
  })
})

describe('designYaw', () => {
  it('faces the camera square on when the design is on the outer arm', () => {
    expect(designYaw({ centreCm: 20, arcCm: 0 }, TABLE)).toBeCloseTo(0)
  })
  it('turns the arm so a design moved round it stays in view', () => {
    // 7.5 cm round a 30 cm arm is a quarter turn.
    expect(designYaw({ centreCm: 20, arcCm: 7.5 }, TABLE)).toBeCloseTo(-Math.PI / 2)
    expect(designYaw({ centreCm: 20, arcCm: -7.5 }, TABLE)).toBeCloseTo(Math.PI / 2)
  })
})

describe('snapshotPose', () => {
  const placed = { widthCm: 12, heightCm: 15.2, centreCm: 17, arcCm: 7.5 }
  it('frames the saved picture on the design, whatever the view was showing', () => {
    const pose = snapshotPose(placed, TABLE, 0)
    expect(pose).toMatchObject(viewFrame(placed, 'design'))
    expect(pose.frameCm).toBeLessThan(WHOLE_ARM.frameCm)
    expect(pose.yaw).toBeCloseTo(designYaw(placed, TABLE))
  })
  it('keeps a small turn of the arm, so the picture is the angle you chose', () => {
    expect(snapshotPose(placed, TABLE, 0.3).turned).toBeCloseTo(0.3)
    expect(snapshotPose(placed, TABLE, -0.25).turned).toBeCloseTo(-0.25)
  })
  it('never saves the back of the arm: a design turned away is brought round', () => {
    expect(snapshotPose(placed, TABLE, 2.5).turned).toBe(MAX_SNAPSHOT_TURN)
    expect(snapshotPose(placed, TABLE, -2.5).turned).toBe(-MAX_SNAPSHOT_TURN)
  })
  it('counts whole turns of the arm as no turn at all', () => {
    expect(snapshotPose(placed, TABLE, 4 * Math.PI + 0.2).turned).toBeCloseTo(0.2)
    expect(snapshotPose(placed, TABLE, -2 * Math.PI - 0.1).turned).toBeCloseTo(-0.1)
  })
})

describe('formatCm and arcLabel', () => {
  it('gives one decimal place', () => {
    expect(formatCm(12)).toBe('12.0 cm')
    expect(formatCm(10.44)).toBe('10.4 cm')
  })
  it('says which way round the arm in words', () => {
    expect(arcLabel(0)).toBe('outer arm')
    expect(arcLabel(4)).toBe('4.0 cm to the back')
    expect(arcLabel(-3)).toBe('3.0 cm to the front')
  })
})

describe('snapshotVariant', () => {
  const placed = { widthCm: 12, heightCm: 15.2, centreCm: 17, arcCm: 0 }
  it('titles the variant with the width, without a needless decimal', () => {
    expect(snapshotVariant('Moth line study', placed).title).toBe('On the arm, 12 cm')
    expect(snapshotVariant('Moth', { ...placed, widthCm: 10.4 }).title).toBe('On the arm, 10.4 cm')
  })
  it('notes what was placed, how big and where', () => {
    expect(snapshotVariant('Moth line study', placed).notes)
      .toBe('3D arm preview of Moth line study. 12.0 cm wide × 15.2 cm tall, centred 17.0 cm above the elbow, outer arm.')
    expect(snapshotVariant('Moth', { ...placed, arcCm: -3 }).notes).toContain('3.0 cm to the front.')
  })
  it('is saved like the live try-on: a preview made here, not by an AI provider', () => {
    expect(snapshotVariant('Moth', placed).provider).toBe('other')
  })
})
