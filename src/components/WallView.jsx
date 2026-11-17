import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { buildWallItems, stampAddedAt, photoParam, findPhotoIndex } from '../data/wall'
import { favouriteIdentities, toggleFavourite, favouriteRef } from '../data/favourites'
import { refIdentity } from '../data/imageRef'
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
import { useUndoableRemoval } from '../hooks/useUndoableRemoval'

const savedId = (record) => record.id

// The Wall: full-bleed masonry of every artist reference image, the default
// view on the Artists page (#220). Getting around is the app nav's job and the
// page header belongs to Gallery; this is only the wall and what hangs off it.
export default function WallView({ artists = [], wallArtists = artists, ideas = [], saved = [], setSaved = () => {}, favourites = [], setFavourites = () => {}, favouritesOnly = false, styleFilter = null, setArtists = () => {}, onAddArtist = () => {}, revealArtistId = null }) {
  // Photos matched to favourites by image ref (#220 K). A favourite whose photo
  // is gone matches nothing, so it never shows.
  const favIds = favouriteIdentities(favourites)
  const allItems = buildWallItems(wallArtists, { saved }).map((item) => ({
    ...item,
    isFavourite: favIds.has(refIdentity(item.image)),
    canFavourite: favouriteRef(item.image) !== null,
  }))
  // Un-favouriting the photo you are looking at must not pull it out from under
  // the viewer: it stays until the viewer closes.
  const [keptParams, setKeptParams] = useState(() => new Set())
  const items = favouritesOnly
    ? allItems.filter((item) => item.isFavourite || keptParams.has(photoParam(item)))
    : allItems
  // The open photo lives in the URL (?photo=<artistId>.<n>, #159): the browser's
  // Back closes the viewer instead of leaving the Wall, and a photo can be
  // linked to. A link to a photo that has gone just shows the Wall.
  const photo = useOverlayParam('photo')
  const viewerIndex = findPhotoIndex(items, photo.value)
  const [rankBoardOpen, setRankBoardOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const { remove: removeSavedAt } = useUndoableRemoval(saved, setSaved, { message: 'Photo removed', durable: true, identify: savedId })
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
  if (!viewerOpen && keptParams.size > 0) setKeptParams(new Set())

  function handleToggleFavourite(item) {
    if (!item?.canFavourite) return
    if (item.isFavourite) setKeptParams((prev) => new Set(prev).add(photoParam(item)))
    setFavourites((prev) => toggleFavourite(prev, item.image))
  }

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
    // A photo with no artist has no style to steer from.
    if (!item.artistId) return
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

  // A saved photo (#220 K) joins the artist's images in one update, keeping
  // when it was added; the record it leaves behind is removed in the same go.
  function handleAssignSaved(item, artistId) {
    const record = saved.find((s) => s.id === item.savedId)
    const target = artists.find((a) => a.id === artistId)
    if (!record || !target) return
    const image = stampAddedAt(record.image, record.addedAt || undefined)
    setArtists((prev) => prev.map((a) => (a.id === artistId ? { ...a, images: [...(a.images || []), image] } : a)))
    setSaved((prev) => prev.filter((s) => s.id !== record.id))
    photo.close()
    setNotice(`Photo given to ${target.name || `@${target.handle}`}`)
  }

  function handleRemoveSaved(item) {
    const index = saved.findIndex((s) => s.id === item.savedId)
    if (index === -1) return
    removeSavedAt(index)
    photo.close()
  }

  // #161: a new artist is unranked, so it lands at the foot of the wall, out of
  // sight under "Artist saved". Bring its first photo into view; the order stays.
  useEffect(() => {
    if (!revealArtistId) return
    const tile = [...document.querySelectorAll('[data-artist-id]')]
      .find((el) => el.dataset.artistId === revealArtistId)
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    tile?.scrollIntoView?.({ behavior: still ? 'auto' : 'smooth', block: 'center' })
  }, [revealArtistId])

  return (
    <div className="bg-v2-ink">
      {!viewerOpen && (
        <RankRail
          artists={artists}
          setArtists={setArtists}
          onOpenBoard={() => setRankBoardOpen(true)}
        />
      )}


      {/* A style filter can leave nothing to show; say so rather than go blank. */}
      {items.length === 0 && (
        <p className="px-6 py-20 text-center font-v2-ui text-sm text-v2-muted">
          {favouritesOnly ? (styleFilter ? `No favourites in ${styleFilter}.` : 'No favourites yet. Tap the heart on a photo to add it.') : wallArtists.length === 0 ? 'No artists match this filter.' : 'No photos here yet. Add some from an artist’s page.'}
        </p>
      )}

      <div className="columns-[300px] gap-[6px] p-[6px]">
        {items.map((item) => (
          <WallPiece
            key={item.savedId ? `saved-${item.savedId}` : `${item.artistId}-${item.imageIndex}`}
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
          onAssignSaved={handleAssignSaved}
          onRemoveSaved={handleRemoveSaved}
          onToggleFavourite={handleToggleFavourite}
          onAddNewArtist={() => { photo.close(); onAddArtist({}) }}
        />
      )}

      {notice && (
        <p role="status" className="fixed bottom-24 left-4 right-4 sm:left-auto sm:max-w-md z-40 bg-v2-surface border border-v2-hairline px-3 flex items-center gap-3 font-v2-ui text-sm text-v2-cream">
          <span className="min-w-0 break-words">{notice}</span>
          <button type="button" aria-label="Dismiss message" title="Dismiss message" className="shrink-0 w-11 h-11 flex items-center justify-center text-v2-muted" onClick={() => setNotice('')}><X size={18} /></button>
        </p>
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
