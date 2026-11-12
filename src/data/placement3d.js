// Pure maths for the 3D placement view (#195): where a design sits on the arm
// and how big it is, in centimetres of skin. No three.js here, so it is unit
// tested in jsdom; ArmPlacement3D turns these numbers into shader uniforms.
//
// The arm model (scripts/blender/export-arm-gltf.py) carries each vertex's
// place on the skin, so a placement is just three numbers:
//   widthCm   printed width, measured round the curve as a stencil lies
//   centreCm  height of the design's centre up the limb: above the elbow
//             joint on the upper arm, above the wrist joint on the forearm
//   arcCm     how far round from the line down the limb's +z side (the outer
//             upper arm, the inner forearm)

export const MIN_WIDTH_CM = 3
// A design may go at most this far round the arm: past it the two edges meet
// at the back and the seam shows.
export const MAX_WRAP = 0.9
export const DEFAULT_PLACEMENT = { widthCm: 12, centreCm: 17, arcCm: 0 }

// The limbs there is a model of (#206), each exported by export-arm-gltf.py
// to public/models/<file>.{glb,json} (precached as models/arm-*). The words
// are what the sliders and saved notes say: `ahead` is the way a positive arc
// runs round the limb, `behind` a negative one.
export const LIMBS = {
  'upper-arm': {
    id: 'upper-arm', label: 'Upper arm', noun: 'arm', file: 'arm-upper',
    along: 'Above the elbow', from: 'above the elbow',
    line: 'outer arm', ahead: 'to the back', behind: 'to the front',
    placement: DEFAULT_PLACEMENT,
  },
  forearm: {
    id: 'forearm', label: 'Forearm', noun: 'forearm', file: 'arm-forearm',
    along: 'Above the wrist', from: 'above the wrist',
    line: 'inner forearm', ahead: 'towards the thumb', behind: 'towards the little finger',
    placement: { widthCm: 8, centreCm: 12, arcCm: 0 },
  },
}
export const DEFAULT_LIMB = 'upper-arm'

// An idea's body placement (PLACEMENTS in data/artists.js) → the limb its 3D
// view opens on. A sleeve starts on the upper arm; anywhere without a model
// falls back to it too, and the view's switcher is one tap away.
const LIMB_FOR_PLACEMENT = { forearm: 'forearm', 'upper arm': 'upper-arm', sleeve: 'upper-arm' }
export function limbFor(placement) {
  return LIMB_FOR_PLACEMENT[placement] || DEFAULT_LIMB
}

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

// The upper arm model spans about 54 cm, centred 10.5 cm above the elbow: the
// whole-limb view of a model whose sidecar gives no extent.
export const WHOLE_ARM = { focusCm: 10.5, frameCm: 54 }
const CLOSEST_FRAME_CM = 14
const FRAME_MARGIN = 1.4
const WHOLE_MARGIN_CM = 4

// The whole-limb view from a model's `extent_cm` (the heights its visible
// skin spans): all of it, with a little room either end.
export function wholeLimbFrame(extentCm) {
  if (!Array.isArray(extentCm)) return WHOLE_ARM
  const [lo, hi] = extentCm
  return { focusCm: round2((lo + hi) / 2), frameCm: round2(hi - lo + WHOLE_MARGIN_CM) }
}

// `focusCm`: the height up the limb at the middle of the view.
// `frameCm`: how much limb fits in the view, top to bottom.
// `whole`: the limb's whole view (wholeLimbFrame), the most ever framed.
export function viewFrame({ widthCm, heightCm, centreCm }, mode = 'design', whole = WHOLE_ARM) {
  if (mode === 'arm') return whole
  // A wide design wraps away round the arm, so its width needs less room.
  const frameCm = Math.max(CLOSEST_FRAME_CM, FRAME_MARGIN * Math.max(heightCm, 0.6 * widthCm))
  return frameCm >= whole.frameCm ? whole : { focusCm: centreCm, frameCm: round2(frameCm) }
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
export function snapshotPose(placement, perimeterCm, turned = 0, whole = WHOLE_ARM) {
  const full = 2 * Math.PI
  const turn = turned - full * Math.round(turned / full) // shortest way round
  return {
    ...viewFrame(placement, 'design', whole),
    yaw: designYaw(placement, perimeterCm),
    turned: Math.min(MAX_SNAPSHOT_TURN, Math.max(-MAX_SNAPSHOT_TURN, turn)),
  }
}

export const formatCm = (n) => `${n.toFixed(1)} cm`

export function arcLabel(arcCm, limb = LIMBS[DEFAULT_LIMB]) {
  if (arcCm === 0) return limb.line
  return `${formatCm(Math.abs(arcCm))} ${arcCm > 0 ? limb.ahead : limb.behind}`
}

// What a saved snapshot is called, labelled the way the live try-on labels
// its own: made on this device, so the provider is 'other', not an AI.
export function snapshotVariant(label, { widthCm, heightCm, centreCm, arcCm }, limb = LIMBS[DEFAULT_LIMB]) {
  return {
    provider: 'other',
    title: `On the ${limb.noun}, ${round1(widthCm)} cm`,
    notes: `3D ${limb.noun} preview of ${label}. ${formatCm(widthCm)} wide × ${formatCm(heightCm)} tall, `
      + `centred ${formatCm(centreCm)} ${limb.from}, ${arcLabel(arcCm, limb)}.`,
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
// back before it reaches the ink, so black settles to a cool blue-green black
// and colour fades a little towards grey. The texture holds transmittance
// (1 = bare skin) as sRGB bytes, which the shader reads in linear light.
//
// Not ported: the renders' 0.15 mm Gaussian spread. Framed on the design, it
// is about one screen pixel wide here, and it cost either every frame (in
// the shader: the settle test timed out under software WebGL) or 150-700 ms
// of main thread after each resize (on the CPU, measured on a Mac).

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
