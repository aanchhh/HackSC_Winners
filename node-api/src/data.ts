// Seed data loader. Mock-first: reads /data files until Supabase is wired up (see db.ts).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { FeatureCollection, Polygon } from 'geojson'

const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data')

export interface Listing { id: number; address: string; rent: number; beds: number; lat: number; lng: number; url: string; utilities_est: number }
export interface Building { id: number; name: string; code: string; lat: number; lng: number }

export const zones = JSON.parse(readFileSync(path.join(DATA_DIR, 'zones.geojson'), 'utf8')) as FeatureCollection<Polygon>
export const buildings = JSON.parse(readFileSync(path.join(DATA_DIR, 'buildings.json'), 'utf8')) as Building[]

const [header, ...rows] = readFileSync(path.join(DATA_DIR, 'listings.csv'), 'utf8').trim().split('\n')
const cols = header.split(',')
export const listings: Listing[] = rows.map((r) => {
  const v = r.split(',')
  const o = Object.fromEntries(cols.map((c, i) => [c, v[i]]))
  return { id: +o.id, address: o.address, rent: +o.rent, beds: +o.beds, lat: +o.lat, lng: +o.lng, url: o.url, utilities_est: +o.utilities_est }
})
