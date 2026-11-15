// Shared rides: real-time ride requests, route matching, fare splitting, and a demo-demand simulator.
// State is in memory (fine for a demo; move to Supabase for production). Every browser subscribes over SSE.
import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { meters, type LatLng } from './geo.js'

// ---------- pricing (UberX-style estimate for LA; shown as an estimate) ----------
export const FARE = { base: 1.25, perMile: 1.15, perMin: 0.3, bookingFee: 3.1, minFare: 8.5, mph: 18, roadFactor: 1.35 }
const roadMiles = (a: LatLng, b: LatLng) => (meters(a, b) * FARE.roadFactor) / 1609.34
const minutesFor = (mi: number) => (mi / FARE.mph) * 60
export function fareFor(mi: number) {
  return Math.max(FARE.minFare, FARE.base + FARE.bookingFee + FARE.perMile * mi + FARE.perMin * minutesFor(mi))
}
export function soloQuote(p: LatLng, d: LatLng) {
  const mi = roadMiles(p, d)
  return { miles: +mi.toFixed(2), minutes: Math.round(minutesFor(mi)), fare: +fareFor(mi).toFixed(2) }
}

// ---------- model ----------
export interface Place { lat: number; lng: number; label: string }
export interface RideRequest {
  id: string; userId: string; name: string; pickup: Place; drop: Place; departAt: number; seats: number
  createdAt: number; status: 'open' | 'matched' | 'cancelled' | 'expired'; demo: boolean; groupId?: string
}
export interface JoinRequest { id: string; fromRequestId: string; toRequestId: string; createdAt: number; status: 'pending' | 'accepted' | 'declined' }
export interface Group { id: string; requestIds: string[]; createdAt: number }

const requests = new Map<string, RideRequest>()
const joins = new Map<string, JoinRequest>()
const groups = new Map<string, Group>()
const activity: { at: number; text: string; demo: boolean }[] = []
export const bus = new EventEmitter()
bus.setMaxListeners(500)
const changed = () => bus.emit('change')
const log = (text: string, demo: boolean) => { activity.unshift({ at: Date.now(), text, demo }); activity.length = Math.min(activity.length, 25) }
const short = (label: string) => label.split(',')[0]

// ---------- matching ----------
type Stop = { kind: 'pickup' | 'drop'; req: RideRequest; p: LatLng }
const MAX_TIME_GAP_MS = 20 * 60e3
const MAX_SEATS = 4

/** Best stop order for a set of riders (pickup before own drop), with each rider's detour and fare share. */
export function planGroup(riders: RideRequest[]) {
  const stops: Stop[] = riders.flatMap((r) => [
    { kind: 'pickup' as const, req: r, p: [r.pickup.lat, r.pickup.lng] as LatLng },
    { kind: 'drop' as const, req: r, p: [r.drop.lat, r.drop.lng] as LatLng },
  ])
  let best: { order: Stop[]; miles: number } | null = null
  const perm = (done: Stop[], left: Stop[]) => {
    if (!left.length) {
      let mi = 0
      for (let i = 1; i < done.length; i++) mi += roadMiles(done[i - 1].p, done[i].p)
      if (!best || mi < best.miles) best = { order: [...done], miles: mi }
      return
    }
    for (let i = 0; i < left.length; i++) {
      const s = left[i]
      if (s.kind === 'drop' && !done.some((d) => d.kind === 'pickup' && d.req.id === s.req.id)) continue
      if (!done.length && s.kind !== 'pickup') continue
      perm([...done, s], [...left.slice(0, i), ...left.slice(i + 1)])
    }
  }
  perm([], stops)
  const plan = best as unknown as { order: Stop[]; miles: number }
  const totalFare = fareFor(plan.miles)
  const solo = riders.map((r) => soloQuote([r.pickup.lat, r.pickup.lng], [r.drop.lat, r.drop.lng]))
  const soloSum = solo.reduce((s, q) => s + q.fare, 0)
  const riderInfo = riders.map((r, k) => {
    const i0 = plan.order.findIndex((s) => s.kind === 'pickup' && s.req.id === r.id)
    const i1 = plan.order.findIndex((s) => s.kind === 'drop' && s.req.id === r.id)
    let inCar = 0
    for (let i = i0 + 1; i <= i1; i++) inCar += roadMiles(plan.order[i - 1].p, plan.order[i].p)
    const share = (totalFare * solo[k].fare) / soloSum
    return {
      requestId: r.id, solo: solo[k], share: +share.toFixed(2), saves: +(solo[k].fare - share).toFixed(2),
      savesPct: Math.round((1 - share / solo[k].fare) * 100), detourMin: Math.max(0, Math.round(minutesFor(inCar) - solo[k].minutes)),
    }
  })
  return {
    stops: plan.order.map((s) => ({ kind: s.kind, requestId: s.req.id, name: s.req.name, lat: s.p[0], lng: s.p[1], label: s.kind === 'pickup' ? s.req.pickup.label : s.req.drop.label })),
    miles: +plan.miles.toFixed(2), minutes: Math.round(minutesFor(plan.miles)), totalFare: +totalFare.toFixed(2), riders: riderInfo,
  }
}

