import { zoneCheck } from './zones.js'
import type { Listing } from '../data.js'

export interface Profile { budget: number; buildingIds: number[]; lateNights: number; priorities: Record<string, number> }

export const COST_DEFAULTS = { metroPass: 43, baseFare: 3.5, perMile: 1.5, avgMiles: 2, weeksPerMonth: 4.3 }

// rent + utilities + (needsMetro ? metro : 0) + (outsideFryft ? lateNights × 4.3 × fare : 0)
export function trueCost(listing: Pick<Listing, 'rent' | 'utilitiesEst' | 'lat' | 'lng' | 'priceUnit'>,
                         profile: Pick<Profile, 'lateNights'>, needsMetro = false, inFryftOverride?: boolean) {
  const inFryft = inFryftOverride ?? zoneCheck(listing.lat, listing.lng).inFryft
  const d = COST_DEFAULTS
  const fare = d.baseFare + d.perMile * d.avgMiles
  const rideshare = inFryft ? 0 : Math.round(profile.lateNights * d.weeksPerMonth * fare)
  const transit = needsMetro ? d.metroPass : 0
  const rent = listing.rent ?? 0
  return {
    rent, utilities: listing.utilitiesEst, transit, rideshare,
    total: rent + listing.utilitiesEst + transit + rideshare,
    assumptions: [
      `${profile.lateNights} late nights/week`, `~$${fare.toFixed(2)} per ride`,
      inFryft ? 'inside Fryft: late rides free' : 'outside Fryft: you pay for late rides',
      `utilities estimated at $${listing.utilitiesEst}`, `rent is ${listing.priceUnit}`,
      ...(listing.rent == null ? ['rent not published (call for pricing)'] : []),
    ],
  }
}
