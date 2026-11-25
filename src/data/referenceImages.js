import { normalizePhotoMarkup } from './photoMarkup'

// Export-only crop and markup metadata belong to a reference occurrence, not
// the image bytes: the same photo may deliberately appear twice with different
// notes, crops, or callouts.
export function normalizeBriefCrop(crop) {
  if (!crop || typeof crop !== 'object' || Array.isArray(crop)) return undefined
  const clamp = (value, low, high, fallback) => Number.isFinite(value)
    ? Math.max(low, Math.min(high, value)) : fallback
  return {
    x: clamp(crop.x, 0, 1, 0.5),
    y: clamp(crop.y, 0, 1, 0.5),
    zoom: clamp(crop.zoom, 1, 3, 1),
  }
}

export function normalizeReferenceImages(images = []) {
  return images.map((image) => {
    const ref = typeof image === 'string' ? { url: image, note: '' }
      : image?.key ? { key: image.key, note: image.note || '' }
        : { url: image?.url || '', note: image?.note || '' }
    const crop = normalizeBriefCrop(image?.briefCrop)
    const markup = normalizePhotoMarkup(image?.markup)
    if (crop) ref.briefCrop = crop
    if (markup) {
      ref.markup = markup
      if (image?.includeMarkupInBrief === false) ref.includeMarkupInBrief = false
    }
    return ref
  }).filter((image) => image.key || image.url)
}

const validIndex = (images, index) => Number.isInteger(index) && index >= 0 && index < images.length

// Removal/Undo must distinguish copies of one photo carrying different intent.
// Equal copies remain interchangeable; this identity is never persisted.
export function referenceOccurrenceIdentity(image) {
  const markup = normalizePhotoMarkup(image.markup)
  const include = markup && image.includeMarkupInBrief === false ? false : undefined
  return JSON.stringify([image.key || image.url, image.note || '', normalizeBriefCrop(image.briefCrop), markup, include])
}

export function moveReferenceImage(images, fromIndex, toIndex) {
  const next = normalizeReferenceImages(images)
  if (!validIndex(next, fromIndex) || !validIndex(next, toIndex)) return next
  next.splice(toIndex, 0, next.splice(fromIndex, 1)[0])
  return next
}

function editReference(images, index, edit) {
  return normalizeReferenceImages(images).map((image, at) => at === index ? edit(image) : image)
}

export function setReferenceCrop(images, index, crop) {
  return editReference(images, index, (image) => {
    const next = { ...image }
    const normalized = normalizeBriefCrop(crop)
    if (normalized) next.briefCrop = normalized
    else delete next.briefCrop
    return next
  })
}

export function setReferenceMarkup(images, index, markup, { includeMarkupInBrief } = {}) {
  return editReference(images, index, (image) => {
    const next = { ...image }
    const normalized = normalizePhotoMarkup(markup)
    if (normalized) {
      next.markup = normalized
      const include = includeMarkupInBrief !== undefined ? includeMarkupInBrief : image.includeMarkupInBrief
      if (include === false) next.includeMarkupInBrief = false
      else delete next.includeMarkupInBrief
    } else {
      delete next.markup
      delete next.includeMarkupInBrief
    }
    return next
  })
}

export function setReferenceMarkupOnCard(images, index, include) {
  return editReference(images, index, (image) => {
    if (!image.markup?.length) return image
    const next = { ...image }
    if (include === false) next.includeMarkupInBrief = false
    else delete next.includeMarkupInBrief
    return next
  })
}

export function setReferenceNote(images, index, note) {
  return editReference(images, index, (image) => ({ ...image, note }))
}
