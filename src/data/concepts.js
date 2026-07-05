import { getConceptVariants } from './conceptVariants'

// Wall data schema + selector for Concepts — mirrors src/data/wall.js's shape
// so ConceptPiece/ConceptViewer can reuse the same wall-language patterns as
// the artist Wall. Pure data layer; no UI.

function conceptTitle(concept) {
  return String(concept?.prompt || '').trim() || 'Untitled concept'
}

// Only concepts with a saved image render on the wall — text-only responses
// and empty paste-pending concepts stay in the composer's paste zone until an
// image lands.
export function buildConceptWallItems(concepts = [], artists = []) {
  return concepts
    .filter((c) => c.imageUrl)
    .map((concept) => {
      const steerArtist = artists.find((a) => a.id === concept.steerArtistId)
      return {
        id: concept.id,
        concept,
        title: conceptTitle(concept),
        imageUrl: concept.imageUrl,
        tags: concept.tags || [],
        steerArtistId: concept.steerArtistId || '',
        steerArtistName: steerArtist ? (steerArtist.name || `@${steerArtist.handle}`) : '',
        variantsCount: getConceptVariants(concept).length,
      }
    })
}
