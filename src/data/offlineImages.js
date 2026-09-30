// The artist's photos as they should be laid out: displayed images plus a slot
// for each photo whose bytes can't be fetched right now, back at its original
// position (#102). `imageIndex` points into `images`, so opening a photo keeps
// working against the real array.
export function photoSlots(images = [], unresolvedImages = []) {
  const slots = images.map((src, imageIndex) => ({ kind: 'image', src, imageIndex }))
  const offline = (unresolvedImages || []).filter((u) => !u.pending).sort((a, b) => a.index - b.index)
  for (const { ref, index } of offline) slots.splice(Math.min(index, slots.length), 0, { kind: 'offline', ref })
  return slots
}

// The inverse: after reordering or removing slots, the displayed list and each
// offline photo's new position. Edits go through the whole sequence so an
// offline photo keeps its place relative to its neighbours.
export function fromSlots(slots) {
  const images = []
  const unresolvedImages = []
  slots.forEach((slot, index) => {
    if (slot.kind === 'offline') unresolvedImages.push({ ref: slot.ref, index })
    else images.push(slot.src)
  })
  return { images, unresolvedImages }
}
