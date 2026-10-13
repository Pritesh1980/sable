import useImageSrc from '../hooks/useImageSrc'

// A stored image ref as a plain <img>, for the places that are not an artist
// photo and so don't want ArtistImage's monogram: `loading` shows while a blob
// key resolves, `fallback` when there is no image or it can't be fetched.
export default function RefImage({ src: imageRef, alt = '', fallback = null, loading = null, ...imgProps }) {
  const { src, status } = useImageSrc(imageRef)
  if (status === 'ready') return <img src={src} alt={alt} {...imgProps} />
  return status === 'loading' ? loading : fallback
}
