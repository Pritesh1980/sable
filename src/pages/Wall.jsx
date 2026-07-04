import { buildWallItems } from '../data/wall'
import WallPiece from '../components/WallPiece'

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

export default function Wall({ artists = [], onOpenArtist, onAddArtist, onOpenDrawer, onSwitchView, activeView = 'artists' }) {
  const items = buildWallItems(artists)

  return (
    <div className="min-h-screen bg-v2-ink">
      <Bar
        activeView={activeView}
        onSwitchView={onSwitchView}
        onAddArtist={onAddArtist}
        onOpenDrawer={onOpenDrawer}
      />

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-32 text-center px-6">
          <p className="font-v2-display text-v2-cream text-xl tracking-wide">
            The wall is bare — add an artist to start building it.
          </p>
          <button
            onClick={onAddArtist}
            className="font-v2-ui text-sm text-v2-cream border border-v2-hairline hover:border-v2-accent rounded-sm px-5 py-2 transition-colors"
          >
            + Add artist
          </button>
        </div>
      ) : (
        <main className="columns-[300px] gap-[6px] p-[6px]">
          {items.map((item) => (
            <WallPiece key={`${item.artistId}-${item.imageIndex}`} item={item} onOpen={onOpenArtist} />
          ))}
        </main>
      )}
    </div>
  )
}
