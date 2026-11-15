import { Router } from 'express'
import axios from 'axios'
import { buildings, getListing, getListings, listingsMeta, zones } from '../data.js'
import { zoneCheck } from '../services/zones.js'
import { commute } from '../services/commute.js'
import { COST_DEFAULTS, costLines, trueCost } from '../services/cost.js'
import { DEFAULT_WEIGHTS, fitBreakdown, type Weights } from '../services/score.js'
import { blockPoints, incidentMeta, incidentsNear, recency, safetyResources, summarize } from '../services/safety.js'
import { route, streetArt } from '../services/route.js'
import { reversePlace, searchPlaces } from '../services/places.js'
import { addReport, dpsAlerts, recentNear, recentReports } from '../services/recent.js'
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

// Places anywhere in LA County (Photon/OpenStreetMap): suggestions as you type, reverse lookup, and a one-shot geocode.
publicRouter.get('/places', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.json([])
  const near = String(req.query.near ?? '').split(',').map(Number)
  res.json(await searchPlaces(q, near.length === 2 && near.every(Number.isFinite) ? (near as [number, number]) : undefined, req.query.final === '1'))
})

publicRouter.get('/places/reverse', async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng required' })
  res.json(await reversePlace(lat, lng))
})

publicRouter.get('/geocode', async (req, res) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) return res.status(400).json({ error: 'q required' })
  const hit = (await searchPlaces(q, undefined, true))[0]
  if (!hit) return res.status(404).json({ error: 'No place found in the LA area. Try a street address or landmark.' })
  res.json({ lat: hit.lat, lng: hit.lng, label: [hit.label, hit.detail].filter(Boolean).join(', '), ...zoneCheck(hit.lat, hit.lng) })
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
  const perPerson = { people, total: cost.rent == null ? null : Math.round((cost.rent + cost.utilities) / people + cost.transit + cost.rideshare) }
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

// Free & Safe directory (search lives in ai-service; it embeds the programs for meaning-based search)
publicRouter.get('/free/search', async (req, res) => {
  try { res.json((await ai.get('/ai/free/search', { params: req.query, timeout: 30000 })).data) }
  catch { res.status(503).json({ error: 'Free & Safe search is unavailable (AI service offline).' }) }
})
publicRouter.get('/free/alerts', async (req, res) => {
  try { res.json((await ai.get('/ai/free/alerts', { params: req.query, timeout: 15000 })).data) } catch { res.json([]) }
})
publicRouter.get('/free/trip', async (req, res) => {
  try { res.json((await ai.get('/ai/free/trip', { params: req.query, timeout: 15000 })).data) }
  catch { res.status(503).json({ error: 'Trip options unavailable' }) }
})
publicRouter.get('/free/upcoming', async (req, res) => {
  try { res.json((await ai.get('/ai/free/upcoming', { params: req.query, timeout: 15000 })).data) }
  catch { res.json([]) }
})

publicRouter.get('/streets/art', (_req, res) => { res.set('Cache-Control', 'public, max-age=86400'); res.json(streetArt()) })

// ---------- last-24h checks ----------
publicRouter.get('/recent', (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'lat and lng required' })
  res.json(recentNear([lat, lng], Math.min(Number(req.query.radius ?? 500), 2000), Math.min(Number(req.query.hours ?? 24), 24 * 14)))
})
publicRouter.get('/dps-alerts', (_req, res) => res.json(dpsAlerts()))
publicRouter.get('/reports', (req, res) => res.json(recentReports(Math.min(Number(req.query.hours ?? 72), 168))))
publicRouter.post('/reports', (req, res) => {
  const b = req.body ?? {}
  const lat = Number(b.lat), lng = Number(b.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !b.category) return res.status(400).json({ error: 'lat, lng and category required' })
  res.json(addReport({ lat, lng, category: String(b.category).slice(0, 40), description: String(b.description ?? ''), userId: String(b.userId ?? 'anon') }))
})

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
