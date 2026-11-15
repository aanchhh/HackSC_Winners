import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { meApi, signIn, signOut, token, useMe, useSetMe, type Me } from '../lib/auth'
import PlaceInput from '../components/rides/PlaceInput'
import { QUICK_PICKUPS } from '../lib/rides'

const card = 'rounded-2xl bg-white p-5 ring-1 ring-stone-200'
const input = 'w-full rounded-lg border border-stone-300 px-3 py-2 text-sm'

function Step({ n, title, done, children, hint }: { n: number; title: string; done: boolean; hint: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <div className="mb-3 flex items-start gap-3">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${done ? 'bg-emerald-600 text-white' : 'bg-cardinal/10 text-cardinal'}`}>{done ? '✓' : n}</span>
        <div><h2 className="font-bold leading-tight">{title}</h2><p className="text-xs text-stone-500">{hint}</p></div>
      </div>
      {children}
    </section>
  )
}

function Avatar({ name, demo }: { name: string; demo?: boolean }) {
  return <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold ${demo ? 'bg-violet-100 text-violet-700' : 'bg-cardinal text-gold'}`}>{name[0]?.toUpperCase()}</span>
}

export default function ProfilePage() {
  const [params] = useSearchParams()
  const q = useMe()
  const setMe = useSetMe()
  const [msg, setMsg] = useState('')
  const [contact, setContact] = useState({ name: '', phone: '', email: '', relation: 'Roommate' })
  const [friendEmail, setFriendEmail] = useState('')

  if (!token()) return (
    <div className="mx-auto max-w-md p-8 text-center">
      <h1 className="text-2xl font-extrabold">Your safety profile</h1>
      <p className="mt-2 text-sm text-stone-500">Sign in with single sign-on to save your home, add emergency contacts and ride with friends.</p>
      <button onClick={() => signIn('/profile')} className="mt-5 rounded-xl bg-cardinal px-5 py-2.5 font-semibold text-white">Sign in with SSO</button>
    </div>
  )
  const me = q.data
  if (!me) return <div className="p-8 text-stone-500">{q.isError ? <>Session expired. <button onClick={() => signIn('/profile')} className="font-semibold text-cardinal">Sign in again</button></> : 'Loading…'}</div>

  const run = async (p: Promise<Me | { profile: Me; status: string }>) => {
    setMsg('')
    try {
      const r = await p
      if ('profile' in r) {
        setMe(r.profile)
        if (r.status === 'sent') setTimeout(() => q.refetch(), 3200)  // demo students accept after a moment
        setMsg({ sent: 'Friend request sent.', friends: 'You’re now friends.', 'not-found': 'No TrojanScout account with that email yet.', self: 'That’s you!' }[r.status] ?? '')
      } else setMe(r)
    } catch (e) { setMsg((e as Error).message) }
  }
  const welcome = params.get('welcome') === '1' && !me.onboarded
  const host = (() => { try { return new URL(me.issuer).host + new URL(me.issuer).pathname } catch { return me.issuer } })()

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <div className={`${card} flex flex-wrap items-center gap-4`}>
        <span className="grid h-14 w-14 place-items-center rounded-full bg-cardinal text-2xl font-extrabold text-gold">{me.name[0]?.toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <input defaultValue={me.name} onBlur={(e) => e.target.value.trim() && e.target.value !== me.name && run(meApi.patch({ name: e.target.value.trim() }))}
            className="w-full rounded-lg px-1 text-xl font-extrabold hover:bg-stone-50 focus:bg-stone-50 focus:outline-none" aria-label="Your name" />
          <div className="px-1 text-sm text-stone-500">{me.email}</div>
          <div className="px-1 text-[11px] text-stone-400">Signed in with OpenID Connect via {host}{/demo-idp/.test(me.issuer) ? ' (demo identity provider)' : ''}</div>
        </div>
        <button onClick={signOut} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-stone-600 ring-1 ring-stone-300 hover:text-cardinal">Sign out</button>
      </div>

      {welcome && <p className="rounded-xl bg-gold-50 p-3 text-sm ring-1 ring-gold">Welcome! Three quick steps make the alerts and rides personal. You can skip any of them.</p>}
      {msg && <p className="rounded-lg bg-stone-100 px-3 py-2 text-sm">{msg}</p>}

      <Step n={1} title="Where do you live?" done={!!me.home} hint="You’ll get an alert when USC DPS reports an incident within 600 m of home, and it’s the default start for safe routes and rides.">
        {me.home ? (
          <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm"><span>🏠 {me.home.label}</span><button onClick={() => run(meApi.patch({ home: null }))} className="text-xs text-stone-500 hover:text-cardinal">change</button></div>
        ) : <PlaceInput label="Home" value={null} onChange={(p) => p && run(meApi.patch({ home: p }))} quick={QUICK_PICKUPS} picking={false} onPickMap={() => {}} onPreview={() => {}} />}
      </Step>

      <Step n={2} title="Emergency contacts" done={me.contacts.length > 0} hint="One tap from a safe route sends them your route and ETA by text. TrojanScout never messages anyone without you pressing send.">
        <ul className="mb-3 space-y-2">
          {me.contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-sm">
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1"><b>{c.name}</b> <span className="text-xs text-stone-500">· {c.relation}</span><div className="text-xs text-stone-500">{c.phone}{c.email ? ` · ${c.email}` : ''}</div></div>
              <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="text-xs font-semibold text-cardinal">Call</a>
              <button onClick={() => run(meApi.removeContact(c.id))} className="text-xs text-stone-400 hover:text-cardinal">Remove</button>
            </li>
          ))}
        </ul>
        <form onSubmit={(e) => { e.preventDefault(); run(meApi.addContact({ ...contact, emergency: true })).then(() => setContact({ name: '', phone: '', email: '', relation: 'Roommate' })) }} className="grid gap-2 sm:grid-cols-2">
          <input required placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} className={input} />
          <input required placeholder="Phone" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} className={input} />
          <input type="email" placeholder="Email (finds them on TrojanScout)" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} className={input} />
          <select value={contact.relation} onChange={(e) => setContact({ ...contact, relation: e.target.value })} className={input}>
            {['Roommate', 'Friend', 'Parent', 'Partner', 'RA', 'Other'].map((r) => <option key={r}>{r}</option>)}
          </select>
          <button className="rounded-lg bg-ink py-2 text-sm font-semibold text-white sm:col-span-2">Add contact</button>
        </form>
      </Step>

      <Step n={3} title="Friends" done={me.friends.length > 0} hint="Friends’ rides show first in Book Ride, so you can split fares with people you know. You’ll get an alert when a friend books a ride.">
        {me.incoming.length > 0 && (
          <div className="mb-3 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wide text-amber-700">Friend requests</div>
            {me.incoming.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-lg bg-gold-50 px-3 py-2 text-sm ring-1 ring-gold">
                <Avatar name={u.name} demo={u.demo} /><div className="flex-1"><b>{u.name}</b><div className="text-xs text-stone-500">{u.email}</div></div>
                <button onClick={() => run(meApi.respond(u.id, true))} className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">Accept</button>
                <button onClick={() => run(meApi.respond(u.id, false))} className="text-xs text-stone-500">Ignore</button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={(e) => { e.preventDefault(); if (friendEmail.trim()) run(meApi.addFriend(friendEmail.trim())).then(() => setFriendEmail('')) }} className="mb-3 flex gap-2">
          <input type="email" placeholder="Friend’s email" value={friendEmail} onChange={(e) => setFriendEmail(e.target.value)} className={input} />
          <button className="shrink-0 rounded-lg bg-cardinal px-4 text-sm font-semibold text-white">Add</button>
        </form>
        <ul className="space-y-2">
          {me.friends.map((u) => (
            <li key={u.id} className="flex items-center gap-3 rounded-lg bg-stone-50 px-3 py-2 text-sm">
              <Avatar name={u.name} demo={u.demo} />
              <div className="min-w-0 flex-1"><b>{u.name}</b>{u.demo && <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700">demo</span>}<div className="text-xs text-stone-500">{u.home ? `Lives near ${u.home.label}` : u.email}</div></div>
              <button onClick={() => run(meApi.removeFriend(u.id))} className="text-xs text-stone-400 hover:text-cardinal">Remove</button>
            </li>
          ))}
          {me.outgoing.map((u) => <li key={u.id} className="flex items-center gap-3 px-3 py-1 text-sm text-stone-500"><Avatar name={u.name} demo={u.demo} />{u.name} · request sent</li>)}
        </ul>
        {me.suggestions.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-stone-500">People you may know</div>
            <div className="flex flex-wrap gap-2">
              {me.suggestions.filter((s) => !me.outgoing.some((o) => o.id === s.id)).map((s) => (
                <button key={s.id} onClick={() => run(meApi.addFriend(s.email))} className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-3 text-sm ring-1 ring-stone-200 hover:ring-cardinal">
                  <Avatar name={s.name} demo={s.demo} /><span>{s.name}<span className="block text-[10px] text-stone-400">{s.viaContacts ? 'in your contacts' : s.demo ? 'demo student' : ''}</span></span><span className="font-bold text-cardinal">+</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Step>

      <div className="flex justify-end gap-2">
        {!me.onboarded && <button onClick={() => run(meApi.patch({ onboarded: true }))} className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 ring-1 ring-stone-300">Skip for now</button>}
        <Link to="/rides" onClick={() => !me.onboarded && meApi.patch({ onboarded: true })} className="rounded-xl bg-cardinal px-4 py-2 text-sm font-semibold !text-white">Book a ride with friends →</Link>
      </div>
    </div>
  )
}
