// Copied from /contracts (section 7.8). Keep in sync with node-api + ai-service schemas.
export interface Listing {
  id: number; address: string; rent: number; beds: number
  lat: number; lng: number; url: string
  inDps?: boolean; inFryft?: boolean; fitScore?: number
}
export interface Building { id: number; name: string; code: string; lat: number; lng: number }
export interface Zones { inDps: boolean; inFryft: boolean; metersToFryftEdge: number }
export interface Commute { building: string; walk: number; bike: number; tram: number | null }
export interface Citation { n: number; source: string; date: string; url: string }
export interface Block { summary: string; incidents6mo: Record<string, number>; citations: Citation[] }
export interface Cost {
  rent: number; utilities: number; transit: number; rideshare: number; total: number; assumptions: string[]
}
export interface Report {
  listing: Listing; zones: Zones; commute: Commute[]; block: Block; cost: Cost; fitScore: number
}
export interface Priorities { cost: number; commute: number; zone: number; incidents: number }
export interface Profile { budget: number; buildingIds: number[]; lateNights: number; priorities: Priorities }

// SSE events from POST /api/chat
export type ChatEvent =
  | { event: 'step'; data: { label: string; status: 'running' | 'done' } }
  | { event: 'listings'; data: { ids: number[] } }
  | { event: 'token'; data: { text: string } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: Record<string, never> }
