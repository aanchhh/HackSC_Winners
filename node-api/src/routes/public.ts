import { Router } from 'express'
import axios from 'axios'
import { buildings, getListing, getListings, listingsMeta, zones } from '../data.js'
import { zoneCheck } from '../services/zones.js'
import { commute } from '../services/commute.js'
import { COST_DEFAULTS, trueCost } from '../services/cost.js'
import { fitScore } from '../services/score.js'
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
    const { data } = await ai.get('/ai/listings/search', { params: req.query })
    res.json({ ...data, results: data.results.map((l: { lat: number; lng: number }) => ({ ...l, ...zoneCheck(l.lat, l.lng) })) })
  } catch {
    res.status(503).json({ error: 'Search is unavailable (AI service offline).' })
  }
})

publicRouter.post('/refresh', async (_req, res) => {
  try { res.json((await ai.post('/ai/listings/refresh', null, { timeout: 300000 })).data) }
  catch { res.status(503).json({ error: 'AI service offline' }) }
})

// True Cost calculator: either a listing, or a custom rent/utilities/zone
publicRouter.post('/true-cost', (req, res) => {
  const b = req.body ?? {}
  const lateNights = Number(b.lateNights ?? 2), needsMetro = Boolean(b.needsMetro)
  const l = b.listingId ? getListing(String(b.listingId)) : undefined
  const base = l ?? { rent: Number(b.rent ?? 0), utilitiesEst: Number(b.utilities ?? 90), lat: 0, lng: 0, priceUnit: 'per unit' }
  if (l && b.utilities != null) base.utilitiesEst = Number(b.utilities)
  const inFryft = l ? undefined : Boolean(b.inFryft)
  res.json({ ...trueCost(base, { lateNights }, needsMetro, inFryft), defaults: COST_DEFAULTS, listing: l ?? null })
})

publicRouter.get('/listings/:id/report', async (req, res) => {
  const listing = getListing(req.params.id)
  if (!listing) return res.status(404).json({ error: 'not found' })
  const ids = String(req.query.buildings ?? '').split(',').filter(Boolean).map(Number)
  const targets = ids.length ? buildings.filter((b) => ids.includes(b.id)) : buildings.slice(0, 2)
  const lateNights = Number(req.query.lateNights ?? 2)
  const budget = Number(req.query.budget ?? 1500)

  const zonesRes = zoneCheck(listing.lat, listing.lng)
  const commuteRes = await commute(listing, targets) // TODO(Prasham): read from listing_cache
  const cost = trueCost(listing, { lateNights })
  let block = { summary: 'Block summary unavailable (AI service offline).', incidents6mo: {}, citations: [] as unknown[] }
  try { block = (await ai.get('/ai/neighborhood', { params: { lat: listing.lat, lng: listing.lng }, timeout: 8000 })).data } catch { /* still render */ }

  const worst = Math.max(...commuteRes.map((c) => c.walk))
  res.json({
    listing, zones: zonesRes, commute: commuteRes, block, cost,
    fitScore: fitScore({ total: cost.total, budget, maxCommuteMin: 30, worstCommuteMin: worst, inFryft: zonesRes.inFryft, inDps: zonesRes.inDps, incidentsNorm: 0 }),
  })
})