function distToSegment(p: LatLng, a: LatLng, b: LatLng) {
  const k = Math.cos((a[0] * Math.PI) / 180)
  const [px, py, ax, ay, bx, by] = [p[1] * k, p[0], a[1] * k, a[0], b[1] * k, b[0]]
  const dx = bx - ax, dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0
  return meters(p, [ay + t * dy, (ax + t * dx) / k])
}

/** How another rider relates to my trip, in words. */
function relation(me: RideRequest, other: RideRequest) {
  const mp: LatLng = [me.pickup.lat, me.pickup.lng], md: LatLng = [me.drop.lat, me.drop.lng]
  const op: LatLng = [other.pickup.lat, other.pickup.lng], od: LatLng = [other.drop.lat, other.drop.lng]
  const pu = meters(mp, op), dr = meters(md, od)
  const tags: string[] = []
  if (pu <= 600) tags.push(`Pickup ${Math.round(pu / 10) * 10} m from yours`)
  else if (distToSegment(op, mp, md) <= 700) tags.push('Pickup on your way')
  else tags.push(`Pickup ${(pu / 1609).toFixed(1)} mi away`)
  if (dr <= 600) tags.push(`Drop ${Math.round(dr / 10) * 10} m from yours`)
  else if (distToSegment(od, mp, md) <= 700) tags.push('Drops off on your way')
  else if (distToSegment(md, op, od) <= 700) tags.push('Continues past your stop')
  else tags.push(`Drop ${(dr / 1609).toFixed(1)} mi from yours`)
  return { tags, pickupM: Math.round(pu), dropM: Math.round(dr) }
}

const ridersOf = (r: RideRequest) => (r.groupId ? groups.get(r.groupId)!.requestIds.map((id) => requests.get(id)!) : [r])

/** Compatible riders for one of my open requests: everyone saves money and nobody's detour is too long. */
export function matchesFor(me: RideRequest) {
  if (me.status !== 'open') return []
  const out = []
  for (const other of requests.values()) {
    if (other.userId === me.userId || !['open', 'matched'].includes(other.status)) continue
    if (Math.abs(other.departAt - me.departAt) > MAX_TIME_GAP_MS) continue
    const riders = [...ridersOf(other), me]
    if (riders.length > 3 || riders.reduce((s, r) => s + r.seats, 0) > MAX_SEATS) continue
    const plan = planGroup(riders)
    const ok = plan.riders.every((x) => x.saves > 0.5 && x.detourMin <= Math.max(6, Math.round(x.solo.minutes * 0.4)))
    if (!ok) continue
    const mine = plan.riders.find((x) => x.requestId === me.id)!
    out.push({
      requestId: other.id, name: other.name, demo: other.demo, groupSize: riders.length - 1,
      departAt: other.departAt, pickupArea: short(other.pickup.label), dropArea: short(other.drop.label),
      ...relation(me, other), you: mine, plan,
      pendingJoin: [...joins.values()].some((j) => j.fromRequestId === me.id && j.toRequestId === other.id && j.status === 'pending'),
    })
  }
  return out.sort((a, b) => b.you.saves - a.you.saves).slice(0, 12)
}

// ---------- mutations ----------
export function createRequest(b: { userId: string; name: string; pickup: Place; drop: Place; departAt?: number; seats?: number }, demo = false) {
  const r: RideRequest = {
    id: randomUUID().slice(0, 8), userId: b.userId, name: b.name.slice(0, 30) || 'Trojan', pickup: b.pickup, drop: b.drop,
    departAt: b.departAt ?? Date.now(), seats: Math.min(2, Math.max(1, b.seats ?? 1)), createdAt: Date.now(), status: 'open', demo,
  }
  requests.set(r.id, r)
  log(`${r.name} booked ${short(r.pickup.label)} → ${short(r.drop.label)}`, demo)
  if (!demo) scheduleDemoNear(r)
  changed()
  return r
}

export function cancelRequest(id: string, userId: string) {
  const r = requests.get(id)
  if (!r || r.userId !== userId) return false
  r.status = 'cancelled'
  if (r.groupId) leaveGroup(r)
  changed()
  return true
}

