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
