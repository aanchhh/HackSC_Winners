// Sign-in with OpenID Connect (authorization code + PKCE).
//  - Production: set OIDC_ISSUER / OIDC_CLIENT_ID / OIDC_CLIENT_SECRET to the university's IdP (Okta / Azure AD / Shibboleth-OIDC).
//  - Demo (default): a built-in identity provider at /demo-idp. It is clearly labelled as a demo, is NOT USC,
//    and never asks for a password: you pick a demo student or type a name + email.
// The client half below is the real thing either way: discovery, state + nonce, PKCE, code exchange, id_token verified against JWKS.
import { Router, urlencoded } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import axios from 'axios'
import { createRemoteJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT, type JWK } from 'jose'
import { config } from '../config.js'
import { PERSONAS, signSession, upsertFromIdToken } from '../services/users.js'

const API = process.env.PUBLIC_API_URL ?? `http://localhost:${config.port}`
const FRONT = config.corsOrigin[0]
const DEMO_ISSUER = `${API}/demo-idp`
const OIDC = {
  issuer: process.env.OIDC_ISSUER ?? DEMO_ISSUER,
  clientId: process.env.OIDC_CLIENT_ID ?? 'trojanscout-web',
  clientSecret: process.env.OIDC_CLIENT_SECRET ?? 'demo-secret',
  redirectUri: `${API}/auth/callback`,
}
const isDemo = OIDC.issuer === DEMO_ISSUER

const b64url = (b: Buffer) => b.toString('base64url')
const rand = () => b64url(randomBytes(24))
const s256 = (v: string) => b64url(createHash('sha256').update(v).digest())
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export const authRouter = Router()
authRouter.use(urlencoded({ extended: false }))

// ---------------- client (TrojanScout ↔ any OIDC provider) ----------------
interface Discovery { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string }
let discovery: Discovery | null = null
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
async function discover() {
  if (!discovery) {
    discovery = (await axios.get(`${OIDC.issuer}/.well-known/openid-configuration`, { timeout: 8000 })).data as Discovery
    jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  }
  return discovery
}
const pending = new Map<string, { nonce: string; verifier: string; ret: string; exp: number }>()
const safeReturn = (r: unknown) => (typeof r === 'string' && /^\/[\w\-/?=&%.]*$/.test(r) ? r : '/profile')

authRouter.get('/config', (_req, res) => res.json({ issuer: OIDC.issuer, demo: isDemo }))

authRouter.get('/login', async (req, res, next) => {
  try {
    const d = await discover()
    const state = rand(), nonce = rand(), verifier = rand() + rand()
    for (const [k, v] of pending) if (v.exp < Date.now()) pending.delete(k)
    pending.set(state, { nonce, verifier, ret: safeReturn(req.query.return), exp: Date.now() + 10 * 60e3 })
    const u = new URL(d.authorization_endpoint)
    Object.entries({ response_type: 'code', client_id: OIDC.clientId, redirect_uri: OIDC.redirectUri, scope: 'openid email profile', state, nonce, code_challenge: s256(verifier), code_challenge_method: 'S256' })
      .forEach(([k, v]) => u.searchParams.set(k, v))
    res.redirect(u.toString())
  } catch (e) { next(e) }
})

authRouter.get('/callback', async (req, res) => {
  const fail = (msg: string) => res.redirect(`${FRONT}/auth/done#error=${encodeURIComponent(msg)}`)
  const st = pending.get(String(req.query.state ?? ''))
  if (req.query.error) return fail(String(req.query.error))
  if (!st || st.exp < Date.now()) return fail('Sign-in expired, please try again')
  pending.delete(String(req.query.state))
  try {
    const d = await discover()
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: String(req.query.code ?? ''), redirect_uri: OIDC.redirectUri, client_id: OIDC.clientId, client_secret: OIDC.clientSecret, code_verifier: st.verifier })
    const tok = (await axios.post(d.token_endpoint, body.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 })).data
    const { payload } = await jwtVerify(tok.id_token, jwks!, { issuer: d.issuer, audience: OIDC.clientId })
    if (payload.nonce !== st.nonce) return fail('Sign-in check failed (nonce)')
    const user = upsertFromIdToken(d.issuer, String(payload.sub), String(payload.email ?? ''), String(payload.name ?? ''))
    const session = await signSession(user)
    res.redirect(`${FRONT}/auth/done#token=${session}&return=${encodeURIComponent(user.onboarded ? st.ret : '/profile?welcome=1')}`)
  } catch (e) { console.error('oidc callback', (e as Error).message); fail('Could not complete sign-in') }
})

// ---------------- demo identity provider (only when no real OIDC_ISSUER is set) ----------------
export const demoIdpRouter = Router()
demoIdpRouter.use(urlencoded({ extended: false }))
const keys = generateKeyPair('RS256').then(async (k) => ({ ...k, jwk: { ...(await exportJWK(k.publicKey)), kid: 'demo-1', alg: 'RS256', use: 'sig' } as JWK }))
const codes = new Map<string, { sub: string; email: string; name: string; nonce: string; clientId: string; redirectUri: string; challenge: string; exp: number }>()

