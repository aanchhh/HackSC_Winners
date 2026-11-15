import { CATEGORY_ICON, ELIGIBILITY, type FreeProgram } from '../../lib/free'

const STATE_STYLE = {
  open: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  closed: 'bg-stone-100 text-stone-600 ring-stone-200',
  upcoming: 'bg-gold-50 text-amber-800 ring-gold',
  info: 'bg-stone-50 text-stone-500 ring-stone-200',
}

export default function FreeCard({ p, compact = false }: { p: FreeProgram; compact?: boolean }) {
  return (
    <article className={`flex flex-col gap-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200 ${!p.eligible ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-cardinal-50 text-xl">{CATEGORY_ICON[p.category] ?? '✨'}</span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-tight">{p.name}</h3>
          <p className="text-xs text-stone-500">{p.provider}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${p.cost === 'Free' ? 'bg-emerald-600 text-white' : 'bg-stone-200 text-stone-700'}`}>{p.cost}</span>
      </div>
      <span className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATE_STYLE[p.status.state]}`}>
        {p.status.state === 'open' ? '● ' : ''}{p.status.label}
      </span>
      <p className="text-sm text-stone-700">{p.summary}</p>
      {!compact && (
        <div className="flex flex-wrap gap-1">
          {p.eligibility.map((e) => <span key={e} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{ELIGIBILITY[e] ?? e}</span>)}
          {p.areaOk === true && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700">✓ covers your location</span>}
          {p.areaOk === false && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">Not at your location</span>}
          {!p.eligible && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">USC students only</span>}
        </div>
      )}
      {p.caveats && !compact && <p className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">⚠ {p.caveats}</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {p.how.phone && <a href={`tel:${p.how.phone.replace(/[^\d+]/g, '')}`} className="rounded-lg bg-cardinal px-3 py-1.5 text-xs font-semibold !text-white">📞 {p.how.phone}</a>}
        {p.how.url && <a href={p.how.url} target="_blank" rel="noreferrer" className="rounded-lg px-3 py-1.5 text-xs font-semibold !text-stone-700 ring-1 ring-stone-300 hover:bg-stone-50">Open ↗</a>}
        {p.how.app && <span className="text-xs text-stone-500">📱 {p.how.app}</span>}
      </div>
      {!compact && (
        <p className="text-[10px] text-stone-400">
          {p.confidence === 'check' ? 'Sources disagree or not yet confirmed for 2026 · ' : ''}Checked {p.verified} ·{' '}
          {p.sources.slice(0, 2).map((s, i) => <a key={s} href={s} target="_blank" rel="noreferrer" className="underline">{i ? ' · ' : ''}source {i + 1}</a>)}
        </p>
      )}
    </article>
  )
}
