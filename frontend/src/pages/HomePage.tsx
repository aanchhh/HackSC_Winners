import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Zones } from '../api/types'
import ZoneLayer from '../components/map/ZoneLayer'
import { money, timeAgo } from '../lib/format'
import { USC } from './MapPage'

const EXAMPLES = ['furnished room under $1,200', '2 bed inside DPS', 'studio near Figueroa', 'house with washer dryer']

function ClickToCheck({ onPick }: { onPick: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onPick([e.latlng.lat, e.latlng.lng]) })
  return null
}

function PinChecker() {
  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones })
  const [pin, setPin] = useState<[number, number] | null>(null)
  const [res, setRes] = useState<Zones | null>(null)
  const pick = async (p: [number, number]) => { setPin(p); setRes(null); setRes(await api.zoneCheck(p[0], p[1])) }
  return (
    <div className="overflow-hidden rounded-3xl bg-white text-ink shadow-xl ring-1 ring-stone-200">
      <div className="relative h-72 sm:h-80">
        <MapContainer center={USC} zoom={14} className="h-full w-full" scrollWheelZoom={false} attributionControl={false}>
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {zones.data && <ZoneLayer data={zones.data} visible={{ DPS: true, Fryft: false }} />}
          <ClickToCheck onPick={pick} />
          {pin && <CircleMarker center={pin} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#990000', fillOpacity: 1 }} />}
        </MapContainer>
        {!pin && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[500] mx-auto w-fit rounded-full bg-ink/85 px-4 py-1.5 text-sm font-medium text-white">
            👆 Tap anywhere to check an address
          </div>
        )}
      </div>
      <div className="flex min-h-16 items-center gap-3 px-5 py-3">
        {!pin && <p className="text-sm text-stone-500">The red outline is the USC DPS patrol zone, traced from the DPS Crime Analysis Unit map.</p>}
        {pin && !res && <p className="text-sm text-stone-500">Checking…</p>}
        {res && (
          <>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg ${res.inDps ? 'bg-emerald-100' : 'bg-orange-100'}`}>{res.inDps ? '🛡' : '⚠'}</span>
            <div>
              <p className="font-semibold">{res.inDps ? 'Inside the DPS patrol zone' : 'Outside the DPS patrol zone'}</p>
              <p className="text-xs text-stone-500">{res.inDps ? 'USC Public Safety patrols this block.' : 'DPS does not routinely patrol here, so factor that into late nights.'}</p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const FEATURES = [
  { to: '/map', icon: '🗺', title: 'Explore Map', body: 'Every live listing on one map with the DPS zone. Click a dot for its report; compare up to 3.' },
  { to: '/search', icon: '🔎', title: 'Smart Search', body: 'Type it like you’d say it. Hybrid semantic + keyword search finds “furnished room near Figueroa”.' },
  { to: '/ask', icon: '💬', title: 'Ask Scout', body: 'An AI agent that checks zones, commute and cost for you, and shows its work.' },
  { to: '/true-cost', icon: '💸', title: 'True Trojan Cost', body: 'Rent is not the full bill. Add utilities, transit and late-night rides outside Fryft.' },
]

export default function HomePage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, refetchInterval: 60_000 })
  const m = meta.data

  return (
    <div>
      <section className="relative overflow-hidden bg-gradient-to-br from-cardinal via-cardinal to-cardinal-dark text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
          <div className="flex flex-col justify-center gap-6">
            <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-gold" />
              {m ? `${m.count} live listings · updated ${timeAgo(m.scrapedAt)}` : 'Loading live listings…'}
            </span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Off-campus housing that <span className="text-gold">actually works</span> for a Trojan.
            </h1>
            <p className="max-w-lg text-lg text-white/80">
              Zillow tells you the rent. TrojanScout tells you if it’s inside the DPS zone, how long the walk to class really is, and what you’ll actually pay each month.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`) }}
              className="flex max-w-lg gap-2 rounded-2xl bg-white p-1.5 shadow-lg">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “furnished room under $1,200”"
                className="min-w-0 flex-1 rounded-xl px-3 text-ink outline-none" />
              <button className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-ink hover:brightness-95">Search</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => nav(`/search?q=${encodeURIComponent(e)}`)}
                  className="rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/20 hover:bg-white/20">{e}</button>
              ))}
            </div>
          </div>
          <PinChecker />
        </div>
      </section>

      <section className="mx-auto -mt-8 grid max-w-5xl grid-cols-2 gap-3 px-4 sm:grid-cols-4">
        {[
          [m?.count ?? '—', 'live listings'],
          [m ? `${Math.round((m.inDps / Math.max(m.count, 1)) * 100)}%` : '—', 'inside DPS zone'],
          [m?.medianRent ? money(m.medianRent) : '—', 'median listed price'],
          [m ? Object.keys(m.sources).length : '—', 'sources scraped'],
        ].map(([v, l]) => (
          <div key={l as string} className="relative rounded-2xl bg-white p-4 text-center shadow-md ring-1 ring-stone-200">
            <div className="text-2xl font-extrabold text-cardinal">{v}</div>
            <div className="text-xs text-stone-500">{l}</div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="mb-2 text-center text-3xl font-extrabold tracking-tight">Everything a lease decision needs</h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-stone-500">Official boundaries, live listings and real student context, cross-referenced in seconds.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className="group rounded-2xl border border-stone-200 bg-white p-6 transition hover:-translate-y-1 hover:border-cardinal/30 hover:shadow-lg">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-cardinal-50 text-2xl">{f.icon}</div>
              <h3 className="mb-1 font-bold group-hover:text-cardinal">{f.title} →</h3>
              <p className="text-sm text-stone-500">{f.body}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-stone-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-14 md:grid-cols-3">
          {[
            ['1', 'Set your priorities', 'Budget, the buildings you have class in, and how many late nights you’re out.', '/preferences'],
            ['2', 'Explore or ask', 'Browse the map, search in plain English, or let Scout do the cross-referencing.', '/map'],
            ['3', 'Compare before you sign', 'Put up to 3 places side by side on True Cost, commute and zone coverage.', '/map'],
          ].map(([n, t, b, to]) => (
            <Link to={to} key={n} className="flex gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gold font-extrabold">{n}</span>
              <div><h3 className="font-bold">{t}</h3><p className="text-sm text-stone-500">{b}</p></div>
            </Link>
          ))}
        </div>
        <p className="pb-8 text-center text-xs text-stone-400">
          Listings from {m ? Object.keys(m.sources).join(', ') : '…'} · safety shown as facts and zones, never labels · costs are estimates
        </p>
      </section>
    </div>
  )
}
