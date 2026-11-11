// Export-only crop metadata belongs to a reference occurrence, not the image
// bytes: the same photo may deliberately appear twice with different notes.
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
    return crop ? { ...ref, briefCrop: crop } : ref
  }).filter((image) => image.key || image.url)
}

const validIndex = (images, index) => Number.isInteger(index) && index >= 0 && index < images.length

// Removal/Undo must distinguish copies of one photo carrying different intent.
// Equal copies remain interchangeable; this identity is never persisted.
export function referenceOccurrenceIdentity(image) {
  return JSON.stringify([image.key || image.url, image.note || '', normalizeBriefCrop(image.briefCrop)])
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

export function setReferenceNote(images, index, note) {
  return editReference(images, index, (image) => ({ ...image, note }))
}
