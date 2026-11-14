import type { Zones } from '../../api/types'
export default function ZoneBadges({ zones }: { zones: Zones }) {
  const b = (ok: boolean, label: string) => (
    <span className={`rounded px-2 py-0.5 text-xs ${ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
      {ok ? 'Inside' : 'Outside'} {label}
    </span>
  )
  return (
    <div className="space-y-2">
      <div className="flex gap-2">{b(zones.inDps, 'DPS')}{b(zones.inFryft, 'Fryft')}</div>
      {!zones.inFryft && (
        <div className="rounded bg-amber-100 p-2 text-xs text-amber-900">
          Outside the Fryft area ({zones.metersToFryftEdge} m from the edge). Late-night rides home are not free.
        </div>
      )}
    </div>
  )
}
