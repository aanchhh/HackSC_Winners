import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { useAppStore } from '../../store/useAppStore'
import ZoneBadges from './ZoneBadges'
import CommuteBars from './CommuteBars'
import BlockSummary from './BlockSummary'
import CostBreakdown from './CostBreakdown'

export default function ReportCard({ id }: { id: number }) {
  const { buildingIds, lateNights } = useAppStore((s) => s.profile)
  const q = useQuery({
    queryKey: ['report', id, buildingIds, lateNights],
    queryFn: () => api.report(id, { buildings: buildingIds.join(','), lateNights }),
  })
  if (q.isLoading) return <div className="p-4 text-sm">Loading report…</div>
  if (q.error || !q.data) return <div className="p-4 text-sm text-red-600">Couldn’t load report.</div>
  const r = q.data
  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="font-bold">{r.listing.address}</h2>
        <p className="text-sm text-gray-600">${r.listing.rent} · {r.listing.beds} bd · Fit {Math.round(r.fitScore * 100)}</p>
      </div>
      <section><h3 className="font-semibold">🛡 Zones</h3><ZoneBadges zones={r.zones} /></section>
      <section><h3 className="font-semibold">🚶 Door-to-desk</h3><CommuteBars commute={r.commute} /></section>
      <section><h3 className="font-semibold">🏘 Block reality</h3><BlockSummary block={r.block} /></section>
      <section><h3 className="font-semibold">💸 True Trojan Cost</h3><CostBreakdown cost={r.cost} /></section>
    </div>
  )
}
