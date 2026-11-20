import { NEARBY_RADIUS_MILES } from './guestSpots'

// How far "nearby soon" reaches. A device-local preference, not synced: the
// Plan page's section and its per-idea chips read the same value.
const RADIUS_KEY = 'tattoo_nearby_radius'
export const NEARBY_RADII = [50, 100, 200, 400]

export function readNearbyRadius() {
  try {
    const value = Number(localStorage.getItem(RADIUS_KEY))
    return NEARBY_RADII.includes(value) ? value : NEARBY_RADIUS_MILES
  } catch {
    return NEARBY_RADIUS_MILES
  }
}

export function saveNearbyRadius(value) {
  try { localStorage.setItem(RADIUS_KEY, String(value)) } catch { /* private mode: keep it for this visit */ }
}
