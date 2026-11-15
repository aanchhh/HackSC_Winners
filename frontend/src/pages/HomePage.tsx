import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import ZoneArt, { type Pin } from '../components/landing/ZoneArt'
import { money, timeAgo } from '../lib/format'

const EXAMPLES = ['private room with private bath under $1,200', '2B2B inside DPS', 'studio near Leavey', '3 bed 2 bath with parking']

function ZoneChecker() {
  const [addr, setAddr] = useState('')
  const [pin, setPin] = useState<Pin | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const check = async (lat: number, lng: number, label?: string) => {
    setErr('')
    const z = await api.zoneCheck(lat, lng)
    setPin({ lat, lng, inDps: z.inDps, label: label ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}` })
  }
  const lookup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addr.trim()) return
    setBusy(true)
    try { const g = await api.geocode(addr); await check(g.lat, g.lng, g.label.split(',').slice(0, 2).join(',')) }
    catch (x) { setErr((x as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="overflow-hidden rounded-3xl bg-[#120404] text-white shadow-2xl ring-1 ring-white/10">
      <div className="relative aspect-[640/560] w-full">
        <ZoneArt pin={pin} onPick={(la, lo) => check(la, lo)} />
        <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col gap-1 rounded-xl bg-black/50 px-3 py-2 text-[11px] backdrop-blur">
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />Listing inside DPS</span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-violet-400" />Listing outside DPS</span>
          <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-red-500" />DPS unit (live, simulated)</span>
        </div>
      </div>
      <form onSubmit={lookup} className="flex gap-2 border-t border-white/10 p-3">
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Type an address, or tap the map…"
          className="min-w-0 flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 outline-none ring-1 ring-white/10 focus:ring-gold" />
        <button disabled={busy} className="rounded-xl bg-gold px-4 text-sm font-semibold text-ink disabled:opacity-60">{busy ? '…' : 'Check'}</button>
      </form>
      <div className="min-h-14 px-4 pb-4 text-sm">
        {err && <p className="text-red-300">{err}</p>}
        {!pin && !err && <p className="text-white/60">Is an apartment inside the USC DPS patrol zone? Check any address.</p>}
        {pin && (
          <p className="flex items-center gap-2">
            <span className={`grid h-7 w-7 place-items-center rounded-full ${pin.inDps ? 'bg-emerald-500/20 text-emerald-300' : 'bg-violet-500/20 text-violet-300'}`}>{pin.inDps ? '✓' : '!'}</span>
            <span><b>{pin.label}</b> is {pin.inDps ? 'inside' : 'outside'} the DPS patrol zone{pin.inDps ? ' and the Fryft area.' : ', so no DPS patrols or free Fryft rides.'}</span>
          </p>
        )}
      </div>
    </div>
  )
}

const FEATURES = [
  { to: '/map', icon: '🗺', title: 'Explore Map', body: 'Live listings, the DPS zone, reported incidents and DPS units. Click a dot for its report; compare side by side.' },
  { to: '/map?mode=route', icon: '🛡', title: 'Safest Route', body: 'Walk routes that avoid blocks with recent LAPD-reported incidents, not just the fastest path.' },
  { to: '/search', icon: '🔎', title: 'Smart Search', body: 'Type “2B2B under $3k near Viterbi”. It understands room types, baths, price, zones and walk time.' },
  { to: '/ask', icon: '💬', title: 'Ask Scout', body: 'An AI agent that checks zones, commute and cost for each listing and shows its work.' },
  { to: '/true-cost', icon: '💸', title: 'True Trojan Cost', body: 'Rent is not the bill. See every hidden cost, line by line, with the math.' },
  { to: '/preferences', icon: '⚙️', title: 'Preferences', body: 'Your budget, class buildings and priorities. They personalize every score in the app.' },
]

export default function HomePage() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta, refetchInterval: 60_000 })
  const incidents = useQuery({ queryKey: ['incidents-meta'], queryFn: () => api.incidents(180) })
  const m = meta.data

  return (
    <div>
      <section className="relative overflow-clip bg-gradient-to-br from-cardinal via-cardinal to-cardinal-dark text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 md:grid-cols-[1.05fr_1fr] md:py-16">
          <div className="flex flex-col gap-6">
            <span className="w-fit rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-white/20">
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-gold" />
              {m ? `${m.count} live listings · updated ${timeAgo(m.scrapedAt)}` : 'Loading live listings…'}
            </span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
              Off-campus housing that <span className="text-gold">actually works</span> for a Trojan.
            </h1>
            <p className="max-w-lg text-lg text-white/80">
              Zillow tells you the rent. TrojanScout tells you if it’s inside the DPS zone, the safest walk to class, and what you’ll actually pay each month.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); nav(`/search?q=${encodeURIComponent(q)}`) }} className="flex max-w-lg gap-2 rounded-2xl bg-white p-1.5 shadow-lg">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Try “2B2B under $3k near Viterbi”" className="min-w-0 flex-1 rounded-xl px-3 text-ink outline-none" />
              <button className="rounded-xl bg-gold px-4 py-2.5 font-semibold text-ink hover:brightness-95">Search</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => nav(`/search?q=${encodeURIComponent(e)}`)} className="rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/20 hover:bg-white/20">{e}</button>
              ))}
            </div>
          </div>
          <ZoneChecker />
        </div>
      </section>

      <section className="mx-auto -mt-8 grid max-w-4xl grid-cols-3 gap-3 px-4">
        {[
          [m?.count ?? '—', 'live listings'],
          [m ? `${Math.round((m.inDps / Math.max(m.count, 1)) * 100)}%` : '—', 'inside the DPS zone'],
          [incidents.data ? incidents.data.count.toLocaleString() : '—', 'LAPD incidents mapped (6 mo)'],
        ].map(([v, l]) => (
          <div key={l as string} className="relative rounded-2xl bg-white p-4 text-center shadow-md ring-1 ring-stone-200">
            <div className="text-2xl font-extrabold text-cardinal">{v}</div>
            <div className="text-xs text-stone-500">{l}</div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16">
        <h2 className="mb-2 text-center text-3xl font-extrabold tracking-tight">Everything a lease decision needs</h2>
        <p className="mx-auto mb-10 max-w-2xl text-center text-stone-500">Official boundaries, live listings, LAPD data and real costs, cross-referenced in seconds.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.title} to={f.to} className="group rounded-2xl border border-stone-200 bg-white p-6 transition hover:-translate-y-1 hover:border-cardinal/30 hover:shadow-lg">
              <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-cardinal-50 text-2xl">{f.icon}</div>
              <h3 className="mb-1 font-bold group-hover:text-cardinal">{f.title} →</h3>
              <p className="text-sm text-stone-500">{f.body}</p>
            </Link>
          ))}
        </div>
        {m?.medianRent && <p className="mt-8 text-center text-sm text-stone-500">Median listed price right now: <b className="text-ink">{money(m.medianRent)}</b>. Safety shown as facts, never labels. Costs are estimates.</p>}
      </section>
    </div>
  )
}
