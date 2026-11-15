// Accounts, emergency contacts and friends. Users are created on first SSO sign-in (keyed by issuer + subject).
// Stored in data/users.json for the demo; the same shape maps onto a Supabase `profiles` table.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { Request, Response, NextFunction } from 'express'
import { config } from '../config.js'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../data')
const FILE = path.join(DATA_DIR, 'users.json')

export interface Contact { id: string; name: string; phone: string; email?: string; relation: string; emergency: boolean }
export interface Place { lat: number; lng: number; label: string }
export interface User {
  id: string; iss: string; sub: string; email: string; name: string; createdAt: string; demoPersona?: boolean
  home: Place | null; places: Place[]; contacts: Contact[]; friends: string[]
  requests: { from: string; at: string }[]  // incoming friend requests
  onboarded: boolean
}

// Demo personas: other "students" you can befriend in the demo. They accept friend requests and book rides (labelled demo).
export const PERSONAS: { id: string; name: string; email: string; home: Place }[] = [
  { id: 'usr-priya', name: 'Priya S.', email: 'priya@demo.trojanscout.test', home: { lat: 34.0287, lng: -118.2726, label: 'The Lorenzo' } },
  { id: 'usr-marcus', name: 'Marcus L.', email: 'marcus@demo.trojanscout.test', home: { lat: 34.0307, lng: -118.2883, label: 'Ellendale Pl' } },
  { id: 'usr-jenna', name: 'Jenna K.', email: 'jenna@demo.trojanscout.test', home: { lat: 34.0256, lng: -118.2853, label: 'USC Village' } },
  { id: 'usr-diego', name: 'Diego R.', email: 'diego@demo.trojanscout.test', home: { lat: 34.0280, lng: -118.2930, label: '28th St & Menlo' } },
  { id: 'usr-aisha', name: 'Aisha M.', email: 'aisha@demo.trojanscout.test', home: { lat: 34.0225, lng: -118.2780, label: 'Jefferson & Figueroa' } },
]

let users: User[] = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : []
for (const p of PERSONAS) {
  if (!users.some((u) => u.id === p.id)) users.push({ id: p.id, iss: 'persona', sub: p.id, email: p.email, name: p.name, createdAt: new Date().toISOString(), demoPersona: true, home: p.home, places: [], contacts: [], friends: [], requests: [], onboarded: true })
}
// personas know each other, so "friends of friends" and friend rides look natural
for (const p of PERSONAS) { const u = users.find((x) => x.id === p.id)!; u.friends = [...new Set([...u.friends, ...PERSONAS.filter((q) => q.id !== p.id).map((q) => q.id)])] }
const save = () => writeFileSync(FILE, JSON.stringify(users, null, 1))
save()

export const getUser = (id: string) => users.find((u) => u.id === id)
export const byEmail = (email: string) => users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
export const friendIds = (id: string) => new Set(getUser(id)?.friends ?? [])
export const isPersona = (id: string) => PERSONAS.some((p) => p.id === id)

export function upsertFromIdToken(iss: string, sub: string, email: string, name: string) {
  let u = users.find((x) => x.iss === iss && x.sub === sub)
  if (!u && iss.endsWith('/demo-idp') && isPersona(sub)) u = getUser(sub)  // demo: signing in as a persona uses that persona
  if (!u) {
    u = { id: `usr-${randomUUID().slice(0, 10)}`, iss, sub, email, name: name || email.split('@')[0], createdAt: new Date().toISOString(), home: null, places: [], contacts: [], friends: [], requests: [], onboarded: false }
    users.push(u)
  } else { u.email = email || u.email; if (name && !u.onboarded) u.name = name }
  save()
  return u
}

export function updateUser(id: string, patch: Partial<Pick<User, 'name' | 'home' | 'places' | 'onboarded'>>) {
  const u = getUser(id); if (!u) return null
  Object.assign(u, patch); save(); return u
}
export function addContact(id: string, c: Omit<Contact, 'id'>) {
  const u = getUser(id)!; u.contacts.push({ ...c, id: randomUUID().slice(0, 8) }); save(); return u
}
export function removeContact(id: string, contactId: string) {
  const u = getUser(id)!; u.contacts = u.contacts.filter((c) => c.id !== contactId); save(); return u
}