function leaveGroup(r: RideRequest) {
  const g = groups.get(r.groupId!)
  if (!g) return
  g.requestIds = g.requestIds.filter((id) => id !== r.id)
  r.groupId = undefined
  if (g.requestIds.length < 2) { for (const id of g.requestIds) { const x = requests.get(id)!; x.groupId = undefined; if (x.status === 'matched') x.status = 'open' } groups.delete(g.id) }
}

export function requestJoin(fromRequestId: string, toRequestId: string, userId: string) {
  const from = requests.get(fromRequestId), to = requests.get(toRequestId)
  if (!from || !to || from.userId !== userId) throw new Error('Request not found')
  if (!matchesFor(from).some((m) => m.requestId === to.id)) throw new Error('No longer a compatible match')
  const j: JoinRequest = { id: randomUUID().slice(0, 8), fromRequestId, toRequestId, createdAt: Date.now(), status: 'pending' }
  joins.set(j.id, j)
  log(`${from.name} asked to share with ${to.name}`, from.demo && to.demo)
  if (to.demo) setTimeout(() => respondJoin(j.id, true, to.userId), 2500 + Math.random() * 4000)  // demo riders accept
  changed()
  return j
}

export function respondJoin(joinId: string, accept: boolean, userId: string) {
  const j = joins.get(joinId)
  if (!j || j.status !== 'pending') return false
  const to = requests.get(j.toRequestId), from = requests.get(j.fromRequestId)
  if (!to || !from) return false
  const owners = ridersOf(to).map((r) => r.userId)
  if (!owners.includes(userId)) return false
  j.status = accept ? 'accepted' : 'declined'
  if (accept && from.status === 'open') {
    const g = to.groupId ? groups.get(to.groupId)! : { id: randomUUID().slice(0, 8), requestIds: [to.id], createdAt: Date.now() }
    groups.set(g.id, g)
    g.requestIds.push(from.id)
    for (const id of g.requestIds) { const r = requests.get(id)!; r.groupId = g.id; r.status = 'matched' }
    log(`${from.name} and ${to.name} are sharing a ride 🎉`, from.demo && to.demo)
  }
  changed()
  return true
}

// ---------- views ----------
const approx = (p: Place) => ({ lat: +p.lat.toFixed(3), lng: +p.lng.toFixed(3), label: short(p.label) })  // ~100 m: don't expose exact pickups

export function stateFor(userId: string) {
  const mine = [...requests.values()].filter((r) => r.userId === userId && r.status !== 'cancelled' && r.status !== 'expired')
  const myIds = new Set(mine.map((r) => r.id))
  const live = [...requests.values()].filter((r) => r.status === 'open' || r.status === 'matched')
  return {
    now: Date.now(),
    stats: { live: live.length, real: live.filter((r) => !r.demo).length, sharing: groups.size },
    board: live.filter((r) => r.userId !== userId).map((r) => ({ id: r.id, name: r.name, demo: r.demo, status: r.status, departAt: r.departAt, pickup: approx(r.pickup), drop: approx(r.drop), seats: r.seats })),
    activity: activity.slice(0, 12),
    mine: mine.map((r) => ({
      ...r, solo: soloQuote([r.pickup.lat, r.pickup.lng], [r.drop.lat, r.drop.lng]),
      matches: matchesFor(r),
      group: r.groupId ? (() => { const g = groups.get(r.groupId!)!; const riders = g.requestIds.map((id) => requests.get(id)!); return { id: g.id, plan: planGroup(riders), members: riders.map((x) => ({ requestId: x.id, name: x.name, demo: x.demo, pickup: x.pickup, drop: x.drop, departAt: x.departAt })) } })() : null,
    })),
    incoming: [...joins.values()].filter((j) => j.status === 'pending' && myIds.has(j.toRequestId)).map((j) => {
      const from = requests.get(j.fromRequestId)!, to = requests.get(j.toRequestId)!
      const plan = planGroup([...ridersOf(to), from])
      return { joinId: j.id, from: { name: from.name, demo: from.demo, pickup: approx(from.pickup), drop: approx(from.drop), departAt: from.departAt }, toRequestId: to.id, you: plan.riders.find((x) => x.requestId === to.id) }
    }),
  }
}

