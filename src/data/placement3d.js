// Pure maths for the 3D placement view (#195): where a design sits on the arm
// and how big it is, in centimetres of skin. No three.js here, so it is unit
// tested in jsdom; ArmPlacement3D turns these numbers into shader uniforms.
//
// The arm model (scripts/blender/export-arm-gltf.py) carries each vertex's
// place on the skin, so a placement is just three numbers:
//   widthCm   printed width, measured round the curve as a stencil lies
//   centreCm  height of the design's centre above the elbow joint
//   arcCm     how far round the arm from the outside line (0 = outer arm)

export const MIN_WIDTH_CM = 3
// A design may go at most this far round the arm: past it the two edges meet
// at the back and the seam shows.
export const MAX_WRAP = 0.9
export const DEFAULT_PLACEMENT = { widthCm: 12, centreCm: 17, arcCm: 0 }

export function circumferenceAt(table, yCm) {
  if (yCm <= table[0][0]) return table[0][1]
  for (let i = 1; i < table.length; i += 1) {
    const [y1, c1] = table[i]
    if (yCm <= y1) {
      const [y0, c0] = table[i - 1]
      return c0 + ((c1 - c0) * (yCm - y0)) / (y1 - y0)
    }
  }
  return table[table.length - 1][1]
}

const round1 = (n) => Math.round(n * 10) / 10
const round2 = (n) => Math.round(n * 100) / 100

export function designSizeCm(widthCm, pxWidth, pxHeight) {
  return { widthCm, heightCm: round2((widthCm * pxHeight) / pxWidth) }
}

// aspect = image height / width.
export function clampPlacement({ widthCm, centreCm, arcCm = 0 }, { skinCm, perimeterCm, aspect }) {
  const [lo, hi] = skinCm
  const clampCentre = (h) => Math.min(hi - h / 2, Math.max(lo + h / 2, centreCm))
  let width = Math.max(MIN_WIDTH_CM, widthCm)
  width = Math.min(width, (hi - lo) / aspect)
  // The arm tapers, so the cap depends on where the design ends up: narrow it
  // until it fits the thinnest ring it covers. Two passes settle it.
  for (let pass = 0; pass < 2; pass += 1) {
    const height = width * aspect
    const centre = clampCentre(height)
    const thinnest = Math.min(
      circumferenceAt(perimeterCm, centre - height / 2),
      circumferenceAt(perimeterCm, centre + height / 2),
    )
    width = Math.min(width, MAX_WRAP * thinnest)
  }
  width = round2(width)
  const heightCm = round2(width * aspect)
  const centre = round2(clampCentre(heightCm))
  const turn = circumferenceAt(perimeterCm, centre)
  const arc = arcCm - turn * Math.round(arcCm / turn)
  return { widthCm: width, heightCm, centreCm: centre, arcCm: round2(arc) }
}

export function pinchWidth(startWidthCm, startDistance, distance) {
  if (!(startDistance > 0)) return startWidthCm
  return round1((startWidthCm * distance) / startDistance)
}

export function wrapShare({ widthCm, centreCm }, perimeterCm) {
  return round2(widthCm / circumferenceAt(perimeterCm, centreCm))
}

// ---- What the camera looks at ----------------------------------------------
// Sable is about the tattoo, so the view is framed on the design and the arm
// is its setting. 'arm' steps back to the whole limb, to judge scale.

// The exported model spans about 54 cm, centred 10.5 cm above the elbow.
export const WHOLE_ARM = { focusCm: 10.5, frameCm: 54 }
const CLOSEST_FRAME_CM = 14
const FRAME_MARGIN = 1.4

// `focusCm`: the height above the elbow at the middle of the view.
// `frameCm`: how much arm fits in the view, top to bottom.
export function viewFrame({ widthCm, heightCm, centreCm }, mode = 'design') {
  if (mode === 'arm') return WHOLE_ARM
  // A wide design wraps away round the arm, so its width needs less room.
  const frameCm = Math.max(CLOSEST_FRAME_CM, FRAME_MARGIN * Math.max(heightCm, 0.6 * widthCm))
  return frameCm >= WHOLE_ARM.frameCm ? WHOLE_ARM : { focusCm: centreCm, frameCm: round2(frameCm) }
}

// How far to turn the arm (radians about its length) so the design's centre
// faces the camera. Arc runs positive towards the back of the arm.
export function designYaw({ centreCm, arcCm }, perimeterCm) {
  return (-2 * Math.PI * arcCm) / circumferenceAt(perimeterCm, centreCm)
}

