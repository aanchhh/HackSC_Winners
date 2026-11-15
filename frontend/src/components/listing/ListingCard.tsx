import { Link } from 'react-router'
import type { Listing, SearchHit } from '../../api/types'
import { bedsLabel, priceLabel } from '../../lib/format'
import { useAppStore } from '../../store/useAppStore'
import ZoneBadges from './ZoneBadges'

export default function ListingCard({ listing, showRanks = false }: { listing: Listing | SearchHit; showRanks?: boolean }) {
  const { compareIds, toggleCompare } = useAppStore()
  const comparing = compareIds.includes(listing.id)
  const hit = listing as SearchHit
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[16/9] bg-stone-100">
        {listing.photos?.[0] ? (
          <img src={listing.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-3xl text-stone-300">🏠</div>
        )}
        <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold">{listing.source}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div>
          <h3 className="font-semibold leading-tight">{listing.name}</h3>
          <p className="text-xs text-stone-500">{listing.address}</p>
        </div>
        <p className="text-lg font-bold text-cardinal">{priceLabel(listing)}</p>
        <p className="text-sm text-stone-600">
          {[bedsLabel(listing), listing.distanceToCampusMi != null && `${listing.distanceToCampusMi} mi to campus`, listing.availability].filter(Boolean).join(' · ')}
        </p>
        <ZoneBadges inDps={listing.inDps} inFryft={listing.inFryft} />
        {showRanks && (hit.denseRank || hit.bm25Rank) && (
          <p className="text-[11px] text-stone-400">semantic #{hit.denseRank ?? '–'} · keyword #{hit.bm25Rank ?? '–'}</p>
        )}
        <div className="mt-auto flex gap-2 pt-2">
          <Link to={`/map?focus=${encodeURIComponent(listing.id)}`} className="flex-1 rounded-lg bg-cardinal px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-cardinal-dark">
            Show on map
          </Link>
          <button onClick={() => toggleCompare(listing.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${comparing ? 'bg-gold ring-gold' : 'ring-stone-300 hover:bg-stone-50'}`}>
            {comparing ? '✓ Comparing' : '+ Compare'}
          </button>
        </div>
      </div>
    </article>
  )
}
