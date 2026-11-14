import { CircleMarker, Tooltip } from 'react-leaflet'
import type { Listing } from '../../api/types'
import { useAppStore } from '../../store/useAppStore'

export default function ListingMarker({ listing }: { listing: Listing }) {
  const select = useAppStore((s) => s.select)
  const highlighted = useAppStore((s) => s.highlightedIds.includes(listing.id))
  const color = listing.inFryft ? '#16a34a' : '#dc2626'
  return (
    <CircleMarker
      center={[listing.lat, listing.lng]}
      radius={highlighted ? 11 : 7}
      pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: highlighted ? 4 : 1 }}
      eventHandlers={{ click: () => select(listing.id) }}
    >
      <Tooltip>{listing.address} · ${listing.rent}</Tooltip>
    </CircleMarker>
  )
}
