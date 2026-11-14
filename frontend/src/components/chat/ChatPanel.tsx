import { useState } from 'react'
import { streamChat } from '../../api/client'
import { useAppStore } from '../../store/useAppStore'
import AgentSteps, { type Step } from './AgentSteps'
import MessageBubble from './MessageBubble'

type Msg = { role: 'user' | 'assistant'; content: string }

export default function ChatPanel() {
  const { profile, highlight } = useAppStore()
  const [messages, setMessages] = useState<Msg[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)

  async function send() {
    const message = input.trim()
    if (!message || busy) return
    const history = messages
    setMessages([...history, { role: 'user', content: message }, { role: 'assistant', content: '' }])
    setInput(''); setSteps([]); setBusy(true)
    const appendToken = (t: string) =>
      setMessages((m) => [...m.slice(0, -1), { role: 'assistant', content: m[m.length - 1].content + t }])
    try {
      await streamChat({ message, profile, history }, (e) => {
        if (e.event === 'step')
          setSteps((s) => { const i = s.findIndex((x) => x.label === e.data.label); return i < 0 ? [...s, e.data] : s.map((x, j) => (j === i ? e.data : x)) })
        else if (e.event === 'listings') highlight(e.data.ids)
        else if (e.event === 'token') appendToken(e.data.text)
        else if (e.event === 'error') appendToken(`\n⚠️ ${e.data.message}`)
      })
    } catch { appendToken('\n⚠️ Connection lost. Try again.') }
    finally { setBusy(false) }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.map((m, i) => <MessageBubble key={i} role={m.role} text={m.content} />)}
        {steps.length > 0 && <AgentSteps steps={steps} />}
      </div>
      <form className="flex gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Under $1,400, inside Fryft, 15 min to Viterbi"
          className="flex-1 rounded border px-2 py-1 text-sm" />
        <button disabled={busy} className="rounded bg-[#990000] px-3 text-sm text-white disabled:opacity-50">Ask</button>
      </form>
    </div>
  )
}
