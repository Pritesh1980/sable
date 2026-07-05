import { useCallback, useEffect, useMemo, useState } from 'react'

// True when the active element is a form field — keyboard nav must not steal
// keystrokes from a text input, textarea, select, or contenteditable region.
function isFormFieldFocused() {
  const el = typeof document !== 'undefined' ? document.activeElement : null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

// Groups a flat WallItems array into contiguous per-artist runs. Wall items
// are already ordered artist-by-artist (see src/data/wall.js), so a single
// linear pass is enough — no sorting or bucketing needed.
function buildArtistGroups(items) {
  const groups = []
  for (let i = 0; i < items.length; i++) {
    const { artistId } = items[i]
    const last = groups[groups.length - 1]
    if (last && last.artistId === artistId) {
      last.endIndex = i + 1
    } else {
      groups.push({ artistId, startIndex: i, endIndex: i + 1 })
    }
  }
  return groups
}

function groupForIndex(groups, index) {
  return groups.find((g) => index >= g.startIndex && index < g.endIndex)
}

// Keyboard model for the full-screen wall viewer.
// ←/→ move within the current artist's images (wraps at the ends).
// ↑/↓ jump to the previous/next artist's first image (no wrap past the ends).
// G/I/Esc call the matching callback. Ignored while a form field has focus.
export default function useWallKeyboard({
  items,
  initialIndex = 0,
  onClose,
  onGenerate,
  onToggleInfo,
  enabled = true,
}) {
  const [index, setIndex] = useState(initialIndex)

  const groups = useMemo(() => buildArtistGroups(items), [items])

  const moveWithinArtist = useCallback((delta) => {
    setIndex((current) => {
      const g = groupForIndex(groups, current)
      if (!g) return current
      const count = g.endIndex - g.startIndex
      const pos = current - g.startIndex
      const nextPos = (pos + delta + count) % count
      return g.startIndex + nextPos
    })
  }, [groups])

  const jumpArtist = useCallback((delta) => {
    setIndex((current) => {
      const gi = groups.findIndex((g) => current >= g.startIndex && current < g.endIndex)
      if (gi === -1) return current
      const nextGi = gi + delta
      if (nextGi < 0 || nextGi >= groups.length) return current
      return groups[nextGi].startIndex
    })
  }, [groups])

  useEffect(() => {
    if (!enabled) return undefined

    function handleKeyDown(e) {
      if (isFormFieldFocused()) return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          moveWithinArtist(-1)
          break
        case 'ArrowRight':
          e.preventDefault()
          moveWithinArtist(1)
          break
        case 'ArrowUp':
          e.preventDefault()
          jumpArtist(-1)
          break
        case 'ArrowDown':
          e.preventDefault()
          jumpArtist(1)
          break
        case 'g':
        case 'G':
          onGenerate?.(items[index])
          break
        case 'i':
        case 'I':
          onToggleInfo?.()
          break
        case 'Escape':
          onClose?.()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, moveWithinArtist, jumpArtist, onGenerate, onToggleInfo, onClose, items, index])

  const group = groupForIndex(groups, index)
  const groupIndex = group ? groups.indexOf(group) : -1

  return {
    index,
    current: items[index],
    setIndex,
    positionInArtist: group ? index - group.startIndex : 0,
    artistImageCount: group ? group.endIndex - group.startIndex : 0,
    artistOrdinal: groupIndex + 1,
    artistCount: groups.length,
  }
}
