import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import ListingCard from '../components/listing/ListingCard'

const EXAMPLES = [
  'private room with private bathroom under $1,200', '2B2B inside DPS', '3 bed 2 bath with parking', 'shared room cheapest',
  'studio between $1,500 and $2,000', 'furnished 1B1B 10 min walk to Viterbi', 'pet friendly near USC Village',
]
const LAYOUTS = ['Studio', '1B1B', '2B1B', '2B2B', '3B2B', '3B3B']
const ROOM_TYPES = [['', 'Any type'], ['entire', 'Entire unit'], ['private_room', 'Private room'], ['shared_room', 'Shared room']]

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const ignore = params.get('ignore') ?? ''
  const [draft, setDraft] = useState(q)
  const [roomType, setRoomType] = useState('')
  const [layout, setLayout] = useState('')
  const [privateBath, setPrivateBath] = useState(false)
  const [maxRent, setMaxRent] = useState('')
  useEffect(() => { setDraft(q) }, [q])

  const lay = layout === 'Studio' ? { beds: 0, baths: undefined } : layout ? { beds: +layout[0], baths: +layout[2] } : {}
  const search = useQuery({
    queryKey: ['search', q, ignore, roomType, layout, privateBath, maxRent],
    queryFn: () => api.search({ q, k: 36, ignore, roomType: roomType || undefined, privateBath: privateBath || undefined, maxRent: maxRent || undefined, ...lay }),
    placeholderData: keepPreviousData,
  })
  const r = search.data
  const drop = (key: string) => { const p = new URLSearchParams(params); p.set('ignore', [...ignore.split(',').filter(Boolean), key].join(',')); setParams(p) }
  const go = (text: string) => setParams(text ? { q: text } : {})

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Smart search</h1>
      <p className="mb-5 max-w-3xl text-stone-500">
        Write it the way you’d say it. TrojanScout reads price, room type (entire / private / shared), bedrooms & bathrooms (2B2B, 3 bed 2 bath),
        private bathrooms, amenities, “inside DPS”, and walk time to a building, then ranks what’s left by meaning and keywords.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); go(draft) }} className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. furnished 2B2B under $3,200, 10 min walk to Viterbi, inside DPS"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-cardinal focus:ring-2 focus:ring-cardinal/20" />
        <button className="rounded-xl bg-cardinal px-6 font-semibold text-white hover:bg-cardinal-dark">Search</button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((e) => <button key={e} onClick={() => go(e)} className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-stone-200 hover:ring-cardinal">{e}</button>)}
      </div>

      {r && (q || r.understood.length > 0) && (
        <div className="mt-5 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">Understood as:</span>
            {r.understood.length === 0 && <span className="text-stone-500">no hard filters, ranking by meaning only</span>}
            {r.understood.map((c) => (
              <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-cardinal-50 px-3 py-1 text-xs font-semibold text-cardinal ring-1 ring-red-200">
                {c.label}<button onClick={() => drop(c.key)} aria-label={`Remove ${c.label}`} className="ml-0.5 opacity-60 hover:opacity-100">✕</button>
              </span>
            ))}
            {r.semanticText && <span className="text-xs text-stone-500">+ ranked by “{r.semanticText}”</span>}
          </div>
          <p className="mt-2 text-[11px] text-stone-400">
            {r.count} results in {r.tookMs} ms · parsed by {r.parser === 'rules+llm' ? 'rules + LLM' : 'built-in language rules (add an LLM key for even better understanding)'}
            {ignore && <> · <button className="font-medium text-cardinal" onClick={() => { const p = new URLSearchParams(params); p.delete('ignore'); setParams(p) }}>restore removed filters</button></>}
          </p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <select value={roomType} onChange={(e) => setRoomType(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5">
          {ROOM_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="flex overflow-hidden rounded-lg ring-1 ring-stone-300">
          {LAYOUTS.map((l) => (
            <button key={l} onClick={() => setLayout(layout === l ? '' : l)} className={`px-2.5 py-1.5 text-xs font-semibold ${layout === l ? 'bg-cardinal text-white' : 'bg-white hover:bg-stone-50'}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 ring-1 ring-stone-300"><input type="checkbox" checked={privateBath} onChange={(e) => setPrivateBath(e.target.checked)} className="accent-cardinal" />Private bathroom</label>
        <select value={maxRent} onChange={(e) => setMaxRent(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5">
          <option value="">Any price</option>{[900, 1200, 1500, 2000, 3000, 4000].map((v) => <option key={v} value={v}>Under ${v.toLocaleString()}</option>)}
        </select>
      </div>

      {search.isError && <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">{(search.error as Error).message}</p>}
      {r?.count === 0 && <p className="mt-8 text-center text-stone-500">No listings match all of that. Remove a filter chip above to widen the search.</p>}
      <div className={`mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${search.isFetching ? 'opacity-60' : ''}`}>
        {r?.results.map((h) => <ListingCard key={h.id} listing={h} showRanks={!!r.semanticText} />)}
      </div>

      <details className="mt-10 rounded-2xl bg-white p-5 text-sm text-stone-600 ring-1 ring-stone-200">
        <summary className="cursor-pointer font-semibold text-ink">How smart search works</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li><b>Understand</b>: language rules (plus an LLM if configured) pull out price, room type, bed/bath layout, private bathroom, amenities, zones and walk time.</li>
          <li><b>Filter</b>: those become hard constraints, checked per floorplan, so “2B2B under $3k” needs a 2B2B unit under $3k.</li>
          <li><b>Rank</b>: what’s left of your words is matched by meaning (bge-small embeddings in FAISS) and exact keywords (BM25), fused, then re-ranked by a cross-encoder.</li>
        </ol>
      </details>
    </div>
  )
}
