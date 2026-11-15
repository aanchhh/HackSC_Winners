import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import type { ListingV2 } from '../../api/types'
import { money, priceLabel } from '../../lib/format'
import { EXPLAIN } from '../../lib/explain'
import { MAX_COMPARE, useAppStore } from '../../store/useAppStore'
import ZoneBadges from '../listing/ZoneBadges'
import FloorplanList from '../listing/FloorplanList'
import InfoTip from '../ui/InfoTip'

// Report Card content, shown in a popup right next to the dot.
export default function ListingPopup({ listing, onResize, onSafeRoute }: { listing: ListingV2; onResize: () => void; onSafeRoute: (l: ListingV2) => void }) {
  const profile = useAppStore((s) => s.profile)
  const { compareIds, toggleCompare } = useAppStore()
  const q = useQuery({ queryKey: ['report', listing.id, profile], queryFn: () => api.report(listing.id, profile) })
  useEffect(() => { onResize() }, [q.status, onResize])
  const comparing = compareIds.includes(listing.id)
  const full = !comparing && compareIds.length >= MAX_COMPARE
  const r = q.data

  return (
    <div className="text-ink">
      {listing.photos?.[0] && <img src={listing.photos[0]} alt="" className="h-28 w-full object-cover" onLoad={onResize} />}
      <div className="max-h-[52vh] space-y-3 overflow-y-auto p-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">{listing.source}</div>
          <div className="text-base font-bold leading-tight">{listing.name}</div>
          <div className="text-xs text-stone-500">{listing.address}</div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-extrabold text-cardinal">{priceLabel(listing)}</span>
          {r && <span className="rounded-full bg-gold-50 px-2 py-0.5 text-xs font-bold ring-1 ring-gold">Fit {Math.round(r.fit.score * 100)} <InfoTip side="left">{EXPLAIN.fit}</InfoTip></span>}
        </div>
        <ZoneBadges inDps={r?.zones.inDps ?? listing.inDps} inFryft={r?.zones.inFryft ?? listing.inFryft} />
        {!!listing.units?.length && <FloorplanList units={listing.units} compact />}

        {q.isLoading && <div className="h-20 animate-pulse rounded-lg bg-stone-100" />}
        {r && (
          <>
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-stone-500">🚶 Door-to-desk · longest {r.longestWalkMin} min <InfoTip side="left">{EXPLAIN.longestWalk}</InfoTip></div>
              <ul className="space-y-0.5 text-xs">
                {r.commute.map((c) => (
                  <li key={c.building} className="flex justify-between"><span>{c.building}</span>
                    <span className="text-stone-600">🚶 {c.walk}m · 🚲 {c.bike}m{c.tram != null && <> · 🚋 {c.tram}m</>}</span></li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl bg-stone-50 p-2.5">
              <div className="flex justify-between text-xs"><span className="font-semibold text-stone-500">💸 True Trojan Cost</span><span className="font-bold">{money(r.cost.total)}/mo</span></div>
              <div className="mt-1 text-[11px] text-stone-500">rent {money(r.cost.rent)} + utilities {money(r.cost.utilities)} + rides {money(r.cost.rideshare)} (est.)</div>
            </div>
            <div className="text-xs text-stone-600">
              <span className="font-semibold text-stone-500">🏘 Block facts <InfoTip side="left">{EXPLAIN.incidents}</InfoTip></span>
              <p className="mt-0.5">{r.block.summary}</p>
            </div>
          </>
        )}
        <button onClick={() => onSafeRoute(listing)} className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
          🛡 Safest walk to class
        </button>
        <div className="flex gap-2">
          <button disabled={full} onClick={() => toggleCompare(listing.id)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40 ${comparing ? 'bg-gold text-ink' : 'bg-cardinal text-white hover:bg-cardinal-dark'}`}>
            {comparing ? '✓ In compare' : full ? `Compare full (${MAX_COMPARE})` : '+ Add to compare'}
          </button>
          {listing.url && <a href={listing.url} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-2 text-sm font-semibold !text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">View ↗</a>}
        </div>
      </div>
    </div>
  )
}
