import { CircleMarker, Tooltip } from 'react-leaflet'
import type { Building } from '../../api/types'

export default function BuildingMarker({ building }: { building: Building }) {
  return (
    <CircleMarker center={[building.lat, building.lng]} radius={5} pathOptions={{ color: '#990000', fillOpacity: 1 }}>
      <Tooltip>{building.name}</Tooltip>
    </CircleMarker>
  )
}
