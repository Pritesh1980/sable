import { demoArtworkFor } from '../data/demoArtwork'

// Provenance follows the shipped asset, not editable artist IDs or notes.
export default function GeneratedArtworkNotice({ images = [], className = '' }) {
  if (!images.some(demoArtworkFor)) return null
  return (
    <p className={`font-v2-ui text-xs text-v2-muted ${className}`}>
      AI-generated imagery · demo artwork
    </p>
  )
}
