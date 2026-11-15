import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { api, streamChat } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import ListingCard from '../components/listing/ListingCard'

type Step = { label: string; status: 'running' | 'done' }
type Msg = { role: 'user' | 'assistant'; content: string; steps?: Step[]; ids?: string[] }
const SUGGESTIONS = ['Under $1,400, inside DPS, close to Viterbi', 'Furnished room with a private bathroom', 'Cheapest 2 bedroom near campus']

export default function ChatPage() {
  const { profile, highlight } = useAppStore()
  const listings = useQuery({ queryKey: ['listings'], queryFn: () => api.listings() })
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const patchLast = (fn: (m: Msg) => Msg) => setMessages((ms) => [...ms.slice(0, -1), fn(ms[ms.length - 1])])

  async function send(text = input) {
    const message = text.trim()
    if (!message || busy) return
    const history = messages.map(({ role, content }) => ({ role, content }))
    setMessages((m) => [...m, { role: 'user', content: message }, { role: 'assistant', content: '', steps: [] }])
    setInput(''); setBusy(true)
    try {
      await streamChat({ message, profile, history }, (e) => {
        if (e.event === 'step') patchLast((m) => {
          const steps = m.steps ?? []
          const i = steps.findIndex((s) => s.label === e.data.label)
          return { ...m, steps: i < 0 ? [...steps, e.data] : steps.map((s, j) => (j === i ? e.data : s)) }
        })
        else if (e.event === 'listings') { highlight(e.data.ids); patchLast((m) => ({ ...m, ids: e.data.ids })) }
        else if (e.event === 'token') patchLast((m) => ({ ...m, content: m.content + e.data.text }))
        else if (e.event === 'error') patchLast((m) => ({ ...m, content: m.content + `\n⚠️ ${e.data.message}` }))
      })
    } catch { patchLast((m) => ({ ...m, content: m.content + '\n⚠️ Connection lost. Try again.' })) }
    finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col px-4">
      <div className="flex-1 space-y-6 overflow-y-auto py-8">
        {!messages.length && (
          <div className="pt-10 text-center">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-cardinal text-3xl">🐴</div>
            <h1 className="text-3xl font-extrabold tracking-tight">Ask Scout</h1>
            <p className="mx-auto mt-2 max-w-md text-stone-500">Ask with several constraints at once. Scout checks zones, commute and cost for each listing and shows each step.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full bg-white px-4 py-2 text-sm ring-1 ring-stone-200 hover:ring-cardinal">{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m, i) => m.role === 'user' ? (
          <div key={i} className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-md bg-cardinal px-4 py-2.5 text-white">{m.content}</div>
        ) : (
          <div key={i} className="space-y-3">
            {!!m.steps?.length && (
              <ul className="w-fit space-y-1 rounded-xl bg-white p-3 text-xs text-stone-600 ring-1 ring-stone-200">
                {m.steps.map((s) => <li key={s.label}>{s.status === 'done' ? '✅' : <span className="inline-block animate-spin">⏳</span>} {s.label}</li>)}
              </ul>
            )}
            {m.content && <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm ring-1 ring-stone-200">{m.content}</div>}
            {!!m.ids?.length && (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {m.ids.slice(0, 3).map((id) => { const l = listings.data?.find((x) => x.id === id); return l ? <ListingCard key={id} listing={l} /> : null })}
                </div>
                <Link to={`/map?ids=${m.ids.join(',')}`} className="inline-block text-sm font-semibold text-cardinal">See all {m.ids.length} on the map →</Link>
              </>
            )}
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send() }} className="sticky bottom-0 flex gap-2 bg-stone-50 py-4">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Under $1,400, inside DPS, 15 minutes to Viterbi…"
          className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4 py-3 outline-none focus:border-cardinal focus:ring-2 focus:ring-cardinal/20" />
        <button disabled={busy} className="rounded-xl bg-cardinal px-6 font-semibold text-white disabled:opacity-50">{busy ? '…' : 'Ask'}</button>
      </form>
    </div>
  )
}
