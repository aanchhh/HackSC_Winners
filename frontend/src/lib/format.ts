import type { Listing } from '../api/types'

export const money = (n: number | null | undefined) => (n == null ? '—' : `$${Math.round(n).toLocaleString()}`)

export function priceLabel(l: Pick<Listing, 'rent' | 'rentMax' | 'priceUnit'>) {
  if (l.rent == null) return 'Call for pricing'
  const range = l.rentMax && l.rentMax !== l.rent ? `${money(l.rent)}–${money(l.rentMax)}` : money(l.rent)
  return `${range}${l.priceUnit === 'per room' ? ' /room' : ' /mo'}`
}

export function bedsLabel(l: Pick<Listing, 'beds' | 'bedsMax'>) {
  if (l.beds == null) return ''
  const one = (n: number) => (n === 0 ? 'Studio' : `${n} bd`)
  return l.bedsMax != null && l.bedsMax !== l.beds ? `${one(l.beds)}–${l.bedsMax} bd` : one(l.beds)
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`
}
