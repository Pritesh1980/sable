// Removing something should be recoverable, so a removal records *where* the item
// was — undo that only restores membership would silently reorder a curated list.

export function removeAt(list, index) {
  if (!Array.isArray(list) || index < 0 || index >= list.length) {
    return { list, removal: null }
  }
  const next = list.slice()
  const [item] = next.splice(index, 1)
  return { list: next, removal: { item, index } }
}

export function restoreRemoval(list, removal) {
  if (!removal) return list
  const next = Array.isArray(list) ? list.slice() : []
  // The list may have changed since the removal (a sync landing, another edit), so
  // clamp rather than trusting the index. Getting the item back matters more than
  // getting it back in exactly the right place.
  const at = Math.min(Math.max(removal.index, 0), next.length)
  next.splice(at, 0, removal.item)
  return next
}
