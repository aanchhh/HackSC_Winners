import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Priorities } from '../api/types'
import { money } from '../lib/format'
import { useAppStore } from '../store/useAppStore'

const PRIORITY: Record<keyof Priorities, { label: string; how: string }> = {
  cost: { label: 'Low total cost', how: 'True Cost vs your budget: full points at half your budget or less, half at exactly budget, none at 1.5×.' },
  commute: { label: 'Short commute', how: 'Your longest walk to the buildings below: full points at 0 min, none at 30+ min.' },
  zone: { label: 'DPS & Fryft coverage', how: 'Half a point for inside the DPS patrol zone, half for inside the Fryft area.' },
  incidents: { label: 'Fewer reported incidents', how: 'LAPD-reported incidents within 150 m in the last 6 months, compared with the other listings.' },
}

function Used({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600"><b className="text-ink">Where it’s used:</b> {children}</p>
}

export default function PreferencesPage() {
  const { profile, setProfile } = useAppStore()
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.buildings })
  const toggleBuilding = (id: number) =>
    setProfile({ buildingIds: profile.buildingIds.includes(id) ? profile.buildingIds.filter((x) => x !== id) : [...profile.buildingIds, id] })
  const sum = Object.values(profile.priorities).reduce((a, b) => a + b, 0) || 1
  const pct = (k: keyof Priorities) => Math.round((profile.priorities[k] / sum) * 100)

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Your preferences</h1>
        <p className="mt-1 text-stone-500">
          TrojanScout doesn’t rank listings the same way for everyone. These four settings describe <i>your</i> situation, and every
          page uses them: the commute times in map popups, the compare table, True Cost, the fit score, and Scout’s answers.
          They’re saved in this browser only, with no account needed.
        </p>
      </div>

      <section className="space-y-3 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <div className="flex justify-between"><h2 className="font-bold">💰 Monthly budget</h2><span className="text-xl font-extrabold text-cardinal">{money(profile.budget)}</span></div>
        <input type="range" min={600} max={4000} step={50} value={profile.budget} onChange={(e) => setProfile({ budget: +e.target.value })} className="w-full accent-cardinal" />
        <p className="text-sm text-stone-500">The most you want to spend each month on everything (rent plus the hidden costs), not just rent.</p>
        <Used>the <b>cost</b> part of the fit score, and the “vs your budget” bar on <Link to="/true-cost" className="text-cardinal">True Cost</Link>.</Used>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <h2 className="font-bold">🎓 Buildings you have class in</h2>
        <p className="text-sm text-stone-500">USC is big: 10 minutes from one edge can be 25 from another. Pick where you actually go.</p>
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
        <Used>door-to-desk walk/bike times in map popups; <b>longest walk</b> (your furthest building) in Compare and in the commute part of the fit score; the default destination for the 🛡 safest route.</Used>
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <div className="flex justify-between"><h2 className="font-bold">🌙 Late nights out per week</h2><span className="text-xl font-extrabold">{profile.lateNights}</span></div>
        <input type="range" min={0} max={7} value={profile.lateNights} onChange={(e) => setProfile({ lateNights: +e.target.value })} className="w-full accent-cardinal" />
        <p className="text-sm text-stone-500">Nights you’re on campus after dark (labs, library, work). Outside the Fryft area each one is a ride home you pay for.</p>
        <Used>the “late-night rides” line of True Cost (nights × 4.3 weeks × ~$6.50), which feeds the cost part of the fit score.</Used>
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-stone-200">
        <h2 className="font-bold">⚖️ What matters most</h2>
        <p className="text-sm text-stone-500">
          These sliders set how much each factor counts in a listing’s <b>fit score</b> (0–100). Each factor gets a 0–1 sub-score; the fit score is
          the weighted average. The bar shows each weight’s share after normalizing.
        </p>
        <div className="flex h-3 overflow-hidden rounded-full">
          {(Object.keys(PRIORITY) as (keyof Priorities)[]).map((k, i) => (
            <div key={k} className={['bg-cardinal', 'bg-amber-500', 'bg-emerald-600', 'bg-sky-600'][i]} style={{ width: `${pct(k)}%` }} title={`${PRIORITY[k].label} ${pct(k)}%`} />
          ))}
        </div>
        {(Object.keys(PRIORITY) as (keyof Priorities)[]).map((k, i) => (
          <div key={k}>
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${['bg-cardinal', 'bg-amber-500', 'bg-emerald-600', 'bg-sky-600'][i]}`} />{PRIORITY[k].label}</span>
              <span className="font-semibold">{pct(k)}%</span>
            </div>
            <input type="range" min={0} max={1} step={0.05} value={profile.priorities[k]}
              onChange={(e) => setProfile({ priorities: { ...profile.priorities, [k]: +e.target.value } })} className="w-full accent-cardinal" />
            <p className="text-xs text-stone-500">{PRIORITY[k].how}</p>
          </div>
        ))}
        <div className="rounded-lg bg-ink p-3 font-mono text-xs text-white">
          fit = {pct('cost')}% × cost + {pct('commute')}% × commute + {pct('zone')}% × zone + {pct('incidents')}% × incidents
        </div>
      </section>
      <p className="text-center text-xs text-stone-400">✓ Changes save automatically and apply everywhere right away.</p>
    </div>
  )
}
