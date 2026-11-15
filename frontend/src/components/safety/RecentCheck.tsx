import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { recentNear } from '../../lib/recent'

/** "Has anything happened here in the last 24 hours?": DPS alerts + student reports (+ LAPD, which lags ~2 weeks). */
export default function RecentCheck({ at, label = 'your destination', compact = false }: { at: [number, number] | null; label?: string; compact?: boolean }) {
  const [hours, setHours] = useState(24)
  const q = useQuery({ queryKey: ['recent', at, hours], queryFn: () => recentNear(at![0], at![1], hours), enabled: !!at, refetchInterval: 5 * 60_000 })
  if (!at) return null
  const r = q.data
  const quiet = r && r.count === 0
  return (
    <div className={`rounded-xl p-3 text-xs ring-1 ${!r ? 'bg-stone-50 ring-stone-200' : quiet ? 'bg-emerald-50 ring-emerald-200' : 'bg-red-50 ring-red-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-ink">{quiet ? '✓' : r ? '⚠' : '…'} Last {hours === 24 ? '24 hours' : `${hours / 24} days`} near {label}</span>
        <button onClick={() => setHours(hours === 24 ? 168 : 24)} className="shrink-0 font-semibold text-cardinal">{hours === 24 ? 'Show 7 days' : 'Show 24 h'}</button>
      </div>
      {q.isLoading && <div className="mt-1 h-3 w-40 animate-pulse rounded bg-stone-200" />}
      {quiet && <p className="mt-0.5 text-stone-600">No USC DPS alerts or student reports within {r.radiusM} m.</p>}
      {r && r.count > 0 && (
        <ul className="mt-1 space-y-1">
          {r.items.slice(0, compact ? 2 : 4).map((i) => (
            <li key={i.at + i.title} className="text-stone-700">
              <b>{i.title}</b> · {i.when} · {i.distanceM} m away{i.precision === 'campus' ? ' (location given only as “campus”)' : ''}
              <div className="text-[11px] text-stone-500">{i.verified ? 'USC DPS alert' : 'Student report (unverified)'} · {i.where.slice(0, 80)}{i.url && <> · <a href={i.url} target="_blank" rel="noreferrer" className="underline">details</a></>}</div>
            </li>
          ))}
        </ul>
      )}
      {r && !compact && <p className="mt-1 text-[10px] text-stone-400">LAPD: {r.lapd.lastTwoWeeks} reports within {r.radiusM} m in the latest 2 weeks of data ({r.lapd.severe} violent). LAPD publishes with a ~2-week lag.</p>}
    </div>
  )
}