demoIdpRouter.get('/.well-known/openid-configuration', (_req, res) => res.json({
  issuer: DEMO_ISSUER, authorization_endpoint: `${DEMO_ISSUER}/authorize`, token_endpoint: `${DEMO_ISSUER}/token`, jwks_uri: `${DEMO_ISSUER}/jwks`,
  response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
  scopes_supported: ['openid', 'email', 'profile'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_post'],
}))
demoIdpRouter.get('/jwks', async (_req, res) => res.json({ keys: [(await keys).jwk] }))

const PARAMS = ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'scope'] as const
demoIdpRouter.get('/authorize', (req, res) => {
  const q = Object.fromEntries(PARAMS.map((k) => [k, String(req.query[k] ?? '')]))
  if (q.client_id !== OIDC.clientId || q.redirect_uri !== OIDC.redirectUri) return res.status(400).send('Unknown client or redirect_uri')
  const hidden = PARAMS.map((k) => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join('')
  const accounts = PERSONAS.slice(0, 3).map((p) => `<form method="post"><input type="hidden" name="account" value="${p.id}">${hidden}<button class="acct"><span class="av">${esc(p.name[0])}</span><span><b>${esc(p.name)}</b><br><small>${esc(p.email)}</small></span></button></form>`).join('')
  res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Demo SSO (not USC)</title>
<style>body{font-family:system-ui,sans-serif;background:#eef0f4;margin:0;display:grid;place-items:center;min-height:100vh;color:#1f2937}
.card{background:#fff;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);padding:28px;width:min(420px,calc(100vw - 32px))}
.tag{display:inline-block;background:#fef3c7;color:#92400e;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700}
h1{font-size:20px;margin:12px 0 4px}p{font-size:13px;color:#6b7280;margin:0 0 16px}
.acct{display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer;font:inherit}
.acct:hover{border-color:#4f46e5}.av{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#4f46e5;color:#fff;font-weight:700}
small{color:#6b7280}input[type=text],input[type=email]{width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:10px;padding:9px 11px;font:inherit;margin-bottom:8px}
.go{width:100%;background:#4f46e5;color:#fff;border:0;border-radius:10px;padding:10px;font-weight:700;cursor:pointer;font:inherit}
.foot{font-size:11px;color:#9ca3af;margin-top:16px;line-height:1.5}hr{border:0;border-top:1px solid #e5e7eb;margin:16px 0}</style></head>
<body><div class="card"><span class="tag">DEMO IDENTITY PROVIDER · NOT USC</span>
<h1>Sign in to TrojanScout</h1><p>This stands in for your university's single sign-on during the demo. It never asks for a password.</p>
${accounts}<hr><form method="post">${hidden}<input type="hidden" name="account" value="new">
<input type="text" name="name" placeholder="Your name" required maxlength="40"><input type="email" name="email" placeholder="Email (any, it's a demo)" required maxlength="80">
<button class="go">Continue as a new demo student</button></form>
<div class="foot">OpenID Connect · issuer ${esc(DEMO_ISSUER)}<br>In production TrojanScout redirects here to the university's real SSO instead (set OIDC_ISSUER).</div></div></body></html>`)
})

demoIdpRouter.post('/authorize', (req, res) => {
  const b = req.body as Record<string, string>
  if (b.client_id !== OIDC.clientId || b.redirect_uri !== OIDC.redirectUri) return res.status(400).send('Unknown client')
  const persona = PERSONAS.find((p) => p.id === b.account)
  const email = (persona?.email ?? String(b.email ?? '')).trim().slice(0, 80)
  const name = (persona?.name ?? String(b.name ?? '')).trim().slice(0, 40)
  if (!email || !name) return res.status(400).send('Name and email required')
  const code = rand()
  codes.set(code, { sub: persona ? persona.id : `demo-${s256(email.toLowerCase()).slice(0, 16)}`, email, name, nonce: b.nonce, clientId: b.client_id, redirectUri: b.redirect_uri, challenge: b.code_challenge, exp: Date.now() + 60e3 })
  const u = new URL(b.redirect_uri); u.searchParams.set('code', code); u.searchParams.set('state', b.state)
  res.redirect(u.toString())
})

demoIdpRouter.post('/token', async (req, res) => {
  const b = req.body as Record<string, string>
  const c = codes.get(b.code); codes.delete(b.code)
  if (!c || c.exp < Date.now() || b.client_id !== c.clientId || b.client_secret !== OIDC.clientSecret || b.redirect_uri !== c.redirectUri || s256(b.code_verifier ?? '') !== c.challenge)
    return res.status(400).json({ error: 'invalid_grant' })
  const k = await keys
  const id_token = await new SignJWT({ email: c.email, name: c.name, nonce: c.nonce, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid: 'demo-1' }).setIssuer(DEMO_ISSUER).setAudience(c.clientId).setSubject(c.sub).setIssuedAt().setExpirationTime('5m').sign(k.privateKey)
  res.json({ token_type: 'Bearer', id_token, access_token: rand(), expires_in: 300 })
})
