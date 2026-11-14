import type { Cost } from '../../api/types'
export default function CostBreakdown({ cost }: { cost: Cost }) {
  const rows: [string, number][] = [['Rent', cost.rent], ['Utilities', cost.utilities], ['Transit', cost.transit], ['Rideshare (est.)', cost.rideshare]]
  return (
    <div className="text-sm">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between"><span>{k}</span><span>${v}</span></div>)}
      <div className="mt-1 flex justify-between border-t pt-1 font-bold"><span>True Trojan Cost</span><span>${cost.total}/mo</span></div>
      <p className="mt-1 text-xs text-gray-500">Estimates. Assumptions: {cost.assumptions.join('; ')}</p>
    </div>
  )
}
