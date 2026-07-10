import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buildWallItems, stampAddedAt } from '../data/wall'
import WallPiece from '../components/WallPiece'
import WallViewer from '../components/WallViewer'
import AddArtistModal from '../components/AddArtistModal'
import ConsiderShelf from '../components/ConsiderShelf'
import DiscoverMore from '../components/DiscoverMore'
import { SUGGESTED_ARTISTS } from '../data/suggestions'
import { discoverArtistsWithGemini } from '../data/discovery'
import { uploadImages } from '../hooks/useImageUpload'
import { useAuth } from '../context/useAuth'
import { useStorage } from '../hooks/useStorage'

// The Wall — image-first home surface. Full-bleed masonry of every artist
// reference image; the hairline bar above it is the only chrome. Routing is
// deliberately NOT wired here (App.jsx / Nav.jsx untouched) — the view switch,
// add-artist and drawer affordances are emitted as callbacks for a later task.
function Bar({ activeView, onSwitchView, onAddArtist, onOpenDrawer }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-8 px-8 py-3.5 bg-v2-ink/[.88] backdrop-blur-md border-b border-v2-hairline">
      <div className="font-v2-display text-[1.35rem] tracking-[0.28em] uppercase text-v2-cream">
        Sable<span className="text-v2-accent">.</span>
      </div>

      <nav className="flex items-center gap-6 flex-1">
        {[
          { id: 'artists', label: 'Artists' },
          { id: 'concepts', label: 'Concepts' },
        ].map(({ id, label }) => (
          <button
            key={id}
            onClick={() => onSwitchView(id)}
            className={`font-v2-ui text-sm tracking-wide uppercase pb-1 border-b-2 transition-colors ${
              activeView === id
                ? 'text-v2-cream border-v2-accent'
                : 'text-v2-muted border-transparent hover:text-v2-cream'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <button
        onClick={onAddArtist}
        className="font-v2-ui text-sm text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-4 py-1.5 transition-colors"
      >
        + Add artist
      </button>

      <button
        onClick={onOpenDrawer}
        title="Everything else — ideas, ranking, conventions, studios, settings"
        className="font-v2-ui text-lg text-v2-muted hover:text-v2-cream px-1"
      >
        ⋯
      </button>
    </header>
  )
}

export default function Wall({ artists = [], ideas = [], setArtists = () => {}, onOpenArtist, onOpenDrawer, onSwitchView, activeView = 'artists' }) {
  const items = buildWallItems(artists)
  const [viewerIndex, setViewerIndex] = useState(null)
  const [addArtistOpen, setAddArtistOpen] = useState(false)
  const [addArtistInitial, setAddArtistInitial] = useState(null)
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

  const navigate = useNavigate()
  const { user } = useAuth() || {}

  const viewerOpen = viewerIndex !== null

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
    onOpenArtist?.(item)
    setViewerIndex(items.indexOf(item))
  }

  function handleGenerate(item) {
    // Viewer closes first so back-nav from Concepts returns to the wall, not
    // to the viewer.
    setViewerIndex(null)
    // t7: Concepts composer reads `steer` to pre-select this artist's style.
    navigate(`/concepts?steer=${item.artistId}`)
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
    <div className="min-h-screen bg-v2-ink">
      {!viewerOpen && (
        <Bar
          activeView={activeView}
          onSwitchView={onSwitchView}
          onAddArtist={() => setAddArtistOpen(true)}
          onOpenDrawer={onOpenDrawer}
        />
      )}

      {items.length > 0 && (
        <ConsiderShelf
          artists={artists}
          pool={suggestionPool}
          dismissed={dismissedSuggestions}
          onRefresh={geminiKey ? refreshSuggestions : undefined}
          refreshing={refreshing}
          refreshError={refreshError}
          onDismiss={(handle) => setDismissedSuggestions([...dismissedSuggestions, handle])}
          onAdd={(s) => {
            setAddArtistInitial({ handle: s.handle, name: s.name, tags: s.tags })
            setAddArtistOpen(true)
          }}
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

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-32 text-center px-6">
          <p className="font-v2-display text-v2-cream text-xl tracking-wide">
            The wall is bare — add an artist to start building it.
          </p>
          <button
            onClick={() => setAddArtistOpen(true)}
            className="font-v2-ui text-sm text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-5 py-2 transition-colors"
          >
            + Add artist
          </button>
        </div>
      ) : (
        <main className="columns-[300px] gap-[6px] p-[6px]">
          {items.map((item) => (
            <WallPiece
              key={`${item.artistId}-${item.imageIndex}`}
              item={item}
              onOpen={handleOpen}
              onDropImage={addImageToArtist}
            />
          ))}
        </main>
      )}

      {viewerOpen && (
        <WallViewer
          items={items}
          initialIndex={viewerIndex}
          artists={artists}
          ideas={ideas}
          open={viewerOpen}
          onClose={() => setViewerIndex(null)}
          onPasteImage={addImageToArtist}
          onGenerate={handleGenerate}
        />
      )}

      {addArtistOpen && (
        <AddArtistModal
          key={addArtistInitial?.handle || 'blank'}
          artists={artists}
          setArtists={setArtists}
          userId={user?.id}
          initial={addArtistInitial || undefined}
          onClose={() => { setAddArtistOpen(false); setAddArtistInitial(null) }}
          onManage={() => { setAddArtistOpen(false); setAddArtistInitial(null) }}
        />
      )}
    </div>
  )
}
