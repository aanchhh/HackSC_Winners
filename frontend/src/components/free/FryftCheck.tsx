import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { searchFree } from '../../lib/free'
import type { Place } from '../../lib/rides'

/** Before you pay: does this exact trip qualify for a free Fryft ride (both ends in the zone, within hours)? */
export default function FryftCheck({ pickup, drop }: { pickup: Place; drop: Place }) {
  const zones = useQuery({
    queryKey: ['fryft-check', pickup.lat, pickup.lng, drop.lat, drop.lng],
    queryFn: async () => Promise.all([api.zoneCheck(pickup.lat, pickup.lng), api.zoneCheck(drop.lat, drop.lng)]),
  })
  const fryft = useQuery({ queryKey: ['fryft-status'], queryFn: () => searchFree({ q: 'fryft free lyft ride home', usc: true }), refetchInterval: 60_000 })
  const z = zones.data
  const p = fryft.data?.results.find((x) => x.id === 'fryft')
  if (!z || !p) return null
  const both = z[0].inFryft && z[1].inFryft
  if (!both) {
    return <p className="rounded-lg bg-stone-50 p-2 text-xs text-stone-500">Free Fryft needs both ends inside the zone; {z[0].inFryft ? 'your drop-off' : 'your pickup'} is outside it.</p>
  }
  return (
    <div className={`rounded-xl p-3 text-sm ring-1 ${p.status.state === 'open' ? 'bg-emerald-50 ring-emerald-300' : 'bg-gold-50 ring-gold'}`}>
      <div className="font-bold">{p.status.state === 'open' ? '🎉 This trip can be free with Fryft' : '🌙 This trip qualifies for free Fryft later'}</div>
      <div className="text-xs text-stone-600">Both ends are inside the Fryft zone · {p.status.label}. Open the Lyft app with your USC profile.</div>
      {p.confidence === 'check' && <div className="mt-0.5 text-[10px] text-stone-400">Fryft hours changed in 2025; confirm on USC Transportation.</div>}
    </div>
  )
}
