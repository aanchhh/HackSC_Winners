import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { Building, ChatEvent, Cost, Listing, Meta, Profile, Report, SearchResponse, Zones } from './types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'
type Params = Record<string, string | number | boolean | undefined | null>

async function get<T>(path: string, params?: Params): Promise<T> {
  const url = new URL(path, API_URL)
  Object.entries(params ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && url.searchParams.set(k, String(v)))
  const res = await fetch(url)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(new URL(path, API_URL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  meta: () => get<Meta>('/api/meta'),
  zones: () => get<GeoJSON.FeatureCollection>('/api/zones'),
  buildings: () => get<Building[]>('/api/buildings'),
  zoneCheck: (lat: number, lng: number) => get<Zones>('/api/zone-check', { lat, lng }),
  listings: (p: Params = {}) => get<Listing[]>('/api/listings', p),
  search: (p: Params) => get<SearchResponse>('/api/search', p),
  report: (id: string, p: Profile) =>
    get<Report>(`/api/listings/${encodeURIComponent(id)}/report`, { buildings: p.buildingIds.join(','), lateNights: p.lateNights, budget: p.budget }),
  trueCost: (b: { listingId?: string; rent?: number; utilities?: number; inFryft?: boolean; lateNights: number; needsMetro: boolean }) =>
    post<Cost & { listing: Listing | null }>('/api/true-cost', b),
}

// EventSource only supports GET, so POST via fetch-event-source.
export function streamChat(
  body: { message: string; profile: Profile; history: { role: string; content: string }[] },
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
) {
  return fetchEventSource(`${API_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, openWhenHidden: true,
    onmessage(msg) {
      if (!msg.event) return
      onEvent({ event: msg.event, data: msg.data ? JSON.parse(msg.data) : {} } as ChatEvent)
    },
    onerror(err) { throw err },
  })
}
