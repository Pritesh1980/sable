import { useEffect, useState } from 'react'
import { buildWallItems, stampAddedAt, photoParam, findPhotoIndex } from '../data/wall'
import useOverlayParam from '../hooks/useOverlayParam'
import WallPiece from './WallPiece'
import WallViewer from './WallViewer'
import ConsiderShelf from './ConsiderShelf'
import DiscoverMore from './DiscoverMore'
import RankRail from './RankRail'
import RankBoard from './RankBoard'
import { SUGGESTED_ARTISTS } from '../data/suggestions'
import { discoverArtistsWithGemini } from '../data/discovery'
import { uploadImages } from '../hooks/useImageUpload'
import { useAuth } from '../context/useAuth'
import { useStorage } from '../hooks/useStorage'

// The Wall: full-bleed masonry of every artist reference image, the default
// view on the Artists page (#220). Getting around is the app nav's job and the
// page header belongs to Gallery; this is only the wall and what hangs off it.
export default function WallView({ artists = [], wallArtists = artists, ideas = [], setArtists = () => {}, onAddArtist = () => {} }) {
  const items = buildWallItems(wallArtists)
  // The open photo lives in the URL (?photo=<artistId>.<n>, #159): the browser's
  // Back closes the viewer instead of leaving the Wall, and a photo can be
  // linked to. A link to a photo that has gone just shows the Wall.
  const photo = useOverlayParam('photo')
  const viewerIndex = findPhotoIndex(items, photo.value)
  const [rankBoardOpen, setRankBoardOpen] = useState(false)
  const [dismissedSuggestions, setDismissedSuggestions] = useStorage('tattoo_dismissed_suggestions', [])
  const [aiSuggestions, setAiSuggestions] = useStorage('tattoo_ai_suggestions', [])
  const suggestionPool = [...SUGGESTED_ARTISTS, ...aiSuggestions]
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const geminiKey = localStorage.getItem('gemini_api_key') || ''

  // One-tap "Refresh" for the Consider shelf: re-run AI discovery for a fresh
  // batch, excluding everyone already owned / pooled / dismissed so each tap
  // surfaces genuinely new faces. Only wired when a Gemini key exists; without
  // one, DiscoverMore's copy-prompt/paste flow is the path.
  async function refreshSuggestions() {
    setRefreshing(true)
    setRefreshError('')
    try {
      const exclude = [
        ...artists.map((a) => a.handle),
        ...suggestionPool.map((s) => s.handle),
        ...dismissedSuggestions,
      ]
      const results = await discoverArtistsWithGemini(geminiKey, artists, { exclude })
      const known = new Set(suggestionPool.map((s) => s.handle.toLowerCase()))
      const fresh = results.filter((r) => !known.has(r.handle.toLowerCase()))
      if (fresh.length === 0) throw new Error('No fresh artists came back — try again')
      setAiSuggestions([...aiSuggestions, ...fresh])
    } catch (err) {
      setRefreshError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  const { user } = useAuth() || {}

  const viewerOpen = viewerIndex !== -1

  // Overlay owns the screen while it's open — lock page scroll so the wall
  // behind it can't move, then hand scroll back when it closes.
  useEffect(() => {
    if (!viewerOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [viewerOpen])

  function handleOpen(item) {
    photo.open(photoParam(item))
  }

  // Swiping between photos replaces the entry: Back closes the viewer, it does
  // not step back through every photo seen.
  function handleIndexChange(item) {
    const value = photoParam(item)
    if (value !== photo.value) photo.replace(value)
  }

  function handleGenerate(item) {
    // The viewer's entry is dropped on the way out so back-nav from Concepts
    // returns to the wall, not to the viewer.
    // t7: Concepts composer reads `steer` to pre-select this artist's style.
    photo.leave(`/concepts?steer=${encodeURIComponent(item.artistId)}`)
  }

  // Shared by both drop targets — the wall-piece drop zone (#1) and the
  // viewer's paste-in-place (#2). Reuses the same upload path as the rest of
  // the app and stamps addedAt so the recent dot lights up immediately.
  async function addImageToArtist(artistId, file) {
    const [uploaded] = await uploadImages([file], { userId: user?.id, scope: 'artists', id: artistId })
    if (!uploaded) return
    const stamped = stampAddedAt(uploaded)
    setArtists((prev) =>
      prev.map((a) => (a.id === artistId ? { ...a, images: [...(a.images || []), stamped] } : a))
    )
  }

  return (
    <div className="bg-v2-ink">
      {!viewerOpen && (
        <RankRail
          artists={artists}
          setArtists={setArtists}
          onOpenBoard={() => setRankBoardOpen(true)}
        />
      )}


      <div className="columns-[300px] gap-[6px] p-[6px]">
        {items.map((item) => (
          <WallPiece
            key={`${item.artistId}-${item.imageIndex}`}
            item={item}
            onOpen={handleOpen}
            onDropImage={addImageToArtist}
          />
        ))}
      </div>

      {/* Suggestions sit under the photos: on a phone they pushed the first one off the screen (#220). */}
      {!viewerOpen && items.length > 0 && (
        <ConsiderShelf
          artists={artists}
          pool={suggestionPool}
          dismissed={dismissedSuggestions}
          onRefresh={geminiKey ? refreshSuggestions : undefined}
          refreshing={refreshing}
          refreshError={refreshError}
          onDismiss={(handle) => setDismissedSuggestions([...dismissedSuggestions, handle])}
          onAdd={(s) => onAddArtist({ handle: s.handle, name: s.name, tags: s.tags })}
        >
          <DiscoverMore
            artists={artists}
            exclude={[
              ...artists.map((a) => a.handle),
              ...suggestionPool.map((s) => s.handle),
              ...dismissedSuggestions,
            ]}
            onResults={(results) => {
              const known = new Set(suggestionPool.map((s) => s.handle.toLowerCase()))
              const fresh = results.filter((r) => !known.has(r.handle.toLowerCase()))
              if (fresh.length) setAiSuggestions([...aiSuggestions, ...fresh])
            }}
          />
        </ConsiderShelf>
      )}

      {viewerOpen && (
        <WallViewer
          items={items}
          initialIndex={viewerIndex}
          artists={artists}
          ideas={ideas}
          open={viewerOpen}
          onClose={photo.close}
          onPasteImage={addImageToArtist}
          onGenerate={handleGenerate}
          onIndexChange={handleIndexChange}
        />
      )}

      {rankBoardOpen && (
        <RankBoard
          artists={artists}
          setArtists={setArtists}
          onClose={() => setRankBoardOpen(false)}
        />
      )}
    </div>
  )
}
