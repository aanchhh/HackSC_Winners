import type { Commute } from '../../api/types'
export default function CommuteBars({ commute }: { commute: Commute[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {commute.map((c) => (
        <li key={c.building}>
          <b>{c.building}</b>: 🚶 {c.walk}m · 🚲 {c.bike}m{c.tram != null && <> · 🚋 {c.tram}m</>}
        </li>
      ))}
    </ul>
  )
}
