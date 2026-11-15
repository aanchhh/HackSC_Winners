import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import FreeCard from '../components/free/FreeCard'
import { CATEGORY_ICON, searchFree, upcomingFree } from '../lib/free'

const EXAMPLES = [
  'free ride home tonight', "I've been drinking and can't drive", 'someone is following me', 'my drink might be spiked',
  "can't afford the bus", 'my bike got stolen', 'stalker knows my address', 'harassed on the train', 'free stuff new years eve',
]

export default function FreePage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const [category, setCategory] = useState('')
  const [nowOnly, setNowOnly] = useState(false)
  const [usc, setUsc] = useState(true)
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  useEffect(() => { setDraft(q) }, [q])

  const res = useQuery({
    queryKey: ['free', q, category, nowOnly, usc, here],
    queryFn: () => searchFree({ q, category: category || undefined, availableNow: nowOnly || undefined, usc, lat: here?.lat ?? 34.0224, lng: here?.lng ?? -118.2851 }),
    placeholderData: keepPreviousData, refetchInterval: 60_000,
  })
  const up = useQuery({ queryKey: ['free-upcoming'], queryFn: upcomingFree })
  const r = res.data

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-sm text-white">
        <span className="font-semibold">In danger right now?</span>
        <a href="tel:911" className="rounded-lg bg-red-600 px-3 py-1 font-bold !text-white">911</a>
        <a href="tel:2137404321" className="rounded-lg bg-white/10 px-3 py-1 font-semibold !text-white ring-1 ring-white/20">USC DPS 213-740-4321</a>
        <a href="tel:988" className="rounded-lg bg-white/10 px-3 py-1 font-semibold !text-white ring-1 ring-white/20">988 crisis line</a>
        <span className="text-xs text-white/60">Blue-light phones on campus connect straight to DPS.</span>
      </div>

      <h1 className="text-3xl font-extrabold tracking-tight">Free & Safe</h1>
      <p className="mb-5 max-w-3xl text-stone-500">
        Free rides, escorts, apps, money help and lesser-known programs from USC, LA, California and beyond, in one place. Describe your
        situation and we'll show what you can use right now, where you are, with the official source for each.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); setParams(draft ? { q: draft } : {}) }} className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="What's going on? e.g. “need a free ride home tonight”"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-cardinal focus:ring-2 focus:ring-cardinal/20" />
        <button className="rounded-xl bg-cardinal px-6 font-semibold text-white">Search</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => <button key={e} onClick={() => setParams({ q: e })} className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-stone-200 hover:ring-cardinal">{e}</button>)}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-stone-300"><input type="checkbox" checked={nowOnly} onChange={(e) => setNowOnly(e.target.checked)} className="accent-cardinal" />Available right now</label>
        <label className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-stone-300"><input type="checkbox" checked={usc} onChange={(e) => setUsc(e.target.checked)} className="accent-cardinal" />I'm a USC student</label>
        <button onClick={() => navigator.geolocation?.getCurrentPosition((p) => setHere({ lat: p.coords.latitude, lng: p.coords.longitude }))}
          className={`rounded-lg px-2.5 py-1.5 ring-1 ${here ? 'bg-emerald-50 ring-emerald-300' : 'bg-white ring-stone-300'}`}>📍 {here ? 'Using your location' : 'Use my location'}</button>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5">
          <option value="">All categories</option>
          {r?.categories.map((c) => <option key={c} value={c}>{CATEGORY_ICON[c] ?? ''} {c}</option>)}
        </select>
        {r && <span className="ml-auto text-xs text-stone-500">{r.count} programs · times in LA</span>}
      </div>

      {r && (r.understood.length > 0 || r.tonight || r.availableNow) && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-semibold">Understood:</span>
          {r.understood.map((u) => <span key={u} className="rounded-full bg-cardinal-50 px-3 py-0.5 text-xs font-semibold text-cardinal ring-1 ring-red-200">{u}</span>)}
          {r.availableNow && <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Available right now</span>}
          {r.tonight && <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">Tonight</span>}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className={`grid content-start gap-4 sm:grid-cols-2 ${res.isFetching ? 'opacity-60' : ''}`}>
          {res.isError && <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700 sm:col-span-2">{(res.error as Error).message}</p>}
          {r?.results.map((p) => <FreeCard key={p.id} p={p} />)}
          {r?.count === 0 && <p className="text-stone-500 sm:col-span-2">Nothing matches that right now. Try turning off “Available right now”.</p>}
        </div>
        <aside className="space-y-3">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-stone-200">
            <h2 className="mb-2 font-bold">🎉 Coming up free</h2>
            <p className="mb-3 text-xs text-stone-500">Limited-time offers like free holiday rides. They're easy to miss, so they're collected here.</p>
            <ul className="space-y-3">
              {up.data?.map((u) => (
                <li key={u.id + u.status.next} className="border-l-2 border-gold pl-3">
                  <div className="text-sm font-semibold leading-tight">{u.name}</div>
                  <div className={`text-xs ${u.status.state === 'open' ? 'font-semibold text-emerald-700' : 'text-amber-800'}`}>{u.status.label}</div>
                  {u.how.phone && <a href={`tel:${u.how.phone.replace(/[^\d+]/g, '')}`} className="text-xs font-semibold text-cardinal">📞 {u.how.phone}</a>}
                  {u.confidence === 'check' && <div className="text-[10px] text-stone-400">Confirm this year's dates</div>}
                </li>
              ))}
              {!up.data?.length && <li className="text-xs text-stone-400">Nothing scheduled in the next few months.</li>}
            </ul>
          </div>
          <div className="rounded-2xl bg-white p-4 text-xs text-stone-500 ring-1 ring-stone-200">
            <h2 className="mb-1 text-sm font-bold text-ink">How this list stays honest</h2>
            Every program links its official source and the date we checked it. Where sources disagree (e.g. Fryft hours changed in 2025), it says so.
            Add or fix a program in <code>data/free_programs.json</code>; search and statuses update automatically.
          </div>
        </aside>
      </div>
    </div>
  )
}
