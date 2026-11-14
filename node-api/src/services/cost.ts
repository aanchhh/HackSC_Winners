import { zoneCheck } from './zones.js'
import type { Listing } from '../data.js'

export interface Profile { budget: number; buildingIds: number[]; lateNights: number; priorities: Record<string, number> }

const METRO_PASS = 0      // TODO(Prasham): USC U-Pass price if needed
const BASE_FARE = 3.5, PER_MILE = 1.5, AVG_MILES = 2

// rent + utilities + (needsMetro ? metro : 0) + (outsideFryft ? lateNights × 4.3 × fare : 0)
export function trueCost(listing: Listing, profile: Pick<Profile, 'lateNights'>, needsMetro = false) {
  const { inFryft } = zoneCheck(listing.lat, listing.lng)
  const fare = BASE_FARE + PER_MILE * AVG_MILES
  const rideshare = inFryft ? 0 : Math.round(profile.lateNights * 4.3 * fare)
  const transit = needsMetro ? METRO_PASS : 0
  const utilities = listing.utilities_est
  return {
    rent: listing.rent, utilities, transit, rideshare,
    total: listing.rent + utilities + transit + rideshare,
    assumptions: [`${profile.lateNights} late nights/week`, `~$${fare.toFixed(2)} per ride`, inFryft ? 'inside Fryft: rides free' : 'outside Fryft'],
  }
}
