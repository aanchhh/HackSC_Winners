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
| `/rides` | Book Ride: real-time shared rides with live matching and fare savings |
| `/free` | Free & Safe: search free rides, escorts, apps and programs by situation, with live status |

## LLM (local by default)

The AI service uses a **local model through Ollama**: free, private, no API key.
1. Install Ollama (ollama.com) and start it.
2. `ollama pull qwen2.5:7b` (~4.7 GB; good structured output + tool calling on a 16 GB Mac).
3. `LLM_PROVIDER=ollama` in `ai-service/.env` (the default). `/health` shows `"llm": true` once the model is reachable.

Alternatives via `LLM_PROVIDER`: `google` (free AI Studio key), `anthropic`, `groq`. If no model is reachable the app runs in mock mode.

## Free & Safe directory (`/free`)

- `data/free_programs.json`: 26 free or low-cost safety and mobility programs (USC, LA Metro/LADOT, LA County, California, national
  app features), each with eligibility, cost, a schedule (daily hours or yearly windows like Dec 24/Dec 31), coverage area, how to
  use it, official sources, the date it was checked, and `confidence: "check"` where sources disagree.
- `ai-service/app/free/search.py`: meaning + keyword search, situation rules ("I've been drinking", "someone is following me",
  "can't afford the bus"…), live status in LA time ("Available now, until 2 AM", "Next: New Year's Eve"), and area checks
  (Fryft/DPS polygons, the South LA mobility pilot). Edits to the JSON are picked up automatically.
- **Little-known USC transport, confirmed from transnet.usc.edu / dps.usc.edu:** USC Lyft Rides with its official boundary
  (`data/usc_ride_zones.geojson`: east of Normandie, south of Washington, west of Main, north of MLK; 7 PM–2 AM, Shared only),
  HSC Lyft incl. Union Station, the UPC ↔ Union Station shuttle (37 weekday departures), the weekend intercampus shuttle,
  the Thanksgiving LAX shuttle (reserve by Nov 20), and free first-year Zipcar.
- **Alerts** (`/api/free/alerts`): reservation deadlines, free days, service gaps and rides starting tonight → 🔔 bell, a top
  banner for urgent ones, and optional browser notifications (sent once each while the site is open).
- **Trip options** (`/api/free/trip`): for a from/to it lists the free ways that apply to that exact trip and why (both ends in
  the Lyft boundary, next shuttle departure, etc.). "Safest walk to the stop" routes the safe walk to the shuttle stop.
  Shown in the safe-route planner and in Book Ride before you pay.

## Shared rides (Book Ride page)

- `POST /api/rides` books a trip; `GET /api/rides/stream?userId=…` (SSE) pushes each browser its matches, incoming share requests,
  the live board and an activity feed. State is in memory in node-api (`src/services/rides.ts`).
- Matching: departures within 20 min; best pickup/drop order for up to 3 riders; shown only if every rider saves money and nobody's
  detour exceeds ~6 min (or 40% of their trip). Tags explain the fit: pickup near yours / on your way, drop near yours / on your way.
- Pricing (estimate): $1.25 base + $3.10 fee + $1.15/mi + $0.30/min (min $8.50); the shared fare is split in proportion to each rider's
  solo fare. Matched groups get "Book in Uber" (pickup → final drop deep link) and a Google Maps route with all stops.
- Demo demand: the server adds labelled **demo** riders on common USC trips, and after a real booking 1–2 demo riders book similar
  trips within ~1–3 min. `RIDE_SIM=0` turns this off. Real riders = anyone else using the app (open a second browser to try it).
- Privacy: other riders see your pickup/drop at ~100 m precision until you match.

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

## Sign-in (OIDC) and friends

TrojanScout signs users in with OpenID Connect (authorization code + PKCE, id_token verified against the provider's JWKS).

- **Demo (default):** `/auth/login` redirects to a built-in identity provider at `/demo-idp`, which is clearly labelled
  "Demo identity provider · not USC" and never asks for a password. You can pick a demo student or type a name and email.
- **Production:** set `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (and `PUBLIC_API_URL`, `SESSION_SECRET`) in `node-api/.env` to point at the university IdP. The same code path is used.
- The profile (`/profile`) holds your home (for DPS alerts within 600 m), emergency contacts (one tap texts them your safe route), and friends.
- In Book Ride, friends' rides rank first, are shown in pink, and can be filtered with "Friends only". Accounts live in `data/users.json`, which is git-ignored.

## Recent-incident check and safety places

- `GET /api/recent?lat&lng&hours=24` returns USC DPS crime alerts (from the dps.usc.edu feed, refreshed every 20 min, placed by intersection, block or building, with honest precision) plus student reports. LAPD data lags about 2 weeks, so it is shown separately.
- `GET /api/alerts` is one feed for the bell: DPS alerts near home or campus, student reports, friend requests, friends' rides and ride-share requests. Free-program alerts are merged in by the frontend.
- The map shows police stations (LAPD and others), DPS stations, blue-light phones, clinics and USC health vending machines (OpenStreetMap plus USC pages; vending positions are approximate).
