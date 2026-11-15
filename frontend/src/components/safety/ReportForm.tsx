import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { REPORT_CATEGORIES, report } from '../../lib/recent'
import { identity } from '../../lib/rides'

/** Student report at a map point. Shown to others as "unverified"; emergencies go to 911 / DPS first. */
export default function ReportForm({ at, onDone }: { at: [number, number]; onDone: () => void }) {
  const [category, setCategory] = useState(REPORT_CATEGORIES[0])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()
  const submit = async () => {
    setBusy(true)
    try {
      await report({ lat: at[0], lng: at[1], category, description: text, userId: identity().id })
      qc.invalidateQueries({ queryKey: ['recent'] }); qc.invalidateQueries({ queryKey: ['reports'] })
      onDone()
    } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2 text-sm">
      <p className="rounded-lg bg-red-50 p-2 text-xs text-red-800">In danger right now? Call <a href="tel:911" className="font-bold">911</a> or DPS <a href="tel:2137404321" className="font-bold">213-740-4321</a> first.</p>
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2">
        {REPORT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={280} rows={3} placeholder="What happened? Facts only, no descriptions of people's race or appearance."
        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" />
      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="flex-1 rounded-lg bg-cardinal py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Share with students'}</button>
        <button onClick={onDone} className="rounded-lg px-3 py-2 text-stone-600 ring-1 ring-stone-300">Cancel</button>
      </div>
      <p className="text-[11px] text-stone-400">Shown as an unverified student report for 7 days. It doesn't reach DPS or LAPD.</p>
    </div>
  )
}
