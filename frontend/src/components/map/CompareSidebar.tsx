import { useQueries, useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { Report } from '../../api/types'
import { bedsLabel, money, priceLabel } from '../../lib/format'
import { MAX_COMPARE, useAppStore } from '../../store/useAppStore'

type Row = { label: string; get: (r: Report) => number | string | null; best?: 'min' | 'max'; fmt?: (v: number) => string }

const ROWS: Row[] = [
  { label: 'Listed price', get: (r) => r.listing.rent, best: 'min', fmt: money },
  { label: 'True Trojan Cost', get: (r) => r.cost.total, best: 'min', fmt: (v) => `${money(v)}/mo` },
  { label: 'Rideshare (est.)', get: (r) => r.cost.rideshare, best: 'min', fmt: money },
  { label: 'Longest walk', get: (r) => Math.max(...r.commute.map((c) => c.walk)), best: 'min', fmt: (v) => `${v} min` },
  { label: 'To campus', get: (r) => r.listing.distanceToCampusMi ?? null, best: 'min', fmt: (v) => `${v} mi` },
  { label: 'DPS zone', get: (r) => (r.zones.inDps ? 'Inside' : 'Outside') },
  { label: 'Fryft zone', get: (r) => (r.zones.inFryft ? 'Inside' : 'Outside') },
  { label: 'Beds', get: (r) => bedsLabel(r.listing) || '—' },
  { label: 'Fit score', get: (r) => Math.round(r.fitScore * 100), best: 'max', fmt: (v) => `${v}/100` },
]

export default function CompareSidebar({ onFocus }: { onFocus: (id: string) => void }) {
  const { compareIds, toggleCompare, clearCompare, profile } = useAppStore()
  const listings = useQuery({ queryKey: ['listings'], queryFn: () => api.listings() })
  const reports = useQueries({ queries: compareIds.map((id) => ({ queryKey: ['report', id, profile.buildingIds, profile.lateNights, profile.budget], queryFn: () => api.report(id, profile) })) })
  const ready = reports.map((q) => q.data).filter((r): r is Report => !!r)

  if (!compareIds.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="text-4xl">⚖️</div>
        <h2 className="font-bold">Compare listings</h2>
        <p className="text-sm text-stone-500">Click a dot on the map, then <b>+ Add to compare</b>. Up to {MAX_COMPARE} side by side.</p>
        <div className="mt-2 space-y-1 text-left text-xs text-stone-500">
          <div><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-600" />Inside DPS patrol zone</div>
          <div><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-orange-600" />Outside DPS patrol zone</div>
          <div><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-gold bg-white" />In your compare list</div>
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
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
        <h2 className="font-bold">Compare <span className="text-stone-400">({compareIds.length}/{MAX_COMPARE})</span></h2>
        <button onClick={clearCompare} className="text-xs font-medium text-stone-500 hover:text-cardinal">Clear all</button>
      </div>
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
            {ROWS.map((row) => {
              const best = bestOf(row)
              return (
                <tr key={row.label} className="border-t border-stone-100">
                  <th className="w-24 bg-stone-50 px-3 py-2 text-left font-medium text-stone-500">{row.label}</th>
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
        <p className="p-3 text-[11px] text-stone-400">★ best in row. Costs and commute times are estimates; commute uses the buildings in Preferences.</p>
      </div>
    </div>
  )
}
