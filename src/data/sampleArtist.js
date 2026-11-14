// One fictional artist a new owner can add to an empty library (#220, group C)
// to see what a filled one looks like, then remove in one tap. Invented name
// and handle, shipped AI-generated demo artwork: never a real person's work.
//
// It is a real record and syncs like any other artist; `sample: true` is how
// the app marks it and finds it again. Image paths are base-relative on
// purpose (see assetPath.js): they are stored and synced verbatim.

import { DEMO_ARTWORK } from './demoArtwork'

export const SAMPLE_ARTIST_ID = 'sample-artist'

const SAMPLE_SOURCE = 'mora.blackfern'

const isSample = (artist) => artist?.sample === true

export function findSampleArtist(artists = []) {
  return artists.find(isSample) || null
}

export function addSampleArtist(artists = []) {
  if (artists.some((a) => isSample(a) || a.id === SAMPLE_ARTIST_ID)) return artists
  const lastRank = artists.reduce((max, a) => Math.max(max, a.rank ?? 0), 0)
  return [
    ...artists,
    {
      id: SAMPLE_ARTIST_ID,
      sample: true,
      handle: SAMPLE_SOURCE,
      name: 'Mora Vane',
      tags: ['dark-illustrative', 'fine-line'],
      styleNote: 'Sample artist, not a real person. Botanical fine-line: fern fronds, magnolia petals and meadow grasses in black and grey.',
      images: DEMO_ARTWORK.filter((piece) => piece.artistId === SAMPLE_SOURCE).map((piece) => piece.src),
      rank: lastRank + 1,
      status: 'researching',
      notes: '',
      studio: null,
    },
  ]
}

export function removeSampleArtists(artists = []) {
  return artists.some(isSample) ? artists.filter((a) => !isSample(a)) : artists
}
