import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { MapContainer } from 'react-leaflet'
import Basemap from '../components/map/Basemap'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ListingV2 } from '../api/types'
import { useAppStore } from '../store/useAppStore'
import ZoneLayer from '../components/map/ZoneLayer'
import ListingMarker from '../components/map/ListingMarker'
import BuildingMarker from '../components/map/BuildingMarker'
import CompareSidebar, { COMPARE_SIZES } from '../components/map/CompareSidebar'
import RoutePanel from '../components/map/RoutePanel'
import FlyTo from '../components/map/FitBounds'
import { ClickToPick, COLORS, DpsUnitsLayer, IncidentLayer, RecentAlertsLayer, RouteLayer, SafetyLayer } from '../components/map/layers'
import ReportForm from '../components/safety/ReportForm'
import InfoTip from '../components/ui/InfoTip'
import { EXPLAIN } from '../lib/explain'
import { money } from '../lib/format'

export const USC: [number, number] = [34.0224, -118.2851]

export default function MapPage() {
  const [params, setParams] = useSearchParams()
  const focusId = params.get('focus')
  const { compareIds, highlightedIds, profile, compareWidth, setCompareWidth } = useAppStore()
  const [tab, setTab] = useState<'layers' | 'route'>(params.get('mode') === 'route' ? 'route' : 'layers')
  const [layers, setLayers] = useState({ zone: true, incidents: false, police: true, phones: true, medical: true, recent: true, units: true })
  const [maxRent, setMaxRent] = useState(4000)
  const [insideOnly, setInsideOnly] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [panelOpen, setPanelOpen] = useState(true)
  const [reporting, setReporting] = useState<'off' | 'pick' | [number, number]>('off')

  // safe-route state
  const [start, setStart] = useState<{ p: [number, number]; label: string } | null>(null)
  const [destId, setDestId] = useState(profile.buildingIds[0] ?? 9)
  const [customDest, setCustomDest] = useState<{ lat: number; lng: number; label: string } | null>(null)
  const [night, setNight] = useState(true)
  const [picking, setPicking] = useState(params.get('mode') === 'route')

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones })
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.buildings })
  const listings = useQuery({ queryKey: ['listings'], queryFn: () => api.listings() })
  const building = buildings.data?.find((b) => b.id === destId)
  const dest = customDest ?? building
  const route = useQuery({
    queryKey: ['route', start?.p, dest?.lat, dest?.lng, night],
    queryFn: () => api.route(start!.p, [dest!.lat, dest!.lng], night),
    enabled: !!start && !!dest,
  })

  const shown = useMemo(() => (listings.data ?? []).filter((l) =>
    (maxRent >= 4000 || (l.rent != null && l.rent <= maxRent)) && (!insideOnly || l.inDps)), [listings.data, maxRent, insideOnly])
  const highlightSet = new Set([...(params.get('ids')?.split(',') ?? []), ...highlightedIds])
  const focused = listings.data?.find((l) => l.id === focusId)

  const safeRouteFrom = useCallback((l: ListingV2) => {
    setStart({ p: [l.lat, l.lng], label: l.name }); setTab('route'); setPanelOpen(true); setPicking(false)
  }, [])

  // drag the compare panel's left edge to resize
  const dragging = useRef(false)
  const [dragW, setDragW] = useState<number | null>(null)
  const onDrag = (e: React.PointerEvent) => {
    dragging.current = true
    const move = (ev: PointerEvent) => { if (dragging.current) setDragW(Math.min(760, Math.max(340, window.innerWidth - ev.clientX))) }
    const up = (ev: PointerEvent) => {
      dragging.current = false
      const w = window.innerWidth - ev.clientX  // snap to the nearest size so the table always lays out cleanly
      setCompareWidth(COMPARE_SIZES.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a)))
      setDragW(null)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    e.preventDefault()
  }

  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] })
  return (
    <div className="relative flex h-full">
      <div className={`relative min-w-0 flex-1 ${picking || reporting === 'pick' ? 'cursor-crosshair' : ''}`}>
        <MapContainer center={USC} zoom={15} className="h-full w-full" zoomControl={false}>
          <Basemap extraAttribution=" · incidents: LAPD" />
          {zones.data && layers.zone && <ZoneLayer data={zones.data} visible={{ DPS: true, Fryft: false }} />}
          {layers.incidents && <IncidentLayer days={180} />}
          <SafetyLayer show={{ police: layers.police, phones: layers.phones, medical: layers.medical }} />
          {layers.recent && <RecentAlertsLayer />}
          {buildings.data?.map((b) => <BuildingMarker key={b.id} building={b} chosen={profile.buildingIds.includes(b.id)} />)}
          {shown.map((l) => (
            <ListingMarker key={l.id} listing={l} focused={l.id === focusId} highlighted={highlightSet.has(l.id)} comparing={compareIds.includes(l.id)} onSafeRoute={safeRouteFrom} />
          ))}
          {tab === 'route' && <RouteLayer result={route.data} start={start?.p ?? null} end={dest && start ? [dest.lat, dest.lng] : null} />}
          {layers.units && <DpsUnitsLayer />}
          <ClickToPick active={tab === 'route' && picking} onPick={(p) => { setStart({ p, label: `Dropped pin (${p[0].toFixed(4)}, ${p[1].toFixed(4)})` }); setPicking(false) }} />
          <ClickToPick active={reporting === 'pick'} onPick={(p) => setReporting(p)} />
          <FlyTo target={focused ? [focused.lat, focused.lng] : null} />
        </MapContainer>

        {/* Floating control panel: Layers | Safe route */}
        <div className="absolute left-3 top-3 z-[500] w-72 rounded-2xl bg-white/95 shadow-lg ring-1 ring-stone-200 backdrop-blur">
          <div className="flex items-center border-b border-stone-200 p-1.5 text-sm font-semibold">
            {(['layers', 'route'] as const).map((t) => (
              <button key={t} onClick={() => { setTab(t); setPanelOpen(true) }} className={`flex-1 rounded-lg py-1.5 ${tab === t && panelOpen ? 'bg-cardinal text-white' : 'text-stone-600 hover:bg-stone-100'}`}>
                {t === 'layers' ? '🗂 Layers' : '🛡 Safe route'}
              </button>
            ))}
            <button onClick={() => setPanelOpen(!panelOpen)} className="px-2 text-stone-400" aria-label="Collapse">{panelOpen ? '▴' : '▾'}</button>
          </div>
          {panelOpen && (
            <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-4">
              {tab === 'layers' ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-baseline justify-between"><span className="text-xs text-stone-500">{shown.length} of {listings.data?.length ?? 0} listings</span></div>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.zone} onChange={() => toggle('zone')} className="accent-cardinal" />
                    <span className="inline-block h-3 w-5 rounded-sm border-2 border-cardinal" />DPS + Fryft zone <InfoTip>{EXPLAIN.dps} {EXPLAIN.fryft}</InfoTip></label>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.units} onChange={() => toggle('units')} className="accent-cardinal" />
                    <span className="inline-block h-3 w-3 rounded-sm" style={{ background: COLORS.dps }} />DPS units, live <span className="text-[10px] text-stone-400">(simulated)</span></label>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.incidents} onChange={() => toggle('incidents')} className="accent-cardinal" />
                    <span className="inline-block h-3 w-3 rounded-full bg-orange-500" />LAPD incidents (6 mo) <InfoTip>{EXPLAIN.incidents} Bigger, darker dots = more reports at that block; red = includes violent/weapon incidents.</InfoTip></label>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.recent} onChange={() => toggle('recent')} className="accent-cardinal" />
                    <span className="inline-block h-3 w-3 rounded-full bg-red-700 ring-2 ring-white" />DPS alerts (30 days) & student reports <InfoTip>Crime alerts USC DPS posted on dps.usc.edu, placed from the location in the alert (intersection, block or building). Dashed pink dots are unverified student reports from the last 72 hours.</InfoTip></label>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.police} onChange={() => toggle('police')} className="accent-cardinal" />
                    <span className="rounded bg-blue-900 px-1 text-[9px] font-bold text-white">LAPD</span>Police & DPS stations</label>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.phones} onChange={() => toggle('phones')} className="accent-cardinal" />
                    <span className="inline-block h-3 w-3 rounded-full bg-blue-600" />Blue-light emergency phones</label>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.medical} onChange={() => toggle('medical')} className="accent-cardinal" />
                    <span className="rounded bg-emerald-600 px-1 text-[9px] font-bold text-white">✚</span>Clinics & 💊 health vending</label>
                  {reporting === 'off' && <button onClick={() => setReporting('pick')} className="w-full rounded-lg py-1.5 text-xs font-semibold text-cardinal ring-1 ring-cardinal/40 hover:bg-cardinal/5">⚠ Report something on the map</button>}
                  {reporting === 'pick' && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">Click the spot on the map. <button onClick={() => setReporting('off')} className="font-semibold underline">Cancel</button></p>}
                  {Array.isArray(reporting) && <ReportForm at={reporting} onDone={() => setReporting('off')} />}
                  <hr className="border-stone-200" />
                  <div>
                    <div className="flex justify-between text-xs"><span className="font-medium">Max price</span><span>{maxRent >= 4000 ? 'Any' : money(maxRent)}</span></div>
                    <input type="range" min={600} max={4000} step={50} value={maxRent} onChange={(e) => setMaxRent(+e.target.value)} className="w-full accent-cardinal" />
                  </div>
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={insideOnly} onChange={(e) => setInsideOnly(e.target.checked)} className="accent-cardinal" />Only inside the zone</label>
                  <div className="space-y-1 text-xs text-stone-500">
                    <div><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COLORS.inside }} />Inside zone <span className="ml-3 mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COLORS.outside }} />Outside zone</div>
                  </div>
                  {params.get('ids') && <button onClick={() => { params.delete('ids'); setParams(params) }} className="text-xs font-medium text-cardinal">Clear highlighted results</button>}
                </div>
              ) : (
                <RoutePanel buildings={buildings.data ?? []} startLabel={start?.label ?? null} start={start?.p ?? null} destId={destId} setDestId={(id) => { setCustomDest(null); setDestId(id) }} customDest={customDest} setCustomDest={setCustomDest} end={dest ? [dest.lat, dest.lng] : null}
                  night={night} setNight={setNight} picking={picking} setPicking={setPicking}
                  result={route.data} loading={route.isFetching} error={route.error ? (route.error as Error).message : null}
                  onClear={() => { setStart(null); setPicking(true) }} />
              )}
            </div>
          )}
        </div>

        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute right-3 top-3 z-[500] rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-lg ring-1 ring-stone-200">
          {sidebarOpen ? 'Hide compare →' : `← Compare (${compareIds.length})`}
        </button>
      </div>

      {sidebarOpen && (
        <aside className="absolute inset-x-0 bottom-0 z-[600] h-[55%] border-t border-stone-200 bg-white shadow-2xl md:relative md:h-auto md:border-l md:border-t-0 md:shadow-none"
          style={{ width: window.innerWidth >= 768 ? (dragW ?? compareWidth) : undefined, transition: dragW ? 'none' : 'width 180ms ease' }}>
          <div onPointerDown={onDrag} onDoubleClick={() => setCompareWidth(COMPARE_SIZES[0])} title="Drag to resize (snaps to S / M / L) · double-click to reset"
            className="group absolute -left-2 top-0 z-10 hidden h-full w-4 cursor-col-resize md:block">
            <div className={`mx-auto h-full w-px ${dragW ? 'bg-cardinal' : 'bg-stone-200 group-hover:bg-cardinal'}`} />
            <div className={`absolute left-1/2 top-1/2 grid h-12 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border bg-white text-[9px] leading-none shadow-sm ${dragW ? 'border-cardinal text-cardinal' : 'border-stone-300 text-stone-400 group-hover:border-cardinal group-hover:text-cardinal'}`}>⋮</div>
            {dragW && <div className="absolute left-5 top-1/2 rounded bg-ink px-1.5 py-0.5 text-[10px] text-white">{Math.round(dragW)}px</div>}
          </div>
          <CompareSidebar onFocus={(id) => setParams({ focus: id })} />
        </aside>
      )}
    </div>
  )
}
