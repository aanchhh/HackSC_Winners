import { Router } from 'express'
import axios from 'axios'
import { buildings, listings, zones } from '../data.js'
import { zoneCheck } from '../services/zones.js'
import { commute } from '../services/commute.js'
import { trueCost } from '../services/cost.js'
import { fitScore } from '../services/score.js'
import { config } from '../config.js'

export const publicRouter = Router()

publicRouter.get('/zones', (_req, res) => res.json(zones))
publicRouter.get('/buildings', (_req, res) => res.json(buildings))

publicRouter.get('/listings', (req, res) => {
  const maxRent = req.query.maxRent ? Number(req.query.maxRent) : Infinity
  const inFryft = req.query.inFryft === 'true' ? true : undefined
  const out = listings
    .filter((l) => l.rent <= maxRent)
    .map((l) => ({ ...l, ...zoneCheck(l.lat, l.lng) }))
    .filter((l) => inFryft === undefined || l.inFryft === inFryft)
  res.json(out)
})

publicRouter.get('/listings/:id/report', async (req, res) => {
  const listing = listings.find((l) => l.id === Number(req.params.id))
  if (!listing) return res.status(404).json({ error: 'not found' })
  const ids = String(req.query.buildings ?? '').split(',').filter(Boolean).map(Number)
  const targets = ids.length ? buildings.filter((b) => ids.includes(b.id)) : buildings.slice(0, 2)
  const lateNights = Number(req.query.lateNights ?? 2)

  const zonesRes = zoneCheck(listing.lat, listing.lng)
  const commuteRes = await commute(listing, targets) // TODO: read from listing_cache
  const cost = trueCost(listing, { lateNights })
  let block = { summary: 'Block summary unavailable (AI service offline).', incidents6mo: {}, citations: [] as unknown[] }
  try {
    const { data } = await axios.get(`${config.aiServiceUrl}/ai/neighborhood`, {
      params: { lat: listing.lat, lng: listing.lng }, headers: { 'X-Internal-Key': config.internalKey }, timeout: 8000,
    })
    block = data
  } catch { /* Report Card still works without the AI service */ }

  const worst = Math.max(...commuteRes.map((c) => c.walk))
  res.json({
    listing, zones: zonesRes, commute: commuteRes, block, cost,
    fitScore: fitScore({ total: cost.total, budget: 1500, maxCommuteMin: 30, worstCommuteMin: worst, inFryft: zonesRes.inFryft, inDps: zonesRes.inDps, incidentsNorm: 0 }),
  })
})
