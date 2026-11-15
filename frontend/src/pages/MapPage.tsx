import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { MapContainer, TileLayer } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAppStore } from '../store/useAppStore'
import ZoneLayer, { ZONE_STYLE } from '../components/map/ZoneLayer'
import ListingMarker from '../components/map/ListingMarker'
import BuildingMarker from '../components/map/BuildingMarker'
import CompareSidebar from '../components/map/CompareSidebar'
import FlyTo from '../components/map/FitBounds'
import { money } from '../lib/format'

export const USC: [number, number] = [34.0224, -118.2851]

export default function MapPage() {
  const [params, setParams] = useSearchParams()
  const focusId = params.get('focus')
  const { compareIds, highlightedIds, profile } = useAppStore()
  const [visible, setVisible] = useState<Record<string, boolean>>({ DPS: true, Fryft: false })
  const [maxRent, setMaxRent] = useState(4000)
  const [dpsOnly, setDpsOnly] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768)

  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones })
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.buildings })
  const listings = useQuery({ queryKey: ['listings'], queryFn: () => api.listings() })

  const shown = useMemo(() => (listings.data ?? []).filter((l) =>
    (maxRent >= 4000 || (l.rent != null && l.rent <= maxRent)) && (!dpsOnly || l.inDps) ), [listings.data, maxRent, dpsOnly])
  const highlightSet = new Set([...(params.get('ids')?.split(',') ?? []), ...highlightedIds])
  const focused = listings.data?.find((l) => l.id === focusId)

  return (
    <div className="relative flex h-full">
      <div className="relative min-w-0 flex-1">
        <MapContainer center={USC} zoom={15} className="h-full w-full" zoomControl={false}>
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          {zones.data && <ZoneLayer data={zones.data} visible={visible} />}
          {buildings.data?.map((b) => <BuildingMarker key={b.id} building={b} chosen={profile.buildingIds.includes(b.id)} />)}
          {shown.map((l) => (
            <ListingMarker key={l.id} listing={l} focused={l.id === focusId} highlighted={highlightSet.has(l.id)} comparing={compareIds.includes(l.id)} />
          ))}
          <FlyTo target={focused ? [focused.lat, focused.lng] : null} />
        </MapContainer>

        {/* Floating map controls */}
        <div className="absolute left-3 top-3 z-[500] w-64 space-y-3 rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-stone-200 backdrop-blur">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold">Map layers</span>
            <span className="text-xs text-stone-500">{shown.length} of {listings.data?.length ?? 0} listings</span>
          </div>
          {Object.keys(ZONE_STYLE).map((z) => (
            <label key={z} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={visible[z]} onChange={(e) => setVisible({ ...visible, [z]: e.target.checked })} className="accent-cardinal" />
              <span className="inline-block h-3 w-5 rounded-sm border-2" style={{ borderColor: ZONE_STYLE[z].color, borderStyle: ZONE_STYLE[z].dash ? 'dashed' : 'solid' }} />
              {z === 'DPS' ? 'DPS patrol zone' : 'Fryft area (placeholder)'}
            </label>
          ))}
          <div>
            <div className="flex justify-between text-xs"><span className="font-medium">Max price</span><span>{maxRent >= 4000 ? 'Any' : money(maxRent)}</span></div>
            <input type="range" min={600} max={4000} step={50} value={maxRent} onChange={(e) => setMaxRent(+e.target.value)} className="w-full accent-cardinal" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={dpsOnly} onChange={(e) => setDpsOnly(e.target.checked)} className="accent-cardinal" /> Inside DPS only
          </label>
          {params.get('ids') && (
            <button onClick={() => { params.delete('ids'); setParams(params) }} className="text-xs font-medium text-cardinal">Clear highlighted results</button>
          )}
        </div>

        <button onClick={() => setSidebarOpen(!sidebarOpen)}
          className="absolute right-3 top-3 z-[500] rounded-full bg-white px-3 py-1.5 text-sm font-semibold shadow-lg ring-1 ring-stone-200">
          {sidebarOpen ? 'Hide compare →' : `← Compare (${compareIds.length})`}
        </button>
      </div>

      {sidebarOpen && (
        <aside className="absolute inset-x-0 bottom-0 z-[600] h-[55%] border-t border-stone-200 bg-white shadow-2xl md:static md:h-auto md:w-[380px] md:border-l md:border-t-0 md:shadow-none">
          <CompareSidebar onFocus={(id) => setParams({ focus: id })} />
        </aside>
      )}
    </div>
  )
}
