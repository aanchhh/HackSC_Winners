import { Router } from 'express'
import axios from 'axios'
import { buildings, getListing, getListings, listingsMeta, zones } from '../data.js'
import { zoneCheck } from '../services/zones.js'
import { commute } from '../services/commute.js'
import { COST_DEFAULTS, costLines, trueCost } from '../services/cost.js'
import { DEFAULT_WEIGHTS, fitBreakdown, type Weights } from '../services/score.js'
import { blockPoints, incidentMeta, incidentsNear, recency, safetyResources, summarize } from '../services/safety.js'
import { route, streetArt } from '../services/route.js'
import { dpsPositions } from '../services/dpsUnits.js'
import { config } from '../config.js'

export const publicRouter = Router()
const ai = axios.create({ baseURL: config.aiServiceUrl, headers: { 'X-Internal-Key': config.internalKey }, timeout: 15000 })
const bool = (v: unknown) => (v === 'true' ? true : v === 'false' ? false : undefined)

publicRouter.get('/zones', (_req, res) => res.json(zones))
publicRouter.get('/buildings', (_req, res) => res.json(buildings))

publicRouter.get('/zone-check', (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng required' })
  res.json(zoneCheck(lat, lng))
})

publicRouter.get('/meta', (_req, res) => {
  const m = listingsMeta()
  const withZones = m.listings.map((l) => zoneCheck(l.lat, l.lng))
  res.json({
    count: m.listings.length, scrapedAt: m.scrapedAt, sources: m.sources,
    inDps: withZones.filter((z) => z.inDps).length, inFryft: withZones.filter((z) => z.inFryft).length,
    medianRent: (() => { const r = m.listings.map((l) => l.rent).filter((x): x is number => x != null).sort((a, b) => a - b); return r[Math.floor(r.length / 2)] ?? null })(),
  })
})

publicRouter.get('/listings', (req, res) => {
  const maxRent = req.query.maxRent ? Number(req.query.maxRent) : Infinity
  const inFryft = bool(req.query.inFryft), inDps = bool(req.query.inDps)
  const source = req.query.source ? String(req.query.source).toLowerCase() : undefined
  res.json(getListings()
    .filter((l) => maxRent === Infinity || (l.rent != null && l.rent <= maxRent))
    .filter((l) => !source || l.source.toLowerCase() === source)
    .map((l) => ({ ...l, ...zoneCheck(l.lat, l.lng) }))
    .filter((l) => (inFryft === undefined || l.inFryft === inFryft) && (inDps === undefined || l.inDps === inDps)))
})

// Hybrid (FAISS + BM25 + rerank) search lives in the AI service
publicRouter.get('/search', async (req, res) => {
  try {
    const { data } = await ai.get('/ai/listings/search', { params: req.query, timeout: 30000 })
    res.json({ ...data, results: data.results.map((l: { lat: number; lng: number }) => ({ ...l, ...zoneCheck(l.lat, l.lng) })) })
  } catch {
    res.status(503).json({ error: 'Search is unavailable (AI service offline).' })
  }
})

publicRouter.post('/refresh', async (_req, res) => {
  try { res.json((await ai.post('/ai/listings/refresh', null, { timeout: 300000 })).data) }
  catch { res.status(503).json({ error: 'AI service offline' }) }
})

// True Cost calculator: a listing (optionally one of its floorplans) or custom numbers. Returns every line with its formula.
publicRouter.post('/true-cost', (req, res) => {
  const b = req.body ?? {}
  const l = b.listingId ? getListing(String(b.listingId)) : undefined
  const unit = l?.units?.find((u) => u.label === b.unitLabel)
  const rent = b.rent != null ? Number(b.rent) : unit?.rent ?? l?.rent ?? 0
  const utilities = b.utilities != null ? Number(b.utilities)
    : unit ? (unit.roomType === 'entire' ? 60 + 30 * Math.max(unit.beds ?? 1, 1) : 75) : l?.utilitiesEst ?? 90
  const inFryft = l && b.inFryft == null ? zoneCheck(l.lat, l.lng).inFryft : Boolean(b.inFryft)
  const priceUnit = unit ? (unit.roomType === 'entire' ? 'per unit' : 'per room') : l?.priceUnit ?? 'per unit'
  const c = costLines({ rent, utilities, inFryft, lateNights: Number(b.lateNights ?? 2), needsMetro: Boolean(b.needsMetro), roommates: Number(b.roommates ?? 1), priceUnit })
  res.json({ ...c, inputs: { rent, utilities, inFryft, priceUnit, unit: unit ?? null }, defaults: COST_DEFAULTS, listing: l ?? null })
})

// Address → coordinates for the landing-page zone checker (Nominatim, cached, LA only)
const geoCache = new Map<string, unknown>()
publicRouter.get('/geocode', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 3) return res.status(400).json({ error: 'q required' })
  if (geoCache.has(q)) return res.json(geoCache.get(q))
  try {
    const { data } = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: /los angeles|, ca\b/i.test(q) ? q : `${q}, Los Angeles, CA`, format: 'json', limit: 1, viewbox: '-118.35,34.06,-118.24,33.99', bounded: 1 },
      headers: { 'User-Agent': 'TrojanScout/0.1 (USC student hackathon project)' }, timeout: 8000,
    })
    const hit = data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon), label: data[0].display_name } : null
    const out = hit ? { ...hit, ...zoneCheck(hit.lat, hit.lng) } : { error: 'Address not found near USC' }
    geoCache.set(q, out)
    res.status(hit ? 200 : 404).json(out)
  } catch { res.status(503).json({ error: 'Geocoder unavailable' }) }
})

