// Removing something should be recoverable, so a removal records *where* the item
// was — undo that only restores membership would silently reorder a curated list.
//
// Position is recorded three ways because the list can change between the removal
// and the undo (a sync landing, an edit on another device): the index, plus the
// items either side as anchors. Index alone misplaces the item as soon as anything
// shifts, and restoring blind duplicates an item that has already come back.

/** Stable-ish identity for the shapes images take here: plain URL strings, Brief's
 *  `{ url, note }` entries, and the canonical `{ key }` blob refs. */
export function itemIdentity(item) {
  if (item == null) return item
  if (typeof item !== 'object') return item
  if (typeof item.url === 'string') return item.url
  if (typeof item.key === 'string') return item.key
  return JSON.stringify(item)
}

function indexOfIdentity(list, item) {
  const id = itemIdentity(item)
  return list.findIndex((candidate) => itemIdentity(candidate) === id)
}

export function removeAt(list, index) {
  if (!Array.isArray(list) || index < 0 || index >= list.length) {
    return { list, removal: null }
  }
  const next = list.slice()
  const [item] = next.splice(index, 1)
  return {
    list: next,
    removal: {
      item,
      index,
      prev: index > 0 ? list[index - 1] : null,
      nextItem: index < list.length - 1 ? list[index + 1] : null,
    },
  }
}

export function restoreRemoval(list, removal) {
  if (!removal) return list
  const next = Array.isArray(list) ? list.slice() : []

  // Already back — a redelivered sync, or a write that never landed. Restoring
  // again would insert a second copy.
  if (indexOfIdentity(next, removal.item) !== -1) return list

  // Prefer the neighbours it sat between; fall back to the recorded index.
  const prevIdx = removal.prev != null ? indexOfIdentity(next, removal.prev) : -1
  const nextIdx = removal.nextItem != null ? indexOfIdentity(next, removal.nextItem) : -1

  let at
  if (prevIdx !== -1) at = prevIdx + 1
  else if (nextIdx !== -1) at = nextIdx
  else at = Math.min(Math.max(removal.index, 0), next.length)

  next.splice(at, 0, removal.item)
  return next
}