// ---- The saved picture ------------------------------------------------------
// A snapshot is kept as a concept variant, so it is always framed on the
// design: close up even if the view had stepped back to the whole arm, and
// with the ink facing the camera even if the arm had been turned away.

// The most the arm may be turned from square-on in a saved picture (radians):
// enough to show the design wrapping, never so far that it slides out of view.
export const MAX_SNAPSHOT_TURN = 0.6

// `turned` is the user's own drag, in radians, on top of the design's yaw.
export function snapshotPose(placement, perimeterCm, turned = 0) {
  const whole = 2 * Math.PI
  const turn = turned - whole * Math.round(turned / whole) // shortest way round
  return {
    ...viewFrame(placement, 'design'),
    yaw: designYaw(placement, perimeterCm),
    turned: Math.min(MAX_SNAPSHOT_TURN, Math.max(-MAX_SNAPSHOT_TURN, turn)),
  }
}

export const formatCm = (n) => `${n.toFixed(1)} cm`

export function arcLabel(arcCm) {
  if (arcCm === 0) return 'outer arm'
  return `${formatCm(Math.abs(arcCm))} ${arcCm > 0 ? 'to the back' : 'to the front'}`
}

// What a saved snapshot is called, labelled the way the live try-on labels
// its own: made on this device, so the provider is 'other', not an AI.
export function snapshotVariant(label, { widthCm, heightCm, centreCm, arcCm }) {
  return {
    provider: 'other',
    title: `On the arm, ${round1(widthCm)} cm`,
    notes: `3D arm preview of ${label}. ${formatCm(widthCm)} wide × ${formatCm(heightCm)} tall, `
      + `centred ${formatCm(centreCm)} above the elbow, ${arcLabel(arcCm)}.`,
  }
}

// ---- Design image → ink ---------------------------------------------------
// The shader multiplies skin by the texture, like ink: white is bare skin.
// Sable's concept cards are the other way round (light lines on near-black),
// so a dark paper is flipped first. Same rule as render-on-body.py.

// Paper at or above this level counts as bare skin, so an off-white scan or a
// flipped near-black card doesn't tint the arm with a visible rectangle.
export const WHITE_POINT = 0.9

const luminance = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255

export function isDarkBackground(pixels, width, height) {
  let sum = 0
  let count = 0
  const add = (x, y) => {
    const i = 4 * (y * width + x)
    const a = pixels[i + 3] / 255
    // Transparent counts as white paper.
    sum += a * luminance(pixels[i], pixels[i + 1], pixels[i + 2]) + (1 - a)
    count += 1
  }
  for (let x = 0; x < width; x += 1) { add(x, 0); add(x, height - 1) }
  for (let y = 1; y < height - 1; y += 1) { add(0, y); add(width - 1, y) }
  return sum / count < 0.5
}

export function toInkPixels(pixels, width, height) {
  const out = new Uint8ClampedArray(pixels.length)
  const dark = isDarkBackground(pixels, width, height)
  for (let i = 0; i < pixels.length; i += 4) {
    const a = pixels[i + 3] / 255
    let r = pixels[i]
    let g = pixels[i + 1]
    let b = pixels[i + 2]
    if (dark) {
      // Flip HSL lightness, keeping hue and saturation: L' = 1 - L moves every
      // channel by the same amount.
      const shift = 255 - Math.max(r, g, b) - Math.min(r, g, b)
      r += shift; g += shift; b += shift
    }
    out[i] = (r * a + 255 * (1 - a)) / WHITE_POINT
    out[i + 1] = (g * a + 255 * (1 - a)) / WHITE_POINT
    out[i + 2] = (b * a + 255 * (1 - a)) / WHITE_POINT
    out[i + 3] = 255
  }
  return out
}

// ---- Healed ink -----------------------------------------------------------
// Ported from render-on-body.py, so the phone view agrees with the Blender
// renders. Fresh ink multiplied onto skin reads as the skin darkened: a warm
// brown sticker. Healed pigment sits under the epidermis, which scatters light
// back before it reaches the ink, so black settles to a cool blue-green black,
// colour fades a little towards grey, and every line spreads a fraction of a
// millimetre. The texture holds transmittance (1 = bare skin) as sRGB bytes;
// the shader reads it in linear light and does the spread, which depends on
// the print size.

// Gaussian sigma of a healed line's spread into the dermis, in mm of skin.
export const HEALED_SPREAD_MM = 0.15
// Transmittance healed ink regains: solid black lets 2% more skin through.
export const HEALED_DENSITY_LOSS = 0.02
// How far coloured ink fades towards grey as it settles.
export const HEALED_DESATURATE = 0.25
// Solid healed black seen through the skin, as relative linear RGB.
export const HEALED_TINT = [0.8, 0.98, 1.12]
// How dark solid black is: 1 = pure black (render-on-body.py's default).
export const INK_STRENGTH = 0.92

