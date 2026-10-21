import ArtistImage from './ArtistImage'
import OfflinePhoto from './OfflinePhoto'
import useImageSrc from '../hooks/useImageSrc'
import { activateOnKey } from '../a11y/activate'

const frame = (isCover) =>
  `relative snap-center shrink-0 w-[88%] sm:w-[520px] aspect-[4/5] rounded-xs overflow-hidden ${isCover ? 'ring-1 ring-accent' : ''}`

// One photo in the artist's carousel. A photo that can't be fetched right now
// keeps its place as an "Available when online" tile (#102); one still
// resolving is an empty box, never that message.
export default function PhotoTile({ image, label, position, isCover, onOpen, onSetCover, onRemove }) {
  const { status } = useImageSrc(image)
  if (status === 'unavailable') {
    return <div className={frame(isCover)}><OfflinePhoto className="w-full h-full" /></div>
  }
  if (status === 'loading') {
    return <div className={`${frame(isCover)} bg-ink-muted`} aria-busy="true" />
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`View image ${position + 1} full screen`}
      onKeyDown={activateOnKey(onOpen)}
      onClick={onOpen}
      className={`${frame(isCover)} bg-ink-muted cursor-pointer`}
    >
      <ArtistImage src={image} label={label} className="w-full h-full object-cover" monogramClassName="text-6xl" loading="lazy" />
      {isCover && (
        <div className="absolute top-3 left-3 bg-accent/80 text-cream text-[0.6875rem] font-mono tracking-widest px-2 py-1 rounded-xs uppercase">Cover</div>
      )}
      <div className="absolute top-3 right-3 flex gap-1.5">
        {!isCover && (
          <button
            onClick={(e) => { e.stopPropagation(); onSetCover() }}
            className="text-[0.6875rem] font-mono text-cream tracking-widest uppercase bg-ink-black/70 hover:bg-ink-black px-2.5 py-1 rounded-xs transition-colors backdrop-blur-xs"
          >Set cover</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="w-7 h-7 flex items-center justify-center text-accent text-xl leading-none bg-ink-black/70 hover:bg-ink-black rounded-xs transition-colors backdrop-blur-xs"
          title="Remove photo"
        >×</button>
      </div>
    </div>
  )
}
