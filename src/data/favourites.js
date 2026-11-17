import { keyForUrl } from './blobUrls'
import { refIdentity, refKey } from './imageRef'
import { randomId } from './randomId'

// Favourite photos (#220 K): { id, image, addedAt }. `image` is the same stored
// ref the photo has on the wall — { key } or a static path — so a favourite
// survives a photo being given an artist (the ref does not change). The record
// id is random; refIdentity is only ever computed at runtime to match.

const NOT_STORABLE = /(?:^(?:data:|blob:))|(?:\/storage\/v1\/object\/)/i

// The ref to persist for a photo, or null when it is not stored yet (inline
// data, a local blob, an expiring display URL): the heart is disabled then.
export function favouriteRef(image) {
  const url = typeof image === 'string' ? image : image?.url
  const key = refKey(image) || (typeof url === 'string' ? keyForUrl(url) : '')
  if (key) return { key }
  if (typeof url !== 'string' || !url || NOT_STORABLE.test(url)) return null
  return url
}

export function favouriteIdentities(favourites = []) {
  const ids = new Set()
  for (const record of favourites) {
    const id = refIdentity(record?.image)
    if (id) ids.add(id)
  }
  return ids
}

export function isFavourite(favourites, image) {
  const id = refIdentity(image)
  return id !== null && favouriteIdentities(favourites).has(id)
}

export function toggleFavourite(favourites = [], image, now = new Date().toISOString()) {
  const id = refIdentity(image)
  if (id === null) return favourites
  if (favouriteIdentities(favourites).has(id)) {
    return favourites.filter((record) => refIdentity(record?.image) !== id)
  }
  const ref = favouriteRef(image)
  if (!ref) return favourites
  return [...favourites, { id: randomId(), image: ref, addedAt: now }]
}
