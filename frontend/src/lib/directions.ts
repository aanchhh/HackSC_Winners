// Google Maps "Directions" deep links (Maps URLs API: no key needed, opens the app on phones).
// For our computed routes we pass up to 8 evenly spaced waypoints so Google follows the same streets
// (e.g. the safest route) instead of re-routing along its own fastest path.
type P = [number, number]
type Mode = 'walking' | 'driving' | 'bicycling' | 'transit'

const fmt = (p: P) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`

export function sampleWaypoints(coords: P[], max = 8): P[] {
  if (coords.length <= 2) return []
  const inner = coords.slice(1, -1)
  if (inner.length <= max) return inner
  return Array.from({ length: max }, (_, i) => inner[Math.round(((i + 1) * inner.length) / (max + 1))])
}

export function googleMapsDirections(origin: P, destination: P, mode: Mode = 'walking', waypoints: P[] = []) {
  const u = new URL('https://www.google.com/maps/dir/')
  u.searchParams.set('api', '1')
  u.searchParams.set('origin', fmt(origin))
  u.searchParams.set('destination', fmt(destination))
  u.searchParams.set('travelmode', mode)
  if (waypoints.length) u.searchParams.set('waypoints', waypoints.map(fmt).join('|'))
  return u.toString()
}

/** Directions for one of our computed routes (keeps the same path via waypoints). */
export function googleMapsForRoute(coords: P[], mode: Mode = 'walking') {
  return googleMapsDirections(coords[0], coords[coords.length - 1], mode, sampleWaypoints(coords))
}

export interface UberStop { lat: number; lng: number; label: string }

/** Uber web booking link with pickup, intermediate stops and the final drop-off already filled in.
 *  (The older m.uber.com/ul link only prefills inside the phone app; this one also works on desktop.)
 *  Verified: Uber shows "pickup → destination" with the stops; you log in to see prices and confirm. */
export function uberLink(pickup: UberStop, ...stops: UberStop[]) {
  const place = (p: UberStop) => JSON.stringify({ addressLine1: p.label.split(',')[0], addressLine2: p.label.split(',').slice(1).join(',').trim() || 'Los Angeles, CA', latitude: p.lat, longitude: p.lng })
  const u = new URL('https://m.uber.com/go/product-selection')
  u.searchParams.set('pickup', place(pickup))
  stops.slice(0, 4).forEach((s, i) => u.searchParams.set(`drop[${i}]`, place(s)))
  return u.toString()
}
