import { useState } from 'react'
import { TileLayer } from 'react-leaflet'

// CARTO basemaps: "Voyager" (colorful, readable labels) by day, "Dark Matter" at night.
// No API key and no domain registration, so they work on localhost and on the deployed site alike.
// (Stadia Maps only works keyless on localhost: on a real domain it returns an error *image*, which
// Leaflet can't detect as a failure.) Set VITE_TILE_URL to use your own tiles. If tiles keep failing
// we fall back to standard OpenStreetMap automatically.
const PRIMARY = import.meta.env.VITE_TILE_URL ?? 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
const NIGHT = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const PRIMARY_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
const FALLBACK = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const FALLBACK_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

let failedOnce = false  // remember across maps in this session

export default function Basemap({ extraAttribution = '', night = false }: { extraAttribution?: string; night?: boolean }) {
  const [fallback, setFallback] = useState(failedOnce)
  const [errors, setErrors] = useState(0)
  return (
    <TileLayer
      key={fallback ? `fallback${night}` : night ? 'night' : 'primary'}
      url={fallback ? FALLBACK : night ? NIGHT : PRIMARY}
      subdomains="abcd"
      className={fallback && night ? 'ts-tiles-invert' : undefined}
      attribution={(fallback ? FALLBACK_ATTR : PRIMARY_ATTR) + extraAttribution}
      maxZoom={19}
      eventHandlers={{
        tileerror: () => {
          if (fallback) return
          const n = errors + 1
          setErrors(n)
          if (n >= 4) { failedOnce = true; setFallback(true) }
        },
      }}
    />
  )
}
