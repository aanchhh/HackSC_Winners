import { useCallback, useEffect, useRef } from 'react'
import { CircleMarker, Popup, Tooltip } from 'react-leaflet'
import type L from 'leaflet'
import type { Listing } from '../../api/types'
import { priceLabel } from '../../lib/format'
import ListingPopup from './ListingPopup'

interface Props { listing: Listing; highlighted: boolean; comparing: boolean; focused: boolean }

export default function ListingMarker({ listing, highlighted, comparing, focused }: Props) {
  const markerRef = useRef<L.CircleMarker>(null)
  const popupRef = useRef<L.Popup>(null)
  const resize = useCallback(() => popupRef.current?.update(), [])
  useEffect(() => { if (focused) setTimeout(() => markerRef.current?.openPopup(), 300) }, [focused])

  const color = listing.inDps === false ? '#ea580c' : '#059669'
  return (
    <CircleMarker ref={markerRef} center={[listing.lat, listing.lng]} radius={highlighted || comparing ? 10 : 7}
      pathOptions={{ color: comparing ? '#ffc72c' : '#ffffff', weight: comparing ? 4 : 2, fillColor: color, fillOpacity: highlighted ? 1 : 0.85 }}>
      <Tooltip direction="top" offset={[0, -8]}>{listing.name} · {priceLabel(listing)}</Tooltip>
      <Popup ref={popupRef} className="ts-popup" maxWidth={320} minWidth={320} offset={[0, -6]} autoPanPaddingTopLeft={[290, 70]} autoPanPaddingBottomRight={[24, 24]}>
        <ListingPopup listing={listing} onResize={resize} />
      </Popup>
    </CircleMarker>
  )
}
