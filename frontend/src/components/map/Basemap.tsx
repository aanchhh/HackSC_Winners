import { useState } from 'react'
import { TileLayer } from 'react-leaflet'

// Clean, colorful basemap (Stadia "OSM Bright": green parks, warm roads, readable labels).
// Works on localhost with no key. For a deployed domain, register it (free) at stadiamaps.com, or set
// VITE_TILE_URL. If tiles keep failing we fall back to standard OpenStreetMap automatically.
const PRIMARY = import.meta.env.VITE_TILE_URL ?? 'https://tiles.stadiamaps.com/tiles/osm_bright/{z}/{x}/{y}{r}.png'
const PRIMARY_ATTR = '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const FALLBACK = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const FALLBACK_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

let failedOnce = false  // remember across maps in this session

export default function Basemap({ extraAttribution = '' }: { extraAttribution?: string }) {
  const [fallback, setFallback] = useState(failedOnce)
  const [errors, setErrors] = useState(0)
  return (
    <TileLayer
      key={fallback ? 'fallback' : 'primary'}
      url={fallback ? FALLBACK : PRIMARY}
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