function link(a: User, b: User) {
  a.friends = [...new Set([...a.friends, b.id])]; b.friends = [...new Set([...b.friends, a.id])]
  a.requests = a.requests.filter((r) => r.from !== b.id); b.requests = b.requests.filter((r) => r.from !== a.id)
}

/** Send a friend request by email (or accept theirs if they already asked). Personas accept after a moment. */
export function requestFriend(fromId: string, email: string): { status: 'sent' | 'friends' | 'not-found' | 'self' } {
  const me = getUser(fromId)!, them = byEmail(email)
  if (!them) return { status: 'not-found' }
  if (them.id === me.id) return { status: 'self' }
  if (me.friends.includes(them.id)) return { status: 'friends' }
  if (me.requests.some((r) => r.from === them.id)) { link(me, them); save(); return { status: 'friends' } }
  if (!them.requests.some((r) => r.from === me.id)) them.requests.push({ from: me.id, at: new Date().toISOString() })
  save()
  if (them.demoPersona) setTimeout(() => { if (them.requests.some((r) => r.from === me.id)) { link(them, me); save() } }, 2500)
  return { status: 'sent' }
}
export function respondFriend(id: string, fromId: string, accept: boolean) {
  const me = getUser(id)!, them = getUser(fromId)
  if (them && accept) link(me, them); else me.requests = me.requests.filter((r) => r.from !== fromId)
  save()
}
export function removeFriend(id: string, otherId: string) {
  const me = getUser(id)!, them = getUser(otherId)
  me.friends = me.friends.filter((f) => f !== otherId); if (them) them.friends = them.friends.filter((f) => f !== id)
  save()
}

const pub = (u: User) => ({ id: u.id, name: u.name, email: u.email, demo: !!u.demoPersona, home: u.home ? { label: u.home.label } : null })
export function profile(id: string) {
  const u = getUser(id); if (!u) return null
  const outgoing = users.filter((x) => x.requests.some((r) => r.from === id)).map(pub)
  // suggestions: contacts whose email has an account, then demo personas
  const contactUsers = u.contacts.map((c) => c.email && byEmail(c.email)).filter((x): x is User => !!x && x.id !== id && !u.friends.includes(x.id))
  const suggestions = [...new Map([...contactUsers, ...users.filter((x) => x.demoPersona)].filter((x) => !u.friends.includes(x.id) && x.id !== id).map((x) => [x.id, x])).values()].slice(0, 6)
  return {
    id: u.id, email: u.email, name: u.name, issuer: u.iss, home: u.home, places: u.places, contacts: u.contacts, onboarded: u.onboarded,
    friends: u.friends.map(getUser).filter((x): x is User => !!x).map(pub),
    incoming: u.requests.map((r) => getUser(r.from)).filter((x): x is User => !!x).map(pub),
    outgoing: outgoing.map((x) => x), suggestions: suggestions.map((x) => ({ ...pub(x), viaContacts: contactUsers.includes(x) })),
  }
}

// ---- session tokens (our own JWT, issued after the SSO id_token is verified) ----
const secret = new TextEncoder().encode(process.env.SESSION_SECRET ?? `${config.internalKey}-trojanscout-session`)
export const signSession = (u: User) => new SignJWT({ name: u.name, email: u.email }).setProtectedHeader({ alg: 'HS256' }).setSubject(u.id).setIssuedAt().setExpirationTime('7d').sign(secret)

export async function sessionUser(req: Request): Promise<User | null> {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return null
  try { const { payload } = await jwtVerify(h.slice(7), secret); return getUser(String(payload.sub)) ?? null } catch { return null }
}
export async function requireUser(req: Request, res: Response, next: NextFunction) {
  const u = await sessionUser(req)
  if (!u) return res.status(401).json({ error: 'sign in required' })
  res.locals.user = u; next()
}
