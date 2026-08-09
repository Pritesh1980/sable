// Cropping an Instagram screenshot down to the artwork (issue #24).
//
// Two things were wrong with feeding the raw screenshot straight through: the
// CLIP vector behind taste-fit was partly made of Instagram's own UI — status
// bar, buttons, comment text — and the stored reference image carried that same
// chrome into a Wall whose whole premise is that the work is the interface.
//
// The intake call already looks at the picture, so it returns the artwork's
// bounding box as well and the crop happens on-device. The geometry here is
// pure and tested; the canvas call at the bottom is a thin wrapper, matching how
// `compressImages` is handled (jsdom has no canvas).

// Gemini reports boxes in a 0-1000 space.
const BOX_SCALE = 1000
// Floors on what counts as a plausible artwork region. Sides alone are not
// enough: 10% by 10% clears a per-side check while being 1% of the picture, so
// an injected box could replace the screenshot with its corner and lose the
// tattoo (codex review). The screenshot is of a profile or post, so the artwork
// is a large part of it — anything smaller is a misread, and a misread should
// mean "don't crop".
const MIN_SIDE = 0.2
const MIN_AREA = 0.1
// At this point the model is saying "it's all artwork". There is nothing to cut,
// and cropping anyway would re-encode the image for nothing and label the taste
// score precise when it still contains every bit of chrome.
const FULL_FRAME_AREA = 0.98

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)

/**
 * "x0,y0,x1,y1" in 0-1000 → { x, y, w, h } normalised 0-1, or null when the
 * model gave nothing usable. Null means "don't crop", never "crop to nothing".
 */
export function parseArtworkBox(text) {
  if (text == null) return null
  const nums = String(text)
    .replace(/[[\]()]/g, ' ')
    .split(/[,\s]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(Number)
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null

  // Rounded so subtraction doesn't leave floating-point dust (0.8 - 0.2 is not
  // 0.6) in values that end up in stored state.
  const round = (n) => Math.round(n * 1e6) / 1e6
  const [x0, y0, x1, y1] = nums.map((n) => round(clamp(n, 0, BOX_SCALE) / BOX_SCALE))
  const w = round(x1 - x0)
  const h = round(y1 - y0)
  if (w < MIN_SIDE || h < MIN_SIDE) return null
  const area = w * h
  if (area < MIN_AREA || area >= FULL_FRAME_AREA) return null

  return { x: x0, y: y0, w, h }
}

/** Normalised box + image size → the source rectangle to draw from, in pixels. */
export function cropRect(box, width, height) {
  if (!box || !(width > 0) || !(height > 0)) return null
  const sx = clamp(Math.round(box.x * width), 0, width - 1)
  const sy = clamp(Math.round(box.y * height), 0, height - 1)
  const sw = clamp(Math.round(box.w * width), 1, width - sx)
  const sh = clamp(Math.round(box.h * height), 1, height - sy)
  return { sx, sy, sw, sh }
}

/** Base64 data URL → File, so a crop can re-enter the normal upload path. */
export function dataUrlToFile(dataUrl, name) {
  const m = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl || '')
  if (!m) return null
  const [, mimeType, base64] = m
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], name, { type: mimeType })
}

/**
 * Draw the boxed region out of a data URL. Resolves to the original when there
 * is nothing sensible to crop, so callers can use the result unconditionally.
 */
export function cropImageToDataUrl(dataUrl, box, { quality = 0.85 } = {}) {
  return new Promise((resolve) => {
    if (!box) { resolve(dataUrl); return }
    const img = new Image()
    img.onload = () => {
      try {
        const rect = cropRect(box, img.width, img.height)
        if (!rect) { resolve(dataUrl); return }
        const canvas = document.createElement('canvas')
        canvas.width = rect.sw
        canvas.height = rect.sh
        canvas
          .getContext('2d')
          .drawImage(img, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, rect.sw, rect.sh)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch {
        // A crop is an improvement, not a requirement — never lose the image.
        resolve(dataUrl)
      }
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
