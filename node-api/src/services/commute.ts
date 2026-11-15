import axios from 'axios'
import * as turf from '@turf/turf'
import { config } from '../config.js'
import type { Building, Listing } from '../data.js'

const TRAM_RIDE_MIN = 6 // TODO(Prasham): calibrate from USC tram schedule

// TODO(Prasham): nearest tram stop + walk legs. Never call ORS live during the demo — use listing_cache.
async function orsMinutes(profile: 'foot-walking' | 'cycling-regular', from: [number, number], to: [number, number]) {
  const { data } = await axios.post(
    `https://api.openrouteservice.org/v2/directions/${profile}`,
    { coordinates: [from, to] },
    { headers: { Authorization: config.orsApiKey } },
  )
  return Math.round(data.routes[0].summary.duration / 60)
}

export async function commute(listing: Pick<Listing, 'lat' | 'lng'>, targets: Building[]) {
  return Promise.all(targets.map(async (b) => {
    const from: [number, number] = [listing.lng, listing.lat], to: [number, number] = [b.lng, b.lat]
    if (config.orsApiKey) {
      const [walk, bike] = await Promise.all([orsMinutes('foot-walking', from, to), orsMinutes('cycling-regular', from, to)])
      return { building: b.name, walk, bike, tram: null as number | null }
    }
    // Fallback estimate: straight-line distance × 1.3 detour factor
    const km = turf.distance(from, to, { units: 'kilometers' }) * 1.3
    return { building: b.name, walk: Math.round((km / 5) * 60), bike: Math.round((km / 15) * 60), tram: Math.round((km / 5) * 30) + TRAM_RIDE_MIN }
  }))
}
