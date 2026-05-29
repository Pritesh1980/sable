export default function StyleWall({ artists, onOpenArtist }) {
  const allImages = artists
    .filter((a) => a.images?.length > 0)
    .flatMap((artist) => artist.images.map((src) => ({ src, artist })))

  if (allImages.length === 0) {
    return (
      <div className="py-20 text-center font-mono text-xs text-cream-muted/40 tracking-widest uppercase">
        No images yet — add photos from the Manage page
      </div>
    )
  }

  return (
    <div className="columns-2 sm:columns-3 gap-2 px-4 pb-24">
      {allImages.map(({ src, artist }, i) => (
        <div
          key={i}
          className="relative mb-2 break-inside-avoid rounded-sm overflow-hidden cursor-pointer group"
          onClick={() => onOpenArtist(artist)}
        >
          <img
            src={src}
            alt=""
            className="w-full block group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-black/90 to-transparent px-2.5 py-3 translate-y-1 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
            <p className="font-display text-cream text-sm leading-tight">
              {artist.name || `@${artist.handle}`}
            </p>
            {artist.name && (
              <p className="font-mono text-cream-muted/60 text-[0.8125rem] mt-0.5">@{artist.handle}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