// ---------- housekeeping + demo demand ----------
const HOTSPOTS: Place[] = [
  { lat: 34.0256, lng: -118.2853, label: 'USC Village' }, { lat: 34.0206, lng: -118.2854, label: 'Tommy Trojan, USC' },
  { lat: 34.0287, lng: -118.2726, label: 'The Lorenzo' }, { lat: 34.0307, lng: -118.2883, label: 'Ellendale Pl' },
  { lat: 34.0183, lng: -118.2915, label: 'Expo/Vermont Station' }, { lat: 34.0225, lng: -118.2780, label: 'Jefferson & Figueroa' },
  { lat: 34.0280, lng: -118.2930, label: '28th St & Menlo' }, { lat: 34.0190, lng: -118.2856, label: 'Marshall (JKP)' },
]
const DESTINATIONS: Place[] = [
  { lat: 34.0562, lng: -118.2365, label: 'Union Station' }, { lat: 34.0430, lng: -118.2673, label: 'Crypto.com Arena / LA Live' },
  { lat: 34.0721, lng: -118.3576, label: 'The Grove' }, { lat: 34.0617, lng: -118.3005, label: 'Koreatown (Wilshire/Vermont)' },
  { lat: 34.0407, lng: -118.2353, label: 'Arts District' }, { lat: 33.9416, lng: -118.4085, label: 'LAX' },
  { lat: 34.1016, lng: -118.3387, label: 'Hollywood & Highland' }, { lat: 34.0497, lng: -118.2401, label: 'Little Tokyo' },
  { lat: 34.0195, lng: -118.4912, label: 'Santa Monica Pier' }, { lat: 34.0689, lng: -118.4452, label: 'Westwood / UCLA' },
]
const NAMES = ['Priya S.', 'Marcus L.', 'Jenna K.', 'Diego R.', 'Aisha M.', 'Kevin T.', 'Sofia G.', 'Ethan W.', 'Hana Y.', 'Omar F.', 'Lily C.', 'Noah B.', 'Zara P.', 'Ryan H.', 'Mei L.', 'Arjun V.']
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
const jitter = (p: Place, m: number): Place => ({ ...p, lat: p.lat + ((Math.random() - 0.5) * 2 * m) / 111000, lng: p.lng + ((Math.random() - 0.5) * 2 * m) / 92000 })
let demoN = 0

function demoRide(pickup: Place, drop: Place, departAt: number) {
  return createRequest({ userId: `demo-${++demoN}`, name: pick(NAMES), pickup, drop, departAt, seats: Math.random() < 0.8 ? 1 : 2 }, true)
}

/** Someone just booked: within ~1–3 min, 1–2 demo riders book similar trips (near the pickup / on the way / near the drop). */
function scheduleDemoNear(r: RideRequest) {
  if (!SIM) return
  const count = 1 + Math.round(Math.random())
  for (let k = 0; k < count; k++) {
    setTimeout(() => {
      if (r.status !== 'open' && r.status !== 'matched') return
      const t = Math.random()
      const mid: Place = { lat: r.pickup.lat + (r.drop.lat - r.pickup.lat) * t * 0.5, lng: r.pickup.lng + (r.drop.lng - r.pickup.lng) * t * 0.5, label: 'on the way' }
      const pickup = Math.random() < 0.6 ? jitter({ ...r.pickup, label: short(r.pickup.label) }, 350) : jitter({ ...mid, label: `${short(r.pickup.label)} area` }, 250)
      const drop = Math.random() < 0.7 ? jitter({ ...r.drop, label: short(r.drop.label) }, 450) : jitter({ lat: r.pickup.lat + (r.drop.lat - r.pickup.lat) * 0.8, lng: r.pickup.lng + (r.drop.lng - r.pickup.lng) * 0.8, label: `near ${short(r.drop.label)}` }, 300)
      demoRide(pickup, drop, r.departAt + (Math.random() - 0.5) * 10 * 60e3)
    }, (40 + Math.random() * 130) * 1000 * (k + 1) * 0.8)
  }
}

const SIM = process.env.RIDE_SIM !== '0'
export function startRides() {
  setInterval(() => {  // expire stale requests
    let dirty = false
    for (const r of requests.values()) {
      const stale = r.status === 'open' && Date.now() > Math.max(r.departAt + 10 * 60e3, r.createdAt + (r.demo ? 18 : 45) * 60e3)
      if (stale) { r.status = 'expired'; dirty = true }
    }
    if (dirty) changed()
  }, 15_000)
  if (!SIM) return
  const spawn = () => demoRide(jitter(pick(HOTSPOTS), 250), jitter(pick(DESTINATIONS), 400), Date.now() + (3 + Math.random() * 25) * 60e3)
  for (let i = 0; i < 7; i++) spawn()
  const loop = () => { if ([...requests.values()].filter((r) => r.demo && r.status === 'open').length < 14) spawn(); setTimeout(loop, (20 + Math.random() * 20) * 1000) }
  setTimeout(loop, 15_000)
}
