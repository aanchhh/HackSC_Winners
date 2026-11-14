import * as turf from '@turf/turf'
import { zones } from '../data.js'

const find = (name: string) => zones.features.find((f) => f.properties?.name === name)

export function zoneCheck(lat: number, lng: number) {
  const pt = turf.point([lng, lat])
  const dps = find('DPS'), fryft = find('Fryft')
  const inDps = dps ? turf.booleanPointInPolygon(pt, dps) : false
  const inFryft = fryft ? turf.booleanPointInPolygon(pt, fryft) : false
  let metersToFryftEdge = 0
  if (fryft) {
    const line = turf.polygonToLine(fryft)
    const lineFeature = line.type === 'FeatureCollection' ? line.features[0] : line
    metersToFryftEdge = Math.round(turf.pointToLineDistance(pt, lineFeature as any, { units: 'meters' }))
  }
  return { inDps, inFryft, metersToFryftEdge }
}
