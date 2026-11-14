import { MapContainer, TileLayer } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../api/client'
import { useAppStore } from '../../store/useAppStore'
import ZoneLayer from './ZoneLayer'
import ListingMarker from './ListingMarker'
import BuildingMarker from './BuildingMarker'

const USC: [number, number] = [34.0224, -118.2851]

export default function MapView() {
  const budget = useAppStore((s) => s.profile.budget)
  const zones = useQuery({ queryKey: ['zones'], queryFn: api.zones })
  const buildings = useQuery({ queryKey: ['buildings'], queryFn: api.buildings })
  const listings = useQuery({ queryKey: ['listings', budget], queryFn: () => api.listings({ maxRent: budget }) })

  return (
    <MapContainer center={USC} zoom={15} className="h-full w-full">
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {zones.data && <ZoneLayer data={zones.data} />}
      {buildings.data?.map((b) => <BuildingMarker key={b.id} building={b} />)}
      {listings.data?.map((l) => <ListingMarker key={l.id} listing={l} />)}
    </MapContainer>
  )
}