const REC709 = [0.2126, 0.7152, 0.0722]
const lumLinear = ([r, g, b]) => REC709[0] * r + REC709[1] * g + REC709[2] * b
export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const linearToSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)

// Byte → linear, once per value rather than once per pixel.
const LINEAR = Array.from({ length: 256 }, (_, v) => srgbToLinear(v / 255))

// toInkPixels' paper (sRGB bytes) → healed transmittance (sRGB bytes).
export function healInkPixels(paper) {
  const out = new Uint8ClampedArray(paper.length)
  for (let i = 0; i < paper.length; i += 4) {
    const rgb = [LINEAR[paper[i]], LINEAR[paper[i + 1]], LINEAR[paper[i + 2]]]
    const y = lumLinear(rgb)
    for (let ch = 0; ch < 3; ch += 1) {
      const c = rgb[ch] + (y - rgb[ch]) * HEALED_DESATURATE
      const t = Math.min(1, Math.max(0, c + (1 - c) * HEALED_DENSITY_LOSS))
      out[i + ch] = Math.round(255 * linearToSrgb(t))
    }
    out[i + 3] = 255
  }
  return out
}

// The colour under solid healed black over this skin (both linear RGB): as
// dark as fresh black at `strength`, only the hue moves.
export function healedInkFloor(skinLinear, strength = INK_STRENGTH, tint = HEALED_TINT) {
  const y = lumLinear(skinLinear) * (1 - strength)
  const ty = lumLinear(tint)
  return tint.map((t) => (y * t) / ty)
}

// The spread's sigma in texture pixels: a fixed distance of skin, so the same
// image printed larger has fewer pixels per cm and blurs by fewer of them.
export function spreadSigmaPx(texturePx, widthCm, spreadMm = HEALED_SPREAD_MM) {
  return widthCm > 0 ? (spreadMm / 10) * (texturePx / widthCm) : 0
}

// Below this many texture pixels a blur is invisible; skip it.
const MIN_SIGMA_PX = 0.25

// Normalised 1-D Gaussian taps out to 3 sigma ([1] = no blur).
export function gaussianKernel(sigmaPx) {
  if (!(sigmaPx >= MIN_SIGMA_PX)) return [1]
  const r = Math.ceil(3 * sigmaPx)
  const taps = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * sigmaPx * sigmaPx)))
  const total = taps.reduce((sum, t) => sum + t, 0)
  return taps.map((t) => t / total)
}

// Linear light → sRGB byte, through a table: 4096 steps is finer than a byte
// anywhere on the curve.
const TO_SRGB_STEPS = 4096
const TO_SRGB = Uint8ClampedArray.from({ length: TO_SRGB_STEPS + 1 },
  (_, i) => Math.round(255 * linearToSrgb(i / TO_SRGB_STEPS)))

// Healed transmittance (sRGB bytes, as healInkPixels gives) spread by a
// Gaussian of `sigmaPx`, blurred in linear light as render-on-body.py does.
// Outside the image is bare skin, so ink at the border fades rather than
// smearing outwards.
export function spreadInk(pixels, width, height, sigmaPx) {
  const kernel = gaussianKernel(sigmaPx)
  if (kernel.length === 1) return Uint8ClampedArray.from(pixels)
  const r = (kernel.length - 1) / 2
  const n = width * height
  const out = new Uint8ClampedArray(pixels.length)
  const plane = new Float32Array(n)
  const across = new Float32Array(n)
  for (let ch = 0; ch < 3; ch += 1) {
    for (let i = 0; i < n; i += 1) plane[i] = LINEAR[pixels[4 * i + ch]]
    for (let y = 0; y < height; y += 1) {
      const row = y * width
      for (let x = 0; x < width; x += 1) {
        let sum = 0
        for (let k = -r; k <= r; k += 1) {
          const xx = x + k
          sum += kernel[k + r] * (xx < 0 || xx >= width ? 1 : plane[row + xx])
        }
        across[row + x] = sum
      }
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0
        for (let k = -r; k <= r; k += 1) {
          const yy = y + k
          sum += kernel[k + r] * (yy < 0 || yy >= height ? 1 : across[yy * width + x])
        }
        out[4 * (y * width + x) + ch] = TO_SRGB[Math.round(Math.min(1, Math.max(0, sum)) * TO_SRGB_STEPS)]
      }
    }
  }
  for (let i = 3; i < pixels.length; i += 4) out[i] = 255
  return out
}
