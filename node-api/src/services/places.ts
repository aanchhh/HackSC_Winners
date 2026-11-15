// Place search for all of LA County: as-you-type suggestions + reverse geocoding.
// Uses Photon (photon.komoot.io, OpenStreetMap data), which is built for autocomplete; Nominatim's policy forbids that.
// Results are cached; USC-specific aliases (HSC, Keck, UPC…) are always offered first.
import axios from 'axios'
import { zoneCheck } from './zones.js'

export interface PlaceHit { label: string; detail: string; lat: number; lng: number; kind: string; inDps: boolean }

const LA_BBOX = '-118.95,33.70,-117.65,34.35'          // LA County-ish
const USC: [number, number] = [34.0224, -118.2851]
const UA = { 'User-Agent': 'TrojanScout/0.1 (USC student hackathon project)' }
const cache = new Map<string, PlaceHit[]>()

const ALIASES: { match: RegExp; hit: Omit<PlaceHit, 'inDps'> }[] = [
  { match: /\b(hsc|health ?sciences?|usc health|keck school)\b/i, hit: { label: 'USC Health Sciences Campus', detail: '1975 Zonal Ave, Los Angeles', lat: 34.0607, lng: -118.2090, kind: 'university' } },
  { match: /\bkeck (hospital|medical)\b/i, hit: { label: 'Keck Hospital of USC', detail: '1500 San Pablo St, Los Angeles', lat: 34.0627, lng: -118.2019, kind: 'hospital' } },
  { match: /\b(upc|usc main campus|university park campus|usc campus)\b/i, hit: { label: 'USC University Park Campus', detail: 'Tommy Trojan, Los Angeles', lat: 34.0206, lng: -118.2854, kind: 'university' } },
  { match: /\busc village\b/i, hit: { label: 'USC Village', detail: '3201 S Hoover St, Los Angeles', lat: 34.0256, lng: -118.2853, kind: 'retail' } },
  { match: /\b(lax|airport)\b/i, hit: { label: 'LAX Airport', detail: '1 World Way, Los Angeles', lat: 33.9416, lng: -118.4085, kind: 'aerodrome' } },
]

function label(p: Record<string, string | undefined>) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ')
  const name = p.name ?? street ?? 'Place'
  const detail = [p.name && street ? street : null, p.district ?? p.locality, p.city].filter(Boolean).join(', ')
  return { label: name || street, detail }
}

export async function searchPlaces(q: string, near: [number, number] = USC): Promise<PlaceHit[]> {
  const key = `${q.toLowerCase().trim()}|${near.map((x) => x.toFixed(2)).join(',')}`
  if (cache.has(key)) return cache.get(key)!
  const aliases = ALIASES.filter((a) => a.match.test(q)).map((a) => ({ ...a.hit, ...zoneCheck(a.hit.lat, a.hit.lng) }))
  let hits: PlaceHit[] = []
  try {
    const { data } = await axios.get('https://photon.komoot.io/api/', {
      params: { q, lat: near[0], lon: near[1], limit: 8, bbox: LA_BBOX, lang: 'en' }, headers: UA, timeout: 6000,
    })
    hits = (data.features ?? []).map((f: { properties: Record<string, string>; geometry: { coordinates: [number, number] } }, i: number) => {
      const [lng, lat] = f.geometry.coordinates
      // Re-rank: Photon's text rank + distance from the bias point (so the Ralphs near USC beats the one in Cerritos)
      const km = Math.hypot((lat - near[0]) * 111, (lng - near[1]) * 92)
      return { ...label(f.properties), lat, lng, kind: f.properties.osm_value ?? '', inDps: zoneCheck(lat, lng).inDps, _score: i + km / 6 }
    }).sort((a: { _score: number }, b: { _score: number }) => a._score - b._score)
      .map(({ _score, ...h }: { _score: number } & PlaceHit) => h)  // eslint-disable-line @typescript-eslint/no-unused-vars
  } catch { /* fall through with aliases only */ }
  const seen = new Set<string>()
  const out = [...aliases, ...hits].filter((h) => {
    const k = `${h.label}|${h.lat.toFixed(3)},${h.lng.toFixed(3)}`
    if (seen.has(k)) return false
    seen.add(k); return true
  }).slice(0, 6) as PlaceHit[]
  cache.set(key, out)
  return out
}

export async function reversePlace(lat: number, lng: number): Promise<PlaceHit> {
  const key = `rev|${lat.toFixed(4)},${lng.toFixed(4)}`
  if (cache.has(key)) return cache.get(key)![0]
  let hit: PlaceHit = { label: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, detail: 'Dropped pin', lat, lng, kind: 'pin', inDps: zoneCheck(lat, lng).inDps }
  try {
    const { data } = await axios.get('https://photon.komoot.io/reverse', { params: { lat, lon: lng, limit: 1, lang: 'en' }, headers: UA, timeout: 6000 })
    const f = data.features?.[0]
    if (f) hit = { ...label(f.properties), lat, lng, kind: f.properties.osm_value ?? '', inDps: hit.inDps }
  } catch { /* keep coordinates label */ }
  cache.set(key, [hit])
  return hit
}
