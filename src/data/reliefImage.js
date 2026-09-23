import { DETAIL_PRESETS } from './reliefStl'

export const CANVAS_READ_ERROR = 'This image cannot be read by the browser. Use an uploaded image or data URL.'

// Reads an <img> into a brightness heightmap (0 = black, 1 = white), sampled
// down to the detail preset's size. Throws CANVAS_READ_ERROR for images the
// browser won't expose (cross-origin without CORS).
export function imageToHeightmap(image, detail) {
  const maxSide = DETAIL_PRESETS[detail] || DETAIL_PRESETS.medium
  const sourceWidth = image.naturalWidth || image.width || image.clientWidth || 2
  const sourceHeight = image.naturalHeight || image.height || image.clientHeight || 2
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
  const width = Math.max(2, Math.round(sourceWidth * scale))
  const height = Math.max(2, Math.round(sourceHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error(CANVAS_READ_ERROR)
  }

  context.drawImage(image, 0, 0, width, height)

  let pixels
  try {
    pixels = context.getImageData(0, 0, width, height).data
  } catch {
    throw new Error(CANVAS_READ_ERROR)
  }

  const values = []
  for (let index = 0; index < pixels.length; index += 4) {
    values.push((pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114) / 255)
  }

  return { width, height, values }
}
