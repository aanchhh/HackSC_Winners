# TrojanScout — HackSC 2026

Map + chat housing copilot for USC students: DPS/Fryft zones, door-to-desk commute, cited block summaries, True Trojan Cost, fit score.

```
React (Vite) :5173 ──REST+SSE──► Node+Express :4000 ──► OpenRouteService
                                   │ /api/*  public       ▲
                                   │ /internal/* agent    │ tool calls (X-Internal-Key)
                                   ▼ /api/chat proxy      │
                                 FastAPI :8000 ──► LLM (LangGraph agent + RAG)
                     both ──► Supabase Postgres (PostGIS + pgvector)
```

## Layout (each person owns a folder)

| Folder        | Owner              | Stack |
|---------------|--------------------|-------|
| `frontend/`   | Aanchal            | Vite + React + TS, Tailwind v4, react-leaflet, TanStack Query, Zustand, fetch-event-source |
| `node-api/`   | Prasham            | Express, zod, Turf.js, pg / supabase-js, axios, node-cache, http-proxy-middleware |
| `ai-service/` | Yash (agent), Dhruv (`app/rag`) | FastAPI, LangGraph, LangChain, langchain-anthropic, sentence-transformers (bge-small), psycopg + pgvector |
| `data/`       | Prasham / Dhruv    | `zones.geojson` (DPS traced from the DPS map; Fryft = same boundary), `incidents.json`, `streets.json`, `safety_resources.json`, `buildings.json`, `listings.json` (live, scraped), `listings.csv` (seed fallback) |
| `contracts/`  | Yash               | Report JSON example, SSE events, internal API |
| `supabase/`   | Prasham / Dhruv    | `schema.sql` — tables + `match_chunks` RPC |

## Pages (frontend)

| Route | Page |
|---|---|
| `/` | Landing: live stats, tap-to-check DPS zone map, search box |
| `/map` | Explore Map: DPS/Fryft layers, live listing dots → popup report next to the dot, compare sidebar (up to 3) |
| `/search` | Hybrid search over live listings |
| `/ask` | Ask Scout (LangGraph agent, streamed steps + result cards) |
| `/true-cost` | True Trojan Cost calculator (live listing or custom numbers) |
| `/preferences` | Budget, class buildings, late nights, priority weights (saved in the browser) |

## LLM key (free option)

Mock mode works with no key. For real answers, the best free option is a **Google AI Studio** key (Gemini API free tier,
no card): create one at aistudio.google.com/apikey, then in `ai-service/.env` set `LLM_PROVIDER=google` and `LLM_API_KEY=...`.
`LLM_PROVIDER=anthropic` (Claude, paid) and `groq` (free tier, set `LLM_MODEL` from console.groq.com/docs/models) also work.
With a key, smart search also uses the LLM to read queries the rules miss.

## Safety: incidents, safest route, DPS units

- `python -m app.safety.ingest` (in ai-service) writes `data/incidents.json` (LAPD NIBRS offenses, data.lacity.org `k7nn-b2ep`,
  last 6 months, block-level), `data/streets.json` (OpenStreetMap walk network via Overpass) and `data/safety_resources.json`
  (DPS HQ/substation, approximate emergency-phone spots, Campus Cruiser). Falls back to labelled synthetic incidents if LAPD is down.
- `GET /api/route?from=lat,lng&to=lat,lng&night=true` → fastest vs safest walk. Safest = shortest path where each street costs
  length × (1 + 2·√(nearby incident severity × recency / p90)), ×1.6 outside DPS, −10% if lit, small bonus for busy streets;
  never returned if it's riskier than the fastest.
- DPS units on the map are **simulated** (USC publishes no live feed): 7 units patrol real streets inside the zone, streamed over SSE.
- `npm run data:refresh` re-scrapes listings and refreshes safety data.

## Live listings + retrieval (ai-service/app/listings)

- **Sources** (robots.txt respected, 1 req/s per host): Stuho (all buildings + units), Tripalink USC section (filtered views from
  its sitemap), Mosaic Student Communities (AppFolio page), Featured (The Lorenzo, Menlo, Ellendale, Palisades, City Park — real
  locations, **sample prices**), RentCast API (licensed; only when `RENTCAST_API_KEY` is set).
- **Floorplans**: every listing has `units` (Studio, 1B1B, 2B1B, 2B2B, 3B2B, 3B3B, private room ± private bath, shared room).
- **Smart search** (`app/listings/query.py`): plain English → price, room type, bed/bath, private bath, amenities, zones, walk time
  to a building, sort. Rules first, LLM fills gaps when configured; every constraint comes back as a removable chip.
  Zillow / Apartments.com / Craigslist are deliberately excluded (their terms forbid scraping).
- **Pipeline**: scrape → normalize → dedupe by address → keep ≤3 mi of campus → DPS/Fryft flags from Node → `data/listings.json` → index.
  Refreshes every `REFRESH_MINUTES` (default 60) in the FastAPI lifespan; `python -m app.listings.pipeline` or `POST /api/refresh` forces one.
- **Retriever**: hard filters parsed from the query (price, beds, studio, "inside DPS") → dense `bge-small-en-v1.5` in FAISS (exact
  inner product) + sparse BM25 (`bm25s`, stemmed) → Reciprocal Rank Fusion → cross-encoder rerank (`ms-marco-MiniLM-L-6-v2`) of the top 20.
  All local and free. ~40 ms warm.
- **Possible upgrade**: replace BM25 with SPLADE++ (learned sparse, e.g. `prithivida/Splade_PP_en_v1` via fastembed); it matches synonyms
  ("furnished" ≈ "comes with furniture") that BM25 misses, at the cost of slower indexing.

## Run locally

```bash
npm run setup     # first time only (already done on this machine)
npm run dev       # web :5173, node :4000, ai :8000
```

Each service has a `.env` (copied from `.env.example`). Everything runs in **mock mode** with no keys:
Node reads `/data`, commute falls back to straight-line estimates, and the agent streams a mock answer.
Fill in `LLM_API_KEY`, `ORS_API_KEY`, `DATABASE_URL` to go real. `INTERNAL_KEY` must match in node-api and ai-service.

## Deploy

| Service  | Host   | Build / start | Env vars |
|----------|--------|---------------|----------|
| frontend | Vercel | root `frontend`, `npm run build` → `dist` | `VITE_API_URL` |
| node-api | Render | `npm install && npm run build` / `npm start` | `DATABASE_URL ORS_API_KEY AI_SERVICE_URL INTERNAL_KEY CORS_ORIGIN` |
| ai-service | Render | `pip install -r requirements.txt` / `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | `DATABASE_URL LLM_API_KEY NODE_INTERNAL_URL INTERNAL_KEY` |

Render free instances sleep: hit both `/health` endpoints 5 min before the demo.