// Weighted incidents within 150 m, normalized by the 90th percentile across listings (for the fit score)
const incidentLoad = (lat: number, lng: number) =>
  incidentsNear([lat, lng], 150, { days: 183 }).reduce((sum, i) => sum + i.severity * recency(i.date), 0)
let loadP90: number | null = null
function incidentsNorm(lat: number, lng: number) {
  if (loadP90 === null) {
    const xs = getListings().map((l) => incidentLoad(l.lat, l.lng)).sort((a, b) => a - b)
    loadP90 = xs[Math.floor(xs.length * 0.9)] || 1
  }
  return Math.min(1, incidentLoad(lat, lng) / loadP90)
}

function weightsFrom(q: Record<string, unknown>): Weights {
  const n = (k: keyof Weights) => (q[`w_${k}`] != null ? Number(q[`w_${k}`]) : DEFAULT_WEIGHTS[k])
  return { cost: n('cost'), commute: n('commute'), zone: n('zone'), incidents: n('incidents') }
}

publicRouter.get('/listings/:id/report', async (req, res) => {
  const listing = getListing(req.params.id)
  if (!listing) return res.status(404).json({ error: 'not found' })
  const ids = String(req.query.buildings ?? '').split(',').filter(Boolean).map(Number)
  const targets = ids.length ? buildings.filter((b) => ids.includes(b.id)) : buildings.slice(0, 2)
  const lateNights = Number(req.query.lateNights ?? 2)
  const budget = Number(req.query.budget ?? 1500)

  const zonesRes = zoneCheck(listing.lat, listing.lng)
  const commuteRes = await commute(listing, targets)
  const cost = trueCost(listing, { lateNights })
  const facts = summarize(incidentsNear([listing.lat, listing.lng], 150, { days: 183 }))
  const top = Object.entries(facts.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${v} ${k}`).join(', ')
  let block = {
    summary: facts.total
      ? `${facts.total} incidents reported to LAPD within 150 m in the last 6 months (${top}).`
      : 'No incidents reported to LAPD within 150 m in the last 6 months.',
    incidents6mo: facts.byCategory,
    citations: [{ n: 1, source: incidentMeta.source, date: incidentMeta.fetchedAt?.slice(0, 10) ?? '', url: 'https://data.lacity.org/' }] as unknown[],
  }
  try {
    const ai = (await axios.get(`${config.aiServiceUrl}/ai/neighborhood`, { params: { lat: listing.lat, lng: listing.lng }, headers: { 'X-Internal-Key': config.internalKey }, timeout: 8000 })).data
    if (ai?.summary && !/insufficient|unavailable|mock/i.test(ai.summary)) block = { ...ai, incidents6mo: facts.byCategory }
  } catch { /* LAPD facts above are enough */ }

  const longestWalkMin = Math.max(...commuteRes.map((c) => c.walk))
  // A whole multi-bedroom unit is shared: compare each person's share with the (per-person) budget.
  const people = listing.priceUnit === 'per unit' && (listing.beds ?? 0) >= 2 ? (listing.beds as number) : 1
  const perPerson = { people, total: Math.round((cost.rent + cost.utilities) / people + cost.transit + cost.rideshare) }
  const fit = fitBreakdown({ total: perPerson.total, budget, longestWalkMin, inFryft: zonesRes.inFryft, inDps: zonesRes.inDps, incidentsNorm: incidentsNorm(listing.lat, listing.lng) }, weightsFrom(req.query))
  res.json({ listing, zones: zonesRes, commute: commuteRes, longestWalkMin, block, cost, perPerson, fitScore: fit.score, fit, incidentFacts: facts })
})

// ---------- Safety ----------
publicRouter.get('/route', (req, res) => {
  const p = (s: unknown) => String(s ?? '').split(',').map(Number) as [number, number]
  const from = p(req.query.from), to = p(req.query.to)
  if (from.length !== 2 || to.length !== 2 || [...from, ...to].some((x) => !Number.isFinite(x))) return res.status(400).json({ error: 'from=lat,lng&to=lat,lng required' })
  try { res.json(route(from, to, req.query.night === 'true')) } catch (e) { res.status(422).json({ error: (e as Error).message }) }
})

publicRouter.get('/incidents', (req, res) => {
  const days = Math.min(Number(req.query.days ?? 180), 365)
  res.json({ ...incidentMeta, days, points: blockPoints(days) })
})

publicRouter.get('/streets/art', (_req, res) => { res.set('Cache-Control', 'public, max-age=86400'); res.json(streetArt()) })

publicRouter.get('/safety-resources', (_req, res) => res.json(safetyResources))

publicRouter.get('/dps-units', (_req, res) => res.json({ simulated: true, updatedAt: new Date().toISOString(), units: dpsPositions() }))

publicRouter.get('/dps-units/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  const send = () => res.write('event: units\ndata: ' + JSON.stringify({ simulated: true, units: dpsPositions() }) + '\n\n')
  send()
  const t = setInterval(send, 2000)
  req.on('close', () => clearInterval(t))
})
