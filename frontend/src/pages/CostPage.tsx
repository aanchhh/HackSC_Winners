import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { money, priceLabel } from '../lib/format'
import { useAppStore } from '../store/useAppStore'

const PARTS = [
  { key: 'rent', label: 'Rent', color: 'bg-cardinal' },
  { key: 'utilities', label: 'Utilities', color: 'bg-amber-500' },
  { key: 'transit', label: 'Metro pass', color: 'bg-sky-600' },
  { key: 'rideshare', label: 'Late-night rides', color: 'bg-orange-600' },
] as const

export default function CostPage() {
  const profile = useAppStore((s) => s.profile)
  const listings = useQuery({ queryKey: ['listings'], queryFn: () => api.listings() })
  const [mode, setMode] = useState<'listing' | 'custom'>('listing')
  const [listingId, setListingId] = useState('')
  const [filter, setFilter] = useState('')
  const [rent, setRent] = useState(1300)
  const [utilities, setUtilities] = useState(90)
  const [inFryft, setInFryft] = useState(false)
  const [lateNights, setLateNights] = useState(profile.lateNights)
  const [needsMetro, setNeedsMetro] = useState(false)

  const options = useMemo(() => (listings.data ?? []).filter((l) => l.rent != null && `${l.name} ${l.address}`.toLowerCase().includes(filter.toLowerCase())), [listings.data, filter])
  const selected = listings.data?.find((l) => l.id === listingId) ?? options[0]

  const body = mode === 'listing' && selected
    ? { listingId: selected.id, lateNights, needsMetro }
    : { rent, utilities, inFryft, lateNights, needsMetro }
  const cost = useQuery({ queryKey: ['true-cost', body], queryFn: () => api.trueCost(body), enabled: mode === 'custom' || !!selected })
  const c = cost.data

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">True Trojan Cost</h1>
      <p className="mb-6 text-stone-500">The listed rent is not what you’ll pay. Here’s the full monthly number, with every assumption shown.</p>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5 rounded-2xl bg-white p-5 ring-1 ring-stone-200">
          <div className="grid grid-cols-2 rounded-xl bg-stone-100 p-1 text-sm font-medium">
            {(['listing', 'custom'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`rounded-lg py-1.5 ${mode === m ? 'bg-white shadow' : 'text-stone-500'}`}>
                {m === 'listing' ? 'A live listing' : 'Custom numbers'}
              </button>
            ))}
          </div>
          {mode === 'listing' ? (
            <div className="space-y-2">
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or street…" className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              <select value={selected?.id ?? ''} onChange={(e) => setListingId(e.target.value)} size={7} className="w-full rounded-lg border border-stone-300 text-sm">
                {options.map((l) => <option key={l.id} value={l.id}>{l.name} · {priceLabel(l)}</option>)}
              </select>
              {selected && <p className="text-xs text-stone-500">{selected.inFryft ? 'Inside' : 'Outside'} Fryft · {selected.inDps ? 'inside' : 'outside'} DPS · {selected.source}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              <Slider label="Monthly rent" value={rent} set={setRent} min={500} max={5000} step={25} fmt={money} />
              <Slider label="Utilities" value={utilities} set={setUtilities} min={0} max={300} step={5} fmt={money} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inFryft} onChange={(e) => setInFryft(e.target.checked)} className="accent-cardinal" />Inside the Fryft area</label>
            </div>
          )}
          <hr className="border-stone-200" />
          <Slider label="Late nights out per week" value={lateNights} set={setLateNights} min={0} max={7} step={1} fmt={(v) => `${v}`} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={needsMetro} onChange={(e) => setNeedsMetro(e.target.checked)} className="accent-cardinal" />I’ll need a Metro pass</label>
        </div>

        <div className="space-y-5">
          <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-sm text-stone-500">Estimated monthly total</div>
                <div className="text-5xl font-extrabold text-cardinal">{c ? money(c.total) : '—'}</div>
              </div>
              {c && c.rent > 0 && (
                <div className="rounded-xl bg-gold-50 px-4 py-2 text-right ring-1 ring-gold">
                  <div className="text-xs text-stone-600">vs listed rent</div>
                  <div className="text-xl font-bold">+{money(c.total - c.rent)} <span className="text-sm font-medium text-stone-500">(+{Math.round(((c.total - c.rent) / c.rent) * 100)}%)</span></div>
                </div>
              )}
            </div>
            {c && (
              <>
                <div className="mt-6 flex h-5 overflow-hidden rounded-full bg-stone-100">
                  {PARTS.map((p) => c[p.key] > 0 && <div key={p.key} className={p.color} style={{ width: `${(c[p.key] / c.total) * 100}%` }} title={p.label} />)}
                </div>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {PARTS.map((p) => (
                    <li key={p.key} className="flex items-center justify-between rounded-xl bg-stone-50 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${p.color}`} />{p.label}</span>
                      <span className="font-semibold">{money(c[p.key])}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm font-semibold">Over a 12-month lease: {money(c.total * 12)}</p>
              </>
            )}
          </div>
          {c && (
            <div className="rounded-2xl bg-white p-5 text-sm ring-1 ring-stone-200">
              <h2 className="mb-2 font-bold">Assumptions</h2>
              <ul className="list-disc space-y-1 pl-5 text-stone-600">{c.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              <p className="mt-3 text-xs text-stone-400">All figures are estimates. Rideshare applies only outside the Fryft area (late nights × 4.3 weeks × average fare).</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Slider({ label, value, set, min, max, step, fmt }: { label: string; value: number; set: (v: number) => void; min: number; max: number; step: number; fmt: (v: number) => string }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span className="font-semibold">{fmt(value)}</span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => set(+e.target.value)} className="w-full accent-cardinal" />
    </div>
  )
}
