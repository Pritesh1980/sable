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

function countIdentity(list, item) {
  const id = itemIdentity(item)
  return list.reduce((n, candidate) => (itemIdentity(candidate) === id ? n + 1 : n), 0)
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
      // How many of this identity remained after the removal. Restoring is
      // allowed back up to this many — which lets a batch bring back two photos
      // that share a URL, while still refusing to restore one removal twice.
      remaining: countIdentity(next, item),
    },
  }
}

/** Remove by identity rather than position, so it stays correct when applied to a
 *  list that has shifted since the index was captured. */
export function removeItem(list, item) {
  const next = Array.isArray(list) ? list.slice() : []
  const at = indexOfIdentity(next, item)
  if (at === -1) return list
  next.splice(at, 1)
  return next
}

export function restoreRemoval(list, removal) {
  if (!removal) return list
  const next = Array.isArray(list) ? list.slice() : []

  // Already back — a redelivered sync, a write that never landed, or a second
  // press of Undo. Compared by count rather than presence so that genuinely
  // duplicated items (two photos sharing a URL) can both come back.
  const allowed = removal.remaining ?? 0
  if (countIdentity(next, removal.item) > allowed) return list

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
