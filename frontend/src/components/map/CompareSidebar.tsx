import { useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { ReportV2 } from '../../api/types'
import { money, priceLabel } from '../../lib/format'
import { EXPLAIN } from '../../lib/explain'
import { COMPARE_ROWS, MAX_COMPARE, useAppStore, type CompareRow } from '../../store/useAppStore'
import InfoTip from '../ui/InfoTip'
import { COLORS } from './layers'

type Row = { label: string; tip?: string; get: (r: ReportV2) => number | string | null; best?: 'min' | 'max'; fmt?: (v: number) => string }

const ROWS: Record<CompareRow, Row> = {
  price: { label: 'Listed price', get: (r) => r.listing.rent, best: 'min', fmt: money },
  trueCost: { label: 'True Trojan Cost', tip: EXPLAIN.trueCost, get: (r) => r.cost.total, best: 'min', fmt: (v) => `${money(v)}/mo` },
  perPerson: { label: 'Price unit', get: (r) => r.listing.priceUnit },
  rideshare: { label: 'Late-night rides', get: (r) => r.cost.rideshare, best: 'min', fmt: money },
  longestWalk: { label: 'Longest walk', tip: EXPLAIN.longestWalk, get: (r) => r.longestWalkMin, best: 'min', fmt: (v) => `${v} min` },
  incidents: { label: 'Incidents ≤150 m', tip: EXPLAIN.incidents, get: (r) => r.incidentFacts.total, best: 'min', fmt: (v) => `${v} (6 mo)` },
  dps: { label: 'DPS zone', tip: EXPLAIN.dps, get: (r) => (r.zones.inDps ? 'Inside' : 'Outside') },
  fryft: { label: 'Fryft area', tip: EXPLAIN.fryft, get: (r) => (r.zones.inFryft ? 'Inside' : 'Outside') },
  floorplans: { label: 'Floorplans', get: (r) => (r.listing.units ?? []).map((u) => u.label).slice(0, 4).join(', ') || '—' },
  fit: { label: 'Fit score', tip: EXPLAIN.fit, get: (r) => Math.round(r.fit.score * 100), best: 'max', fmt: (v) => `${v}/100` },
}

export default function CompareSidebar({ onFocus }: { onFocus: (id: string) => void }) {
  const { compareIds, toggleCompare, clearCompare, profile, compareRows, toggleCompareRow } = useAppStore()
  const [customize, setCustomize] = useState(false)
  const [showFit, setShowFit] = useState(false)
  const listings = useQuery({ queryKey: ['listings'], queryFn: () => api.listings() })
  const reports = useQueries({ queries: compareIds.map((id) => ({ queryKey: ['report', id, profile], queryFn: () => api.report(id, profile) })) })
  const ready = reports.map((q) => q.data).filter((r): r is ReportV2 => !!r)

  if (!compareIds.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">⚖️</div>
        <h2 className="font-bold">Compare listings</h2>
        <p className="text-sm text-stone-500">Click a dot, then <b>+ Add to compare</b>. Up to {MAX_COMPARE} side by side. Drag this panel’s left edge to resize it.</p>
        <div className="mt-2 space-y-1.5 text-left text-xs text-stone-600">
          <div><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: COLORS.inside }} />Listing inside DPS & Fryft</div>
          <div><span className="mr-2 inline-block h-3 w-3 rounded-full align-middle" style={{ background: COLORS.outside }} />Listing outside DPS & Fryft</div>
          <div><span className="mr-2 inline-block h-3 w-3 rounded-sm align-middle" style={{ background: COLORS.dps }} />DPS patrol unit (live, simulated)</div>
          <div><span className="mr-2 inline-block h-3 w-3 rounded-full border-2 border-gold bg-white align-middle" />In your compare list</div>
        </div>
      </div>
    )
  }

  const bestOf = (row: Row) => {
    if (!row.best) return null
    const vals = ready.map(row.get).filter((v): v is number => typeof v === 'number')
    return vals.length > 1 ? (row.best === 'min' ? Math.min(...vals) : Math.max(...vals)) : null
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
        <h2 className="font-bold">Compare <span className="text-stone-400">({compareIds.length}/{MAX_COMPARE})</span></h2>
        <div className="flex gap-3 text-xs font-medium">
          <button onClick={() => setCustomize(!customize)} className={customize ? 'text-cardinal' : 'text-stone-500 hover:text-cardinal'}>⚙ Rows</button>
          <button onClick={clearCompare} className="text-stone-500 hover:text-cardinal">Clear</button>
        </div>
      </div>
      {customize && (
        <div className="grid grid-cols-2 gap-1 border-b border-stone-200 bg-stone-50 px-4 py-3 text-xs">
          <p className="col-span-2 mb-1 text-stone-500">Choose what to compare:</p>
          {COMPARE_ROWS.map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={compareRows.includes(r)} onChange={() => toggleCompareRow(r)} className="accent-cardinal" />{ROWS[r].label}
            </label>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="grid gap-2 p-3" style={{ gridTemplateColumns: `repeat(${compareIds.length}, minmax(0, 1fr))` }}>
          {compareIds.map((id, i) => {
            const l = reports[i].data?.listing ?? listings.data?.find((x) => x.id === id)
            return (
              <div key={id} className="overflow-hidden rounded-xl border border-stone-200 bg-white">
                <div className="relative h-16 bg-stone-100">
                  {l?.photos?.[0] && <img src={l.photos[0]} alt="" className="h-full w-full object-cover" />}
                  <button onClick={() => toggleCompare(id)} aria-label="Remove" className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-xs">✕</button>
                </div>
                <button onClick={() => onFocus(id)} className="block w-full p-2 text-left">
                  <div className="line-clamp-2 text-xs font-semibold leading-tight hover:text-cardinal">{l?.name ?? '…'}</div>
                  <div className="text-[11px] text-stone-500">{l ? priceLabel(l) : ''}</div>
                </button>
              </div>
            )
          })}
        </div>
        <table className="w-full text-xs">
          <tbody>
            {compareRows.map((key) => {
              const row = ROWS[key]
              const best = bestOf(row)
              return (
                <tr key={key} className="border-t border-stone-100">
                  <th className="w-28 bg-stone-50 px-3 py-2 text-left font-medium text-stone-500">
                    {row.label} {row.tip && <InfoTip>{row.tip}</InfoTip>}
                  </th>
                  {reports.map((q, i) => {
                    const v = q.data ? row.get(q.data) : null
                    const isBest = best !== null && v === best
                    return (
                      <td key={compareIds[i]} className={`px-2 py-2 text-center ${isBest ? 'font-bold text-emerald-700' : ''}`}>
                        {q.isLoading ? <span className="inline-block h-3 w-10 animate-pulse rounded bg-stone-200" />
                          : v == null ? '—' : typeof v === 'number' && row.fmt ? row.fmt(v) : String(v)}
                        {isBest && ' ★'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
        {compareRows.includes('fit') && ready.length > 0 && (
          <div className="border-t border-stone-100 p-3">
            <button onClick={() => setShowFit(!showFit)} className="text-xs font-semibold text-cardinal">{showFit ? '▾' : '▸'} How the fit scores were calculated</button>
            {showFit && (
              <div className="mt-2 space-y-3">
                {ready.map((r) => (
                  <div key={r.listing.id} className="rounded-lg bg-stone-50 p-2 text-[11px]">
                    <div className="mb-1 font-semibold">{r.listing.name}: {Math.round(r.fit.score * 100)}/100</div>
                    {Object.entries(r.fit.parts).map(([k, p]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="w-16 capitalize text-stone-500">{k}</span>
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-stone-200"><span className="block h-full bg-cardinal" style={{ width: `${p.value * 100}%` }} /></span>
                        <span className="w-28 text-right text-stone-500">{Math.round(p.value * 100)} × {Math.round(p.weight * 100)}%</span>
                      </div>
                    ))}
                  </div>
                ))}
                <p className="text-[11px] text-stone-400">Score = Σ (sub-score × weight). Change the weights in Preferences.</p>
              </div>
            )}
          </div>
        )}
        <p className="p-3 text-[11px] text-stone-400">★ best in row. Costs and walks are estimates for the buildings in Preferences.</p>
      </div>
    </div>
  )
}
