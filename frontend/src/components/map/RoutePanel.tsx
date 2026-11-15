import type { Building, RouteLeg, RouteResult } from '../../api/types'
import { googleMapsForRoute } from '../../lib/directions'
import TripOptions from '../free/TripOptions'
import PlaceInput from '../rides/PlaceInput'
import type { Place } from '../../lib/rides'
import RecentCheck from '../safety/RecentCheck'
import { Link } from 'react-router'
import { useMe } from '../../lib/auth'

interface Props {
  buildings: Building[]; startLabel: string | null; start: [number, number] | null; destId: number; setDestId: (id: number) => void
  customDest: Place | null; setCustomDest: (p: Place | null) => void; end: [number, number] | null
  night: boolean; setNight: (v: boolean) => void; picking: boolean; setPicking: (v: boolean) => void
  result: RouteResult | undefined; loading: boolean; error: string | null; onClear: () => void
}

function Leg({ title, leg, tone }: { title: string; leg: RouteLeg; tone: 'safe' | 'fast' }) {
  return (
    <div className={`rounded-xl p-3 text-xs ring-1 ${tone === 'safe' ? 'bg-emerald-50 ring-emerald-200' : 'bg-stone-50 ring-stone-200'}`}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className={`font-bold ${tone === 'safe' ? 'text-emerald-800' : 'text-stone-700'}`}>{title}</span>
        <span className="text-sm font-extrabold">{leg.minutes} min</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-stone-600">
        <span>{(leg.distanceM / 1609).toFixed(2)} mi</span>
        <span>{leg.pctInsideDps}% in DPS zone</span>
        <span><b className="text-ink">{leg.incidents.total}</b> incidents nearby</span>
        <span><b className="text-ink">{leg.severeIncidents}</b> violent/weapon</span>
        <span>{leg.pctLit}% lit streets</span>
        <span>{leg.emergencyPhones.length} emergency phones</span>
      </div>
      {leg.streets.length > 0 && <div className="mt-1 truncate text-[11px] text-stone-500">via {leg.streets.slice(0, 4).join(' → ')}</div>}
      <a href={googleMapsForRoute(leg.coords)} target="_blank" rel="noreferrer"
        className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${tone === 'safe' ? 'bg-emerald-600 !text-white hover:bg-emerald-700' : 'bg-white !text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50'}`}>
        🧭 Get directions in Google Maps ↗
      </a>
    </div>
  )
}

export default function RoutePanel(p: Props) {
  const me = useMe()
  const contacts = me.data?.contacts ?? []
  return (
    <div className="space-y-3 text-sm">
      <div>
        <div className="mb-1 text-xs font-semibold text-stone-500">From</div>
        <button onClick={() => p.setPicking(!p.picking)}
          className={`w-full truncate rounded-lg px-3 py-2 text-left ring-1 ${p.picking ? 'bg-gold-50 ring-gold' : 'bg-white ring-stone-300'}`}>
          {p.picking ? '👆 Click the map or a listing’s “Safest walk”…' : p.startLabel ?? 'Pick a start point'}
        </button>
      </div>
      <div>
        <div className="mb-1 text-xs font-semibold text-stone-500">To</div>
        {p.customDest ? (
          <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 ring-1 ring-stone-200">
            <span className="truncate font-medium">📍 {p.customDest.label}</span>
            <button onClick={() => p.setCustomDest(null)} className="ml-2 text-xs text-stone-500 hover:text-cardinal">change</button>
          </div>
        ) : (
          <>
            <select value={p.destId} onChange={(e) => p.setDestId(+e.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2">
              {p.buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div className="mt-1.5">
              <PlaceInput label="Or anywhere else" value={null} onChange={(x) => x && p.setCustomDest(x)} picking={false} onPickMap={() => {}} onPreview={() => {}}
                quick={[{ lat: 34.0562, lng: -118.2365, label: 'Union Station' }, { lat: 33.9416, lng: -118.4085, label: 'LAX' }, { lat: 34.0287, lng: -118.2726, label: 'The Lorenzo' }]} />
            </div>
          </>
        )}
      </div>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={p.night} onChange={(e) => p.setNight(e.target.checked)} className="accent-cardinal" />
        🌙 Walking after dark (weights night-time incidents 1.5×)
      </label>
      {p.loading && <div className="h-24 animate-pulse rounded-xl bg-stone-100" />}
      {p.error && (/outside the mapped area/i.test(p.error)
        ? <p className="rounded-lg bg-stone-50 p-2 text-xs text-stone-600">That's beyond walking range of the streets we map around USC, so use one of the options below. “Safest walk to the stop” routes you to the shuttle safely.</p>
        : <p className="rounded-lg bg-red-50 p-2 text-xs text-red-700">{p.error}</p>)}
      {p.result && (
        <div className="space-y-2">
          <Leg title="🛡 Safest route" leg={p.result.safest} tone="safe" />
          {!p.result.sameRoute && <Leg title="⚡ Fastest route" leg={p.result.fastest} tone="fast" />}
          <p className="text-xs font-medium text-ink">{p.result.summary}</p>
          {contacts.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs"><span className="text-stone-500">Text my route & ETA to</span>
              {contacts.slice(0, 3).map((c) => (
                <a key={c.id} href={`sms:${c.phone.replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(`Walking home now, ETA ~${p.result!.safest.minutes} min. My route: ${googleMapsForRoute(p.result!.safest.coords)}`)}`}
                  className="rounded-full bg-white px-2 py-0.5 font-semibold text-cardinal ring-1 ring-stone-300">💬 {c.name}</a>
              ))}
            </div>
          ) : me.data ? <Link to="/profile" className="block text-xs text-stone-500 hover:text-cardinal">Add an emergency contact to text them this route →</Link> : null}
          <details className="text-[11px] text-stone-500"><summary className="cursor-pointer">How “safest” is calculated</summary><p className="mt-1">{p.result.method} Incident data: LAPD (data.lacity.org), last 6 months.</p></details>
          <button onClick={p.onClear} className="text-xs font-medium text-stone-500 hover:text-cardinal">Clear route</button>
        </div>
      )}
      {/* after the routes: what happened there today, then the free and shared alternatives */}
      {p.end && <RecentCheck at={p.end} label={p.customDest?.label ?? p.buildings.find((b) => b.id === p.destId)?.name ?? 'your destination'} compact />}
      {p.start && <RecentCheck at={p.start} label="your start" compact />}
      <TripOptions from={p.start} to={p.end} onWalkTo={(pt, label) => p.setCustomDest({ lat: pt[0], lng: pt[1], label })} />
      {p.start && p.end && (
        <Link to={`/rides?from=${p.start[0]},${p.start[1]}&to=${p.end[0]},${p.end[1]}&toLabel=${encodeURIComponent(p.customDest?.label ?? p.buildings.find((b) => b.id === p.destId)?.name ?? '')}`}
          className="flex items-center justify-between rounded-xl bg-ink px-3 py-2.5 text-xs font-semibold !text-white hover:bg-stone-800">
          <span>🚗 Share a ride on this trip<span className="block text-[11px] font-normal text-stone-300">See friends and students going the same way</span></span><span>→</span>
        </Link>
      )}
      {!p.result && !p.loading && <p className="text-xs text-stone-500">Green = safest route (avoids blocks with recent LAPD-reported incidents, prefers DPS-patrolled and lit streets). Dashed gray = fastest.</p>}
    </div>
  )
}
