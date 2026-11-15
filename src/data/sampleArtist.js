// One fictional artist a new owner can add to an empty library (#220, group C)
// to see what a filled one looks like, then remove in one tap. Invented name
// and handle, shipped AI-generated demo artwork: never a real person's work.
//
// It is a real record and syncs like any other artist; `sample: true` is how
// the app marks it and finds it again. Image paths are base-relative on
// purpose (see assetPath.js): they are stored and synced verbatim.

import { DEMO_ARTWORK } from './demoArtwork'
import { randomId } from './randomId'

// Every add gets its own id. A re-added sample is then a new record, so the
// photo tombstones and in-flight uploads of a removed one cannot reach it.
export const SAMPLE_ARTIST_PREFIX = 'sample-artist-'

const SAMPLE_SOURCE = 'vesper_noctis'

const isSample = (artist) => artist?.sample === true

export function findSampleArtist(artists = []) {
  return artists.find(isSample) || null
}

export function addSampleArtist(artists = []) {
  if (artists.some(isSample)) return artists
  const lastRank = artists.reduce((max, a) => Math.max(max, a.rank ?? 0), 0)
  return [
    ...artists,
    {
      id: SAMPLE_ARTIST_PREFIX + randomId(),
      sample: true,
      handle: SAMPLE_SOURCE,
      name: 'Vesper Ash',
      tags: ['surrealism', 'realism'],
      styleNote: 'Sample artist, not a real person. Surreal black and grey: an ocean inside an hourglass, fractured marble and stairways into impossible spaces.',
      images: DEMO_ARTWORK.filter((piece) => piece.artistId === SAMPLE_SOURCE).map((piece) => piece.src),
      rank: lastRank + 1,
      status: 'researching',
      notes: '',
      studio: null,
    },
  ]
}

export function removeSampleArtists(artists = []) {
  if (!artists.some(isSample)) return artists
  // Close the gap the sample leaves: rank controls assume 1..n with no holes.
  const gone = artists.filter(isSample).map((a) => a.rank).filter((r) => r != null)
  return artists.filter((a) => !isSample(a)).map((a) => {
    const below = gone.filter((r) => r < a.rank).length
    return below > 0 ? { ...a, rank: a.rank - below } : a
  })
}
