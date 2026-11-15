import { API_URL } from '../api/client'

export interface RecentItem { source: string; verified: boolean; title: string; when: string; at: string; where: string; precision: string; distanceM: number; url: string | null; lat: number; lng: number }
export interface RecentResult { hours: number; radiusM: number; count: number; items: RecentItem[]; lapd: { lastTwoWeeks: number; severe: number; dataThrough: string | null; note: string }; dpsFetchedAt: string | null }
export interface DpsAlert { id: string; title: string; url: string; postedAt: string; occurredAt: string | null; location: string; lat: number; lng: number; precision: 'exact' | 'street' | 'campus'; summary: string }

export async function recentNear(lat: number, lng: number, hours = 24, radius = 500): Promise<RecentResult> {
  return (await fetch(`${API_URL}/api/recent?lat=${lat}&lng=${lng}&hours=${hours}&radius=${radius}`)).json()
}
export const dpsAlerts = async (): Promise<{ fetchedAt: string | null; alerts: DpsAlert[] }> => (await fetch(`${API_URL}/api/dps-alerts`)).json()
export async function report(b: { lat: number; lng: number; category: string; description: string; userId?: string }) {
  const r = await fetch(`${API_URL}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })
  if (!r.ok) throw new Error('Could not save report')
  return r.json()
}
export const REPORT_CATEGORIES = ['Suspicious person', 'Harassment', 'Theft / break-in', 'Assault', 'Broken streetlight', 'Road / sidewalk hazard', 'Other']
