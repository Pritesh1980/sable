import { resolveAssetPath } from './assetPath'

// Public synthetic artwork only. Keep these immutable filenames: image URLs
// are also the service worker and on-device embedding cache keys.
export const DEMO_ARTWORK = [
  { artistId: 'mora.blackfern', slug: 'fern', title: 'Botanical fern' },
  { artistId: 'mora.blackfern', slug: 'magnolia', title: 'Magnolia branch' },
  { artistId: 'mora.blackfern', slug: 'grasses', title: 'Meadow grasses' },
  { artistId: 'vesper_noctis', slug: 'hourglass', title: 'Ocean hourglass' },
  { artistId: 'vesper_noctis', slug: 'marble', title: 'Fractured marble' },
  { artistId: 'vesper_noctis', slug: 'staircase', title: 'Dream staircase' },
  { artistId: 'hexen_atlas', slug: 'samurai', title: 'Samurai and temple' },
  { artistId: 'hexen_atlas', slug: 'koi', title: 'Koi and waves' },
  { artistId: 'hexen_atlas', slug: 'temple', title: 'Temple landscape' },
  { artistId: 'ferrum_line', slug: 'calf', title: 'Tribal calf' },
  { artistId: 'ferrum_line', slug: 'shoulder', title: 'Tribal shoulder' },
  { artistId: 'ferrum_line', slug: 'forearm', title: 'Tribal forearm' },
  { artistId: 'ashgrove.tattoo', slug: 'kingfisher', title: 'Colour kingfisher' },
  { artistId: 'ashgrove.tattoo', slug: 'tiger', title: 'Tiger portrait' },
  { artistId: 'ashgrove.tattoo', slug: 'gemstone', title: 'Teal gemstone' },
  { artistId: 'lekhani.ink', slug: 'bilingual', title: 'Bilingual brush lettering' },
  { artistId: 'lekhani.ink', slug: 'latin', title: 'Latin brush lettering' },
  { artistId: 'lekhani.ink', slug: 'abstract', title: 'Abstract ink' },
].map((piece) => ({
  ...piece,
  src: `images/demo/${piece.artistId}/${piece.slug}-v4.webp`,
  thumbnail: `images/demo/${piece.artistId}/${piece.slug}-v4-thumb.webp`,
}))

const byPath = new Map(DEMO_ARTWORK.map((piece) => [`/${piece.src}`, piece]))

export function demoArtworkFor(image) {
  const raw = typeof image === 'string' ? image : image?.url
  // Exact local allowlist, not a suffix match on arbitrary remote URLs.
  return byPath.get(resolveAssetPath(raw, '/')) || null
}

export function demoResponsiveProps(image, base) {
  const piece = demoArtworkFor(image)
  if (!piece) return {}
  return {
    srcSet: `${resolveAssetPath(piece.thumbnail, base)} 384w, ${resolveAssetPath(piece.src, base)} 1024w`,
    width: 1024,
    height: 1536,
  }
}
