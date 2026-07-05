import { useState, useRef } from 'react'
import { uploadImages } from '../hooks/useImageUpload'
import { useAuth } from '../context/useAuth'
import { DEFAULT_STUDIOS } from '../data/artists'
import { imageSrc } from '../data/wall'

export default function ArtistCard({ artist, onOpen, onSaveImages, dragHandleProps, isDragging, featured, index = 0 }) {
  const displayName = artist.name || `@${artist.handle}`
  const studio = artist.studio ? DEFAULT_STUDIOS.find((s) => s.id === artist.studio) : null
  const hasImages = artist.images && artist.images.length > 0
  const [imgError, setImgError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef()
  const { user } = useAuth() || {}

  async function handleFiles(e) {
    e.stopPropagation()
    const files = e.target.files
    if (!files?.length) return
    setUploading(true)
    try {
      const uploaded = await uploadImages(files, { userId: user?.id, scope: 'artists', id: artist.id })
      onSaveImages(artist, [...(artist.images || []), ...uploaded])
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div
      style={{ animationDelay: `${index * 0.04}s` }}
      className={`animate-slide-up opacity-0 [animation-fill-mode:forwards] bg-ink-card border border-ink-border rounded-sm overflow-hidden cursor-pointer
        transition-all duration-300
        hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/70 hover:border-cream-muted/30
        group ${isDragging ? 'opacity-40 scale-95 shadow-2xl' : ''}`}
      onClick={() => onOpen(artist)}
    >
      <div className={`${featured ? 'aspect-[3/4]' : 'aspect-[4/5]'} bg-ink-muted relative overflow-hidden`}>
        {hasImages && !imgError ? (
          <img
            src={imageSrc(artist.images[0])}
            alt={displayName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <span className={`text-cream-muted/10 font-display ${featured ? 'text-6xl' : 'text-4xl'}`}>
              {(displayName[0] === '@' ? displayName[1] : displayName[0]).toUpperCase()}
            </span>
            {/* Quick upload prompt on empty tiles */}
            <button
              onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}
              className="text-[0.8125rem] font-mono text-cream-muted/75 hover:text-cream-muted/80 tracking-widest uppercase transition-colors"
            >
              {uploading ? 'Importing…' : '+ Add photo'}
            </button>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFiles}
        />

        {/* Drag handle */}
        {dragHandleProps && (
          <div
            {...dragHandleProps}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-2 right-2 w-7 h-7 flex flex-col justify-center items-center gap-1 opacity-0 group-hover:opacity-50 transition-opacity cursor-grab active:cursor-grabbing z-10"
          >
            <span className="block w-4 h-px bg-cream" />
            <span className="block w-4 h-px bg-cream" />
            <span className="block w-4 h-px bg-cream" />
          </div>
        )}

        {/* Quick upload button on hover (tiles that already have images) */}
        {hasImages && !imgError && (
          <button
            onClick={(e) => { e.stopPropagation(); fileRef.current.click() }}
            className="absolute bottom-8 right-1.5 w-6 h-6 rounded-full bg-ink-black/70 flex items-center justify-center opacity-0 group-hover:opacity-80 transition-opacity z-10"
            title="Add photos"
          >
            <span className="text-cream text-sm leading-none">+</span>
          </button>
        )}

        {/* Gradient + name overlay */}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-black via-ink-black/60 to-transparent pt-10 pb-2.5 px-2.5">
          <p className={`font-display text-cream leading-tight ${featured ? 'text-base' : 'text-sm'}`}>
            {artist.name || `@${artist.handle}`}
          </p>
          {artist.name && (
            <p className="font-mono text-cream-muted/90 text-[0.8125rem] tracking-widest mt-0.5">
              @{artist.handle}
            </p>
          )}
          {studio && (
            <span className="inline-block mt-1 px-1.5 py-px bg-ink-black/70 backdrop-blur-sm font-mono text-cream-muted/90 text-[0.625rem] tracking-widest truncate max-w-full">
              {studio.name}
            </span>
          )}
        </div>

        {/* Rank badge */}
        <div className="absolute top-2 left-2 w-5 h-5 rounded-full bg-ink-black/70 flex items-center justify-center backdrop-blur-sm">
          <span className="text-[0.8125rem] font-mono text-cream-muted/80">{artist.rank}</span>
        </div>
      </div>
    </div>
  )
}
