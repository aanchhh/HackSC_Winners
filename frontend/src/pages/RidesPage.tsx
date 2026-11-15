import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { api } from '../api/client'
import InfoTip from '../components/ui/InfoTip'
import { googleMapsDirections, uberLink } from '../lib/directions'
import {
  ago, identity, inMin, QUICK_DROPS, QUICK_PICKUPS, rides, saveName, subscribeRides,
  type Match, type MyRide, type Place, type Quote, type RidesState,
} from '../lib/rides'

const usd = (n: number) => `$${n.toFixed(2)}`
const PRICING_NOTE = 'Fares are UberX-style estimates for LA: $1.25 base + $3.10 booking fee + $1.15/mile + $0.30/min (min $8.50), with road distance ≈ 1.35× straight-line at ~18 mph. A shared car takes the best pickup/drop order; the single fare is split in proportion to each rider’s solo fare, so everyone saves. A match is shown only if everyone saves and nobody’s detour is more than ~6 min (or 40% of their trip).'

function PlaceInput({ label, value, onChange, quick, onPickMap, picking }: {
  label: string; value: Place | null; onChange: (p: Place | null) => void; quick: Place[]; onPickMap: () => void; picking: boolean
}) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const lookup = async () => {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try { const g = await api.geocode(text); onChange({ lat: g.lat, lng: g.lng, label: g.label.split(',').slice(0, 2).join(',') }); setText('') }
    catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }
  const here = () => navigator.geolocation?.getCurrentPosition(
    (p) => onChange({ lat: p.coords.latitude, lng: p.coords.longitude, label: 'My location' }), () => setErr('Location not available'))
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-stone-500">{label}</div>
      {value ? (
        <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm ring-1 ring-stone-200">
          <span className="truncate font-medium">{value.label}</span>
          <button onClick={() => onChange(null)} className="ml-2 text-xs text-stone-500 hover:text-cardinal">change</button>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), lookup())}
              placeholder="Type an address or place…" className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
            <button onClick={lookup} disabled={busy} className="rounded-lg bg-stone-800 px-3 text-xs font-semibold text-white">{busy ? '…' : 'Find'}</button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {label === 'Pickup' && <button onClick={here} className="rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-stone-300 hover:ring-cardinal">📍 My location</button>}
            <button onClick={onPickMap} className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${picking ? 'bg-gold ring-gold' : 'bg-white ring-stone-300 hover:ring-cardinal'}`}>🗺 {picking ? 'Click the map…' : 'Pick on map'}</button>
            {quick.map((q) => <button key={q.label} onClick={() => onChange(q)} className="rounded-full bg-white px-2 py-0.5 text-[11px] ring-1 ring-stone-300 hover:ring-cardinal">{q.label}</button>)}
          </div>
          {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
        </>
      )}
    </div>
  )
}

function MatchCard({ m, now, onJoin, onHover }: { m: Match; now: number; onJoin: () => void; onHover: (on: boolean) => void }) {
  return (
    <div onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} className="rounded-xl bg-white p-3 ring-1 ring-stone-200 transition hover:ring-gold">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cardinal text-sm font-bold text-gold">{m.name[0]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold">{m.name}</span>
            {m.demo && <span className="rounded bg-stone-100 px-1 text-[10px] text-stone-500" title="Simulated rider so the demo has live demand">demo</span>}
            {m.groupSize > 1 && <span className="rounded bg-gold-50 px-1 text-[10px] text-amber-800">+{m.groupSize - 1} already sharing</span>}
            <span className="ml-auto text-xs text-stone-500">leaves {inMin(m.departAt, now)}</span>
          </div>
          <div className="truncate text-xs text-stone-500">{m.pickupArea} → {m.dropArea}</div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {m.tags.map((t) => <span key={t} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800 ring-1 ring-emerald-200">{t}</span>)}
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="text-sm">
          You pay <b className="text-cardinal">{usd(m.you.share)}</b> <span className="text-stone-400 line-through">{usd(m.you.solo.fare)}</span>
          <div className="text-xs font-semibold text-emerald-700">save {usd(m.you.saves)} ({m.you.savesPct}%){m.you.detourMin > 0 ? ` · +${m.you.detourMin} min detour` : ' · no detour'}</div>
        </div>
        <button onClick={onJoin} disabled={m.pendingJoin}
          className="shrink-0 rounded-lg bg-cardinal px-3 py-1.5 text-xs font-semibold text-white hover:bg-cardinal-dark disabled:bg-stone-300 disabled:text-stone-600">
          {m.pendingJoin ? 'Request sent…' : 'Request to share'}
        </button>
      </div>
    </div>
  )
}

function GroupCard({ ride, now, onCancel }: { ride: MyRide; now: number; onCancel: () => void }) {
  const g = ride.group!
  const me = g.plan.riders.find((r) => r.requestId === ride.id)!
  const totalSaved = g.plan.riders.reduce((s, r) => s + r.saves, 0)
  const first = g.plan.stops[0], last = g.plan.stops[g.plan.stops.length - 1]
  const mid = g.plan.stops.slice(1, -1).map((s) => [s.lat, s.lng] as [number, number])
  return (
    <div className="space-y-3 rounded-2xl bg-white p-4 ring-2 ring-emerald-400">
      <div>
        <div className="text-lg font-extrabold">🎉 You’re sharing a ride</div>
        <div className="text-sm text-stone-500">with {g.members.filter((m) => m.requestId !== ride.id).map((m) => m.name + (m.demo ? ' (demo)' : '')).join(', ')} · leaves {inMin(ride.departAt, now)}</div>
      </div>
      <ol className="space-y-1.5 text-sm">
        {g.plan.stops.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${s.kind === 'pickup' ? 'bg-emerald-600' : 'bg-cardinal'}`}>{i + 1}</span>
            <span className="truncate">{s.kind === 'pickup' ? 'Pick up' : 'Drop'} <b>{s.requestId === ride.id ? 'you' : s.name}</b> · {s.label}</span>
          </li>
        ))}
      </ol>
      <table className="w-full text-xs">
        <thead><tr className="text-stone-500"><th className="text-left font-medium">Rider</th><th className="font-medium">Alone</th><th className="font-medium">Shared</th><th className="font-medium">Saves</th></tr></thead>
        <tbody>
          {g.plan.riders.map((r) => (
            <tr key={r.requestId} className={`border-t border-stone-100 ${r.requestId === ride.id ? 'font-semibold' : ''}`}>
              <td className="py-1">{r.requestId === ride.id ? 'You' : g.members.find((m) => m.requestId === r.requestId)?.name}</td>
              <td className="text-center">{usd(r.solo.fare)}</td><td className="text-center">{usd(r.share)}</td>
              <td className="text-center text-emerald-700">{usd(r.saves)} ({r.savesPct}%)</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rounded-xl bg-emerald-50 p-3 text-sm">
        One car, {g.plan.miles} mi, ~{g.plan.minutes} min, {usd(g.plan.totalFare)} total. You save <b>{usd(me.saves)}</b>; the group saves <b>{usd(totalSaved)}</b> vs everyone riding alone.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <a href={uberLink([first.lat, first.lng], [last.lat, last.lng], first.label, last.label)} target="_blank" rel="noreferrer"
          className="rounded-lg bg-ink px-3 py-2 text-center text-sm font-semibold !text-white">Book in Uber ↗</a>
        <a href={googleMapsDirections([first.lat, first.lng], [last.lat, last.lng], 'driving', mid)} target="_blank" rel="noreferrer"
          className="rounded-lg px-3 py-2 text-center text-sm font-semibold !text-stone-700 ring-1 ring-stone-300">🧭 Route in Maps ↗</a>
      </div>
      <p className="text-[11px] text-stone-400">One rider books with the first pickup and final drop, then adds the middle stops in the Uber app (up to 3 stops). Split the fare as shown.</p>
      <button onClick={onCancel} className="text-xs font-medium text-stone-500 hover:text-cardinal">Leave this ride</button>
    </div>
  )
}

function ClickPick({ onPick }: { onPick: ((p: [number, number]) => void) | null }) {
  useMapEvents({ click: (e) => onPick?.([e.latlng.lat, e.latlng.lng]) })
  return null
}
function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap()
  const key = pts.map((p) => p.join()).join('|')
  useEffect(() => { if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [50, 50], maxZoom: 15 }) }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function RidesPage() {
  const me = useMemo(identity, [])
  const [name, setName] = useState(me.name)
  const [state, setState] = useState<RidesState | null>(null)
  const [live, setLive] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [pickup, setPickup] = useState<Place | null>(null)
  const [drop, setDrop] = useState<Place | null>(null)
  const [picking, setPicking] = useState<'pickup' | 'drop' | null>(null)
  const [leaveIn, setLeaveIn] = useState(0)
  const [seats, setSeats] = useState(1)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [hover, setHover] = useState<Match | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => subscribeRides(me.id, setState, setLive), [me.id])
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { if (pickup && drop) rides.quote(pickup, drop).then(setQuote).catch(() => setQuote(null)); else setQuote(null) }, [pickup, drop])

  const ride = state?.mine.find((r) => r.status === 'open' || r.status === 'matched') ?? null
  const book = async () => {
    if (!pickup || !drop) return
    setErr(''); saveName(name)
    try { await rides.book({ userId: me.id, name, pickup, drop, departAt: Date.now() + leaveIn * 60e3, seats }) } catch (e) { setErr((e as Error).message) }
  }
  const myPts: [number, number][] = ride ? [[ride.pickup.lat, ride.pickup.lng], [ride.drop.lat, ride.drop.lng]] : [pickup, drop].filter(Boolean).map((p) => [p!.lat, p!.lng])
  const plan = ride?.group?.plan ?? hover?.plan

  return (
    <div className="flex h-full flex-col">
      {/* live strip */}
      <div className="flex items-center gap-4 overflow-hidden border-b border-stone-200 bg-ink px-4 py-2 text-xs text-white">
        <span className="flex shrink-0 items-center gap-1.5 font-semibold">
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-red-500' : 'bg-stone-500'}`} />{live ? 'LIVE' : 'connecting…'}
        </span>
        {state && <span className="shrink-0">{state.stats.live} students booking now · {state.stats.sharing} shared rides formed</span>}
        <div className="flex min-w-0 gap-6 truncate text-white/70">
          {state?.activity.slice(0, 3).map((a) => <span key={a.at + a.text} className="truncate">{a.text} <span className="text-white/40">{ago(a.at, now)}</span></span>)}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full space-y-4 overflow-y-auto border-r border-stone-200 bg-stone-50 p-4 md:w-[420px]">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Share a ride</h1>
            <p className="text-sm text-stone-500">Book where you’re going. Students heading the same way, with a pickup near yours, on the way, or near your drop, show up here live. Split the fare and save. <InfoTip>{PRICING_NOTE}</InfoTip></p>
          </div>

          {!ride && (
            <div className="space-y-4 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
              <label className="block text-xs font-semibold text-stone-500">Riding as
                <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm font-normal text-ink" />
              </label>
              <PlaceInput label="Pickup" value={pickup} onChange={setPickup} quick={QUICK_PICKUPS} picking={picking === 'pickup'} onPickMap={() => setPicking(picking === 'pickup' ? null : 'pickup')} />
              <PlaceInput label="Drop-off" value={drop} onChange={setDrop} quick={QUICK_DROPS} picking={picking === 'drop'} onPickMap={() => setPicking(picking === 'drop' ? null : 'drop')} />
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="mb-1 text-xs font-semibold text-stone-500">Leaving</div>
                  <div className="grid grid-cols-4 overflow-hidden rounded-lg text-xs font-semibold ring-1 ring-stone-300">
                    {[0, 15, 30, 60].map((m) => <button key={m} onClick={() => setLeaveIn(m)} className={`py-1.5 ${leaveIn === m ? 'bg-cardinal text-white' : 'bg-white'}`}>{m ? `${m}m` : 'Now'}</button>)}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold text-stone-500">Seats</div>
                  <div className="grid grid-cols-2 overflow-hidden rounded-lg text-xs font-semibold ring-1 ring-stone-300">
                    {[1, 2].map((s) => <button key={s} onClick={() => setSeats(s)} className={`px-3 py-1.5 ${seats === s ? 'bg-cardinal text-white' : 'bg-white'}`}>{s}</button>)}
                  </div>
                </div>
              </div>
              {quote && <div className="rounded-lg bg-stone-50 p-2 text-sm">Riding alone: about <b>{usd(quote.fare)}</b> · {quote.miles} mi · {quote.minutes} min</div>}
              {err && <p className="text-xs text-red-600">{err}</p>}
              <button onClick={book} disabled={!pickup || !drop} className="w-full rounded-xl bg-cardinal py-2.5 font-semibold text-white hover:bg-cardinal-dark disabled:opacity-40">Find riders on my route</button>
            </div>
          )}

          {ride && !!state?.incoming.length && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700"><span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />Wants to share with you</div>
              {state.incoming.map((j) => (
                <div key={j.joinId} className="rounded-xl bg-gold-50 p-3 text-sm ring-1 ring-gold">
                  <b>{j.from.name}</b>{j.from.demo ? ' (demo)' : ''}: {j.from.pickup.label} → {j.from.drop.label} · leaves {inMin(j.from.departAt, now)}
                  <div className="text-xs text-emerald-700">You’d pay {usd(j.you.share)} instead of {usd(j.you.solo.fare)} (save {usd(j.you.saves)}, {j.you.savesPct}%)</div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => rides.respond(j.joinId, me.id, true)} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Accept</button>
                    <button onClick={() => rides.respond(j.joinId, me.id, false)} className="rounded-lg px-3 py-1 text-xs font-semibold ring-1 ring-stone-300">Decline</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {ride?.status === 'matched' && ride.group && <GroupCard ride={ride} now={now} onCancel={() => rides.cancel(ride.id, me.id)} />}

          {ride?.status === 'open' && (
            <>
              <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />Finding riders on your route</div>
                  <button onClick={() => rides.cancel(ride.id, me.id)} className="text-xs text-stone-500 hover:text-cardinal">Cancel</button>
                </div>
                <div className="mt-1 truncate text-sm">{ride.pickup.label} → {ride.drop.label}</div>
                <div className="text-xs text-stone-500">booked {ago(ride.createdAt, now)} · leaves {inMin(ride.departAt, now)} · alone ≈ {usd(ride.solo.fare)}</div>
              </div>

              <div className="text-xs font-bold uppercase tracking-wide text-stone-500">Riders on your route ({ride.matches.length})</div>
              {ride.matches.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-stone-500 ring-1 ring-stone-200">No one on your route yet. New bookings appear here live, usually within a few minutes.</p>}
              <div className="space-y-2">
                {ride.matches.map((m) => (
                  <MatchCard key={m.requestId} m={m} now={now} onHover={(on) => setHover(on ? m : null)}
                    onJoin={() => rides.join(m.requestId, me.id, ride.id).catch((e) => setErr((e as Error).message))} />
                ))}
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
            </>
          )}
          <p className="text-[11px] text-stone-400">Exact pickups are shared only after you match (others see ~100 m precision). “demo” riders are simulated so the demo has demand; real riders are other people using TrojanScout right now.</p>
        </aside>

        <div className={`relative min-h-[320px] flex-1 ${picking ? 'cursor-crosshair' : ''}`}>
          <MapContainer center={[34.035, -118.28]} zoom={13} className="h-full w-full">
            <TileLayer attribution='&copy; OpenStreetMap' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <ClickPick onPick={picking ? (p) => { const place = { lat: p[0], lng: p[1], label: `Pin ${p[0].toFixed(4)}, ${p[1].toFixed(4)}` }; if (picking === 'pickup') { setPickup(place) } else { setDrop(place) } setPicking(null) } : null} />
            {state?.board.map((b) => (
              <Polyline key={b.id} positions={[[b.pickup.lat, b.pickup.lng], [b.drop.lat, b.drop.lng]]}
                pathOptions={{ color: ride?.matches.some((m) => m.requestId === b.id) ? '#d4a106' : '#78716c', weight: ride?.matches.some((m) => m.requestId === b.id) ? 3 : 1.5, opacity: 0.55, dashArray: '4 6' }}>
                <Tooltip sticky>{b.name}{b.demo ? ' (demo)' : ''}: {b.pickup.label} → {b.drop.label} · leaves {inMin(b.departAt, now)}</Tooltip>
              </Polyline>
            ))}
            {state?.board.map((b) => <CircleMarker key={b.id + 'p'} center={[b.pickup.lat, b.pickup.lng]} radius={4} pathOptions={{ color: '#fff', weight: 1, fillColor: '#57534e', fillOpacity: 0.8 }} />)}
            {plan && <Polyline positions={plan.stops.map((s) => [s.lat, s.lng] as [number, number])} pathOptions={{ color: '#059669', weight: 5, opacity: 0.9 }} />}
            {plan?.stops.map((s, i) => (
              <CircleMarker key={`s${i}`} center={[s.lat, s.lng]} radius={8} pathOptions={{ color: '#fff', weight: 2, fillColor: s.kind === 'pickup' ? '#059669' : '#990000', fillOpacity: 1 }}>
                <Tooltip permanent direction="top" offset={[0, -6]}>{i + 1}. {s.kind === 'pickup' ? 'Pickup' : 'Drop'} {s.requestId === ride?.id ? 'you' : s.name}</Tooltip>
              </CircleMarker>
            ))}
            {!plan && myPts.length === 2 && <Polyline positions={myPts} pathOptions={{ color: '#990000', weight: 4, dashArray: '8 8' }} />}
            {!plan && myPts.map((p, i) => <CircleMarker key={`m${i}`} center={p} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: i ? '#990000' : '#059669', fillOpacity: 1 }}><Tooltip permanent direction="top" offset={[0, -6]}>{i ? 'Your drop' : 'Your pickup'}</Tooltip></CircleMarker>)}
            <Fit pts={plan ? plan.stops.map((s) => [s.lat, s.lng]) : myPts} />
          </MapContainer>
          {picking && <div className="absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-ink px-4 py-1.5 text-sm font-medium text-white">Click the map to set your {picking}</div>}
        </div>
      </div>
    </div>
  )
}
