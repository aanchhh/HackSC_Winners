import { Router } from 'express'
import { z } from 'zod'
import { bus, cancelRequest, createRequest, FARE, requestJoin, respondJoin, soloQuote, stateFor } from '../services/rides.js'

export const ridesRouter = Router()

const Place = z.object({ lat: z.number(), lng: z.number(), label: z.string().max(120) })
const User = z.string().min(6).max(40)

// Live state for one browser (its requests, matches, incoming join requests, the public board, activity).
ridesRouter.get('/stream', (req, res) => {
  const userId = User.parse(req.query.userId)
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
  res.flushHeaders()
  let queued = false
  const send = () => {
    if (queued) return
    queued = true
    setTimeout(() => { queued = false; res.write('event: state\ndata: ' + JSON.stringify(stateFor(userId)) + '\n\n') }, 150)  // coalesce bursts
  }
  send()
  bus.on('change', send)
  const tick = setInterval(send, 10_000)  // keeps "departs in" fresh + keepalive
  req.on('close', () => { bus.off('change', send); clearInterval(tick) })
})

ridesRouter.get('/quote', (req, res) => {
  const p = String(req.query.pickup ?? '').split(',').map(Number), d = String(req.query.drop ?? '').split(',').map(Number)
  if (p.length !== 2 || d.length !== 2 || [...p, ...d].some((x) => !Number.isFinite(x))) return res.status(400).json({ error: 'pickup=lat,lng&drop=lat,lng' })
  res.json({ ...soloQuote(p as [number, number], d as [number, number]), pricing: FARE })
})

ridesRouter.post('/', (req, res) => {
  const b = z.object({ userId: User, name: z.string().max(30), pickup: Place, drop: Place, departAt: z.number().optional(), seats: z.number().int().min(1).max(2).optional() }).parse(req.body)
  res.json(createRequest(b))
})

ridesRouter.delete('/:id', (req, res) => {
  res.json({ ok: cancelRequest(req.params.id, User.parse(req.query.userId)) })
})

ridesRouter.post('/:id/join', (req, res) => {
  const b = z.object({ userId: User, myRequestId: z.string() }).parse(req.body)
  try { res.json(requestJoin(b.myRequestId, req.params.id, b.userId)) } catch (e) { res.status(409).json({ error: (e as Error).message }) }
})

ridesRouter.post('/joins/:joinId', (req, res) => {
  const b = z.object({ userId: User, accept: z.boolean() }).parse(req.body)
  res.json({ ok: respondJoin(req.params.joinId, b.accept, b.userId) })
})
