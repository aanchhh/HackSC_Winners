import { fetchEventSource } from '@microsoft/fetch-event-source'
import type { Building, ChatEvent, Listing, Profile, Report } from './types'

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const url = new URL(path, API_URL)
  Object.entries(params ?? {}).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)))
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export const api = {
  zones: () => get<GeoJSON.FeatureCollection>('/api/zones'),
  buildings: () => get<Building[]>('/api/buildings'),
  listings: (p: { maxRent?: number; inFryft?: boolean; maxCommute?: number; buildings?: string }) =>
    get<Listing[]>('/api/listings', p),
  report: (id: number, p: { buildings?: string; lateNights?: number }) =>
    get<Report>(`/api/listings/${id}/report`, p),
}

// EventSource only supports GET, so POST via fetch-event-source.
export function streamChat(
  body: { message: string; profile: Profile; history: { role: string; content: string }[] },
  onEvent: (e: ChatEvent) => void,
  signal?: AbortSignal,
) {
  return fetchEventSource(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
    openWhenHidden: true,
    onmessage(msg) {
      if (!msg.event) return
      onEvent({ event: msg.event, data: msg.data ? JSON.parse(msg.data) : {} } as ChatEvent)
    },
    onerror(err) { throw err }, // don't auto-retry
  })
}
