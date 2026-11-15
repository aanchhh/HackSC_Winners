// Keep in sync with /contracts, node-api and ai-service (app/listings/models.py).
export interface Listing {
  id: string; source: string; url: string; name: string; address: string; lat: number; lng: number
  rent: number | null; rentMax?: number | null; priceUnit: string; callForPricing?: boolean
  beds: number | null; bedsMax?: number | null; baths?: number | null; availability?: string | null
  propertyTypes?: string[]; amenities?: string[]; photos?: string[]; description?: string
  utilitiesEst: number; distanceToCampusMi?: number | null; scrapedAt?: string
  inDps?: boolean; inFryft?: boolean; metersToFryftEdge?: number
}
export interface SearchHit extends Listing { score: number | null; denseRank: number | null; bm25Rank: number | null }
export interface SearchResponse { query: string; filters: Record<string, unknown>; count: number; tookMs: number; results: SearchHit[] }
export interface Meta { count: number; scrapedAt: string | null; sources: Record<string, unknown>; inDps: number; inFryft: number; medianRent: number | null }

export interface Building { id: number; name: string; code: string; lat: number; lng: number }
export interface Zones { inDps: boolean; inFryft: boolean; metersToFryftEdge: number }
export interface Commute { building: string; walk: number; bike: number; tram: number | null }
export interface Citation { n: number; source: string; date: string; url: string }
export interface Block { summary: string; incidents6mo: Record<string, number>; citations: Citation[] }
export interface Cost { rent: number; utilities: number; transit: number; rideshare: number; total: number; assumptions: string[] }
export interface Report { listing: Listing; zones: Zones; commute: Commute[]; block: Block; cost: Cost; fitScore: number }

export interface Priorities { cost: number; commute: number; zone: number; incidents: number }
export interface Profile { budget: number; buildingIds: number[]; lateNights: number; priorities: Priorities }

export type ChatEvent =
  | { event: 'step'; data: { label: string; status: 'running' | 'done' } }
  | { event: 'listings'; data: { ids: string[] } }
  | { event: 'token'; data: { text: string } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: Record<string, never> }
