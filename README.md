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
| `data/`       | Prasham / Dhruv    | `zones.geojson` (PLACEHOLDER polygons), `buildings.json`, `listings.csv`, `raw/` (gitignored) |
| `contracts/`  | Yash               | Report JSON example, SSE events, internal API |
| `supabase/`   | Prasham / Dhruv    | `schema.sql` — tables + `match_chunks` RPC |

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
