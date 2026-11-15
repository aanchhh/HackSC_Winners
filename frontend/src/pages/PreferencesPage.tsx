import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Priorities } from '../api/types'
import { money } from '../lib/format'
import { useAppStore } from '../store/useAppStore'

const PRIORITY_LABELS: Record<keyof Priorities, string> = { cost: 'Low total cost', commute: 'Short commute', zone: 'DPS & Fryft coverage', incidents: 'Fewer reported incidents' }

export default function PreferencesPage() {
  const { profile, setProfile } = useAppStore()
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.buildings })
  const toggleBuilding = (id: number) =>
    setProfile({ buildingIds: profile.buildingIds.includes(id) ? profile.buildingIds.filter((x) => x !== id) : [...profile.buildingIds, id] })

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your preferences</h1>
        <p className="text-stone-500">Used by the map popups, compare view, True Cost and Scout. Saved in this browser.</p>
      </div>

      <section className="space-y-3 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <div className="flex justify-between"><h2 className="font-bold">Monthly budget</h2><span className="text-xl font-extrabold text-cardinal">{money(profile.budget)}</span></div>
        <input type="range" min={600} max={4000} step={50} value={profile.budget} onChange={(e) => setProfile({ budget: +e.target.value })} className="w-full accent-cardinal" />
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <h2 className="font-bold">Buildings you have class in</h2>
        <p className="text-sm text-stone-500">Commute times are calculated door-to-desk to these.</p>
        <div className="flex flex-wrap gap-2">
          {buildings.data?.map((b) => {
            const on = profile.buildingIds.includes(b.id)
            return (
              <button key={b.id} onClick={() => toggleBuilding(b.id)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${on ? 'bg-cardinal text-white ring-cardinal' : 'bg-white ring-stone-300 hover:ring-cardinal'}`}>
                {on ? '✓ ' : ''}{b.name}
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <div className="flex justify-between"><h2 className="font-bold">Late nights out per week</h2><span className="text-xl font-extrabold">{profile.lateNights}</span></div>
        <p className="text-sm text-stone-500">Labs, library, work shifts. Outside Fryft, each one is a paid ride home.</p>
        <input type="range" min={0} max={7} value={profile.lateNights} onChange={(e) => setProfile({ lateNights: +e.target.value })} className="w-full accent-cardinal" />
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <h2 className="font-bold">What matters most</h2>
        <p className="text-sm text-stone-500">These weights drive the fit score.</p>
        {(Object.keys(PRIORITY_LABELS) as (keyof Priorities)[]).map((k) => (
          <div key={k}>
            <div className="flex justify-between text-sm"><span>{PRIORITY_LABELS[k]}</span><span className="font-semibold">{Math.round(profile.priorities[k] * 100)}</span></div>
            <input type="range" min={0} max={1} step={0.05} value={profile.priorities[k]}
              onChange={(e) => setProfile({ priorities: { ...profile.priorities, [k]: +e.target.value } })} className="w-full accent-cardinal" />
          </div>
        ))}
      </section>
      <p className="text-center text-xs text-stone-400">✓ Changes save automatically</p>
    </div>
  )
}
