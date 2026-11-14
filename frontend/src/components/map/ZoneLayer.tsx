import { GeoJSON } from 'react-leaflet'

const COLORS: Record<string, string> = { DPS: '#990000', Fryft: '#FFC72C', Tram: '#2563eb' }

// TODO(Aanchal): toggles per zone
export default function ZoneLayer({ data }: { data: GeoJSON.FeatureCollection }) {
  return (
    <GeoJSON
      key={JSON.stringify(data).length}
      data={data}
      style={(f) => ({ color: COLORS[f?.properties?.name] ?? '#666', weight: 2, fillOpacity: 0.12 })}
    />
  )
}
