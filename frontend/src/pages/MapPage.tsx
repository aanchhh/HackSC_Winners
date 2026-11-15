import { useCallback, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { MapContainer, TileLayer } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ListingV2 } from '../api/types'
import { useAppStore } from '../store/useAppStore'
import ZoneLayer from '../components/map/ZoneLayer'
import ListingMarker from '../components/map/ListingMarker'
import BuildingMarker from '../components/map/BuildingMarker'
import CompareSidebar from '../components/map/CompareSidebar'
import RoutePanel from '../components/map/RoutePanel'
import FlyTo from '../components/map/FitBounds'
import { ClickToPick, COLORS, DpsUnitsLayer, IncidentLayer, RouteLayer, SafetyLayer } from '../components/map/layers'
import InfoTip from '../components/ui/InfoTip'
import { EXPLAIN } from '../lib/explain'
import { money } from '../lib/format'

export const USC: [number, number] = [34.0224, -118.2851]

export default function MapPage() {
  const [params, setParams] = useSearchParams()
  const focusId = params.get('focus')
  const { compareIds, highlightedIds, profile, compareWidth, setCompareWidth } = useAppStore()
  const [tab, setTab] = useState<'layers' | 'route'>(params.get('mode') === 'route' ? 'route' : 'layers')
  const [layers, setLayers] = useState({ zone: true, incidents: false, safety: true, units: true })
  const [maxRent, setMaxRent] = useState(4000)
  const [insideOnly, setInsideOnly] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)
  const [panelOpen, setPanelOpen] = useState(true)

  // safe-route state
  const [start, setStart] = useState<{ p: [number, number]; label: string } | null>(null)
  const [destId, setDestId] = useState(profile.buildingIds[0] ?? 9)
  const [night, setNight] = useState(true)
  const [picking, setPicking] = useState(params.get('mode') === 'route')

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones })
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.buildings })
  const listings = useQuery({ queryKey: ['listings'], queryFn: () => api.listings() })
  const dest = buildings.data?.find((b) => b.id === destId)
  const route = useQuery({
    queryKey: ['route', start?.p, dest?.id, night],
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
  const onDrag = (e: React.PointerEvent) => {
    dragging.current = true
    const move = (ev: PointerEvent) => dragging.current && setCompareWidth(window.innerWidth - ev.clientX)
    const up = () => { dragging.current = false; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    e.preventDefault()
  }

  const toggle = (k: keyof typeof layers) => setLayers({ ...layers, [k]: !layers[k] })
  return (
    <div className="relative flex h-full">
      <div className={`relative min-w-0 flex-1 ${picking ? 'cursor-crosshair' : ''}`}>
        <MapContainer center={USC} zoom={15} className="h-full w-full" zoomControl={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · incidents: LAPD' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {zones.data && layers.zone && <ZoneLayer data={zones.data} visible={{ DPS: true, Fryft: false }} />}
          {layers.incidents && <IncidentLayer days={180} />}
          {layers.safety && <SafetyLayer />}
          {buildings.data?.map((b) => <BuildingMarker key={b.id} building={b} chosen={profile.buildingIds.includes(b.id)} />)}
          {shown.map((l) => (
            <ListingMarker key={l.id} listing={l} focused={l.id === focusId} highlighted={highlightSet.has(l.id)} comparing={compareIds.includes(l.id)} onSafeRoute={safeRouteFrom} />
          ))}
          {tab === 'route' && <RouteLayer result={route.data} start={start?.p ?? null} end={dest && start ? [dest.lat, dest.lng] : null} />}
          {layers.units && <DpsUnitsLayer />}
          <ClickToPick active={tab === 'route' && picking} onPick={(p) => { setStart({ p, label: `Dropped pin (${p[0].toFixed(4)}, ${p[1].toFixed(4)})` }); setPicking(false) }} />
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
                  <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={layers.safety} onChange={() => toggle('safety')} className="accent-cardinal" />
                    <span className="inline-block h-3 w-3 rounded-full bg-blue-600" />DPS stations & emergency phones</label>
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
                <RoutePanel buildings={buildings.data ?? []} startLabel={start?.label ?? null} destId={destId} setDestId={setDestId}
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
          style={{ width: window.innerWidth >= 768 ? compareWidth : undefined }}>
          <div onPointerDown={onDrag} title="Drag to resize"
            className="absolute -left-1.5 top-0 z-10 hidden h-full w-3 cursor-col-resize md:block">
            <div className="mx-auto mt-[45vh] h-10 w-1.5 rounded-full bg-stone-300 hover:bg-cardinal" />
          </div>
          <CompareSidebar onFocus={(id) => setParams({ focus: id })} />
        </aside>
      )}
    </div>
  )
}
