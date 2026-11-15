import { useEffect, useState } from 'react'
import { CircleMarker, Marker, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import { useQuery } from '@tanstack/react-query'
import { api, subscribeDpsUnits } from '../../api/client'
import type { DpsUnit, RouteResult } from '../../api/types'

export const COLORS = { inside: '#059669', outside: '#7c3aed', dps: '#dc2626', safest: '#059669', fastest: '#57534e', incident: '#f97316' }

// ---- LAPD incidents, aggregated to hundred-block points ----
export function IncidentLayer({ days }: { days: number }) {
  const q = useQuery({ queryKey: ['incidents', days], queryFn: () => api.incidents(days) })
  return (
    <>
      {q.data?.points.map((p) => (
        <CircleMarker key={`${p.lat},${p.lng}`} center={[p.lat, p.lng]} radius={Math.min(3 + Math.sqrt(p.count) * 1.6, 12)} interactive
          pathOptions={{ stroke: false, fillColor: p.severe ? '#dc2626' : COLORS.incident, fillOpacity: Math.min(0.15 + p.count * 0.04, 0.55) }}>
          <Tooltip>
            <b>{p.block || 'Block'}</b> · {p.count} reported ({p.severe} violent/weapon)<br />
            {Object.entries(p.byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${v} ${k}`).join(' · ')}<br />
            <span style={{ opacity: 0.7 }}>latest {p.latest} · LAPD</span>
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}

// ---- USC safety resources ----
const stationIcon = L.divIcon({ className: '', html: '<div style="background:#990000;color:#ffc72c;border:2px solid #ffc72c;border-radius:8px;width:26px;height:26px;display:grid;place-items:center;font-weight:800;font-size:11px;box-shadow:0 2px 6px rgba(0,0,0,.3)">DPS</div>', iconSize: [26, 26], iconAnchor: [13, 13] })
const phoneIcon = L.divIcon({ className: '', html: '<div style="background:#2563eb;border:2px solid #fff;border-radius:50%;width:14px;height:14px;box-shadow:0 0 0 3px rgba(37,99,235,.25)"></div>', iconSize: [14, 14], iconAnchor: [7, 7] })

export function SafetyLayer() {
  const q = useQuery({ queryKey: ['safety-resources'], queryFn: api.safetyResources, staleTime: Infinity })
  return (
    <>
      {q.data?.resources.filter((r) => r.type !== 'service').map((r) => (
        <Marker key={r.name} position={[r.lat, r.lng]} icon={r.type === 'dps_station' ? stationIcon : phoneIcon}>
          <Tooltip direction="top">{r.type === 'dps_station' ? `🚓 ${r.name} (${r.hours})` : `📞 ${r.name}${r.approximate ? ' — approx. location' : ''}`}</Tooltip>
        </Marker>
      ))}
    </>
  )
}

// ---- Live DPS units (simulated feed, server-sent events) ----
const carIcon = (heading: number) => L.divIcon({
  className: '',
  html: `<div style="transform:rotate(${heading}deg);width:22px;height:22px;display:grid;place-items:center"><svg width="16" height="22" viewBox="0 0 16 22"><rect x="1" y="1" width="14" height="20" rx="4" fill="#dc2626" stroke="#fff" stroke-width="1.5"/><rect x="3" y="4" width="10" height="4" rx="1" fill="#fecaca"/><rect x="4" y="11" width="3" height="2" fill="#2563eb"/><rect x="9" y="11" width="3" height="2" fill="#fff"/></svg></div>`,
  iconSize: [22, 22], iconAnchor: [11, 11],
})

export function DpsUnitsLayer() {
  const [units, setUnits] = useState<DpsUnit[]>([])
  useEffect(() => subscribeDpsUnits(setUnits), [])
  return (
    <>
      {units.map((u) => (
        <Marker key={u.id} position={[u.lat, u.lng]} icon={carIcon(-u.heading + 90)} zIndexOffset={1000}>
          <Tooltip direction="top">🚓 {u.callsign} · {u.status}<br /><span style={{ opacity: 0.7 }}>Simulated live position</span></Tooltip>
        </Marker>
      ))}
    </>
  )
}

// ---- Safest vs fastest route ----
export function RouteLayer({ result, start, end }: { result: RouteResult | undefined; start: [number, number] | null; end: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    if (!result) return
    const pts = [...result.safest.coords, ...result.fastest.coords]
    map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [310, 40], paddingBottomRight: [40, 40], maxZoom: 17 })
  }, [result, map])
  return (
    <>
      {result && !result.sameRoute && <Polyline positions={result.fastest.coords} pathOptions={{ color: COLORS.fastest, weight: 5, opacity: 0.7, dashArray: '8 8' }} />}
      {result && <Polyline positions={result.safest.coords} pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.9 }} />}
      {result && <Polyline positions={result.safest.coords} pathOptions={{ color: COLORS.safest, weight: 6, opacity: 1 }} />}
      {start && <CircleMarker center={start} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#111827', fillOpacity: 1 }}><Tooltip permanent direction="left">Start</Tooltip></CircleMarker>}
      {end && <CircleMarker center={end} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#990000', fillOpacity: 1 }}><Tooltip permanent direction="right">Class</Tooltip></CircleMarker>}
    </>
  )
}

export function ClickToPick({ active, onPick }: { active: boolean; onPick: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => { if (active) onPick([e.latlng.lat, e.latlng.lng]) } })
  return null
}
