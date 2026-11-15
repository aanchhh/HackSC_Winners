import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import ListingCard from '../components/listing/ListingCard'

const EXAMPLES = ['furnished room under $1,200', 'studio near Figueroa', '3 bed house with washer dryer', 'private bathroom inside DPS', 'Portland St']

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const [maxRent, setMaxRent] = useState('')
  const [minBeds, setMinBeds] = useState('')
  const [dps, setDps] = useState(false)
  useEffect(() => { setDraft(q) }, [q])

  const search = useQuery({
    queryKey: ['search', q, maxRent, minBeds, dps],
    queryFn: () => api.search({ q, k: 30, maxRent: maxRent || undefined, minBeds: minBeds || undefined, inDps: dps || undefined }),
    placeholderData: keepPreviousData,
  })
  const r = search.data

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Search listings</h1>
      <p className="mb-5 text-stone-500">Describe what you want. Price, bedrooms and “inside DPS” are applied as hard filters, then results are ranked by meaning <i>and</i> exact words.</p>

      <form onSubmit={(e) => { e.preventDefault(); setParams(draft ? { q: draft } : {}) }} className="flex gap-2">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. furnished room with private bathroom under $1,200"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-cardinal focus:ring-2 focus:ring-cardinal/20" />
        <button className="rounded-xl bg-cardinal px-6 font-semibold text-white hover:bg-cardinal-dark">Search</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {EXAMPLES.map((e) => (
          <button key={e} onClick={() => setParams({ q: e })} className="rounded-full bg-white px-3 py-1 text-xs ring-1 ring-stone-200 hover:ring-cardinal">{e}</button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <select value={maxRent} onChange={(e) => setMaxRent(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5">
          <option value="">Any price</option>{[900, 1200, 1500, 2000, 3000].map((v) => <option key={v} value={v}>Under ${v.toLocaleString()}</option>)}
        </select>
        <select value={minBeds} onChange={(e) => setMinBeds(e.target.value)} className="rounded-lg border border-stone-300 bg-white px-2 py-1.5">
          <option value="">Any beds</option>{[1, 2, 3, 4].map((v) => <option key={v} value={v}>{v}+ beds</option>)}
        </select>
        <label className="flex items-center gap-2"><input type="checkbox" checked={dps} onChange={(e) => setDps(e.target.checked)} className="accent-cardinal" />Inside DPS only</label>
        {r && (
          <span className="ml-auto text-xs text-stone-500">
            {r.count} results in {r.tookMs} ms
            {Object.keys(r.filters).length > 0 && <> · filters: {Object.entries(r.filters).map(([k, v]) => `${k}=${v}`).join(', ')}</>}
          </span>
        )}
      </div>

      {search.isError && <p className="mt-8 rounded-xl bg-red-50 p-4 text-sm text-red-700">{(search.error as Error).message}</p>}
      {r?.count === 0 && <p className="mt-8 text-center text-stone-500">No listings match. Try loosening the filters.</p>}
      <div className={`mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${search.isFetching ? 'opacity-60' : ''}`}>
        {r?.results.map((h) => <ListingCard key={h.id} listing={h} showRanks={!!q} />)}
      </div>

      <details className="mt-10 rounded-2xl bg-white p-5 text-sm text-stone-600 ring-1 ring-stone-200">
        <summary className="cursor-pointer font-semibold text-ink">How search works</summary>
        <ol className="mt-3 list-decimal space-y-1 pl-5">
          <li><b>Filters first</b>: price, beds and zones parsed from your words become hard constraints.</li>
          <li><b>Semantic</b>: bge-small embeddings in a FAISS index find listings that mean the same thing.</li>
          <li><b>Keyword</b>: BM25 catches exact terms like street names and amenities.</li>
          <li><b>Fusion + rerank</b>: Reciprocal Rank Fusion merges both lists, then a cross-encoder reorders the top 20.</li>
        </ol>
      </details>
    </div>
  )
}
