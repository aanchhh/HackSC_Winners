# Deploying TrojanScout

| Part | Host | Cost | Why |
|---|---|---|---|
| Frontend (React/Vite) | **Vercel** | Free | Static site + CDN |
| Node API (Express) | **Render** web service | Free | Always-on server: SSE live rides, background DPS-alert refresh, file storage. Uses ~290 MB RAM. |
| AI service (FastAPI, embeddings, Scout) | **Hugging Face Space** (Docker) | Free | Needs ~2 GB RAM for PyTorch + models; Spaces give 16 GB on the free CPU tier |
| LLM | **Groq** | Free tier | Ollama can't run on Vercel/Render/Spaces' free tiers. One key is enough: most searches use the built-in rules and never call the LLM |

Order: **1 Groq → 2 Hugging Face → 3 Render → 4 Vercel → 5 connect the URLs.** About 20 minutes.

## 1. Groq key
console.groq.com → API Keys → Create. Keep it for step 2.

## 2. AI service on Hugging Face
1. huggingface.co → New Space → name `trojanscout-ai`, SDK **Docker** (Blank), hardware **CPU basic (free)**, Public.
2. huggingface.co/settings/tokens → New token, type **Write**.
3. GitHub repo → Settings → Secrets and variables → Actions → add:
   - `HF_TOKEN` = the write token
   - `HF_SPACE` = `<your-hf-username>/trojanscout-ai`
4. In the Space → Settings → **Variables and secrets** add:
   - `LLM_PROVIDER` = `groq`
   - `LLM_API_KEY` = your Groq key (secret)
   - `LLM_MODEL` = leave empty for the default, or a smaller model from console.groq.com/docs/models if you hit limits
   - `INTERNAL_KEY` = the same value Render generates in step 3 (secret)
   - `NODE_INTERNAL_URL` = your Render URL from step 3
   - `REFRESH_MINUTES` = `0` (keeps the AI service's listings identical to the Node API's)
5. GitHub → Actions → "Deploy AI service to Hugging Face" → **Run workflow** (it also runs on every push to `main`).
   The first build takes ~10 min. Your URL: `https://<your-hf-username>-trojanscout-ai.hf.space` (check `/health`).

## 3. Node API on Render
1. render.com → New → **Blueprint** → connect the GitHub repo → it reads `render.yaml`.
2. Fill the prompted values:
   - `CORS_ORIGIN` = your Vercel URL (you can enter a placeholder now and update it after step 4)
   - `PUBLIC_API_URL` = `https://trojanscout-api.onrender.com` (the service's own URL)
   - `AI_SERVICE_URL` = the Hugging Face URL from step 2
   - `BREVO_API_KEY` / `MAIL_FROM` = optional (email sign-in codes; without them the codes appear in Render → Logs)
3. After it deploys, open the service → Environment → copy `INTERNAL_KEY` into the Space secret (step 2.4) and restart the Space.

## 4. Frontend on Vercel
1. vercel.com → Add New → Project → import the GitHub repo.
2. **Root Directory: `frontend`** (framework Vite is detected; `vercel.json` handles page routing).
3. Environment variable: `VITE_API_URL` = your Render URL (no trailing slash).
4. Deploy. Then put the Vercel URL into Render's `CORS_ORIGIN` and redeploy Render.

## 5. Check it
- `https://<render>/health` → `{"ok":true}`
- `https://<space>.hf.space/health` → shows `"llm": true, "provider": "groq"`
- Open the Vercel URL: search, map, safe route, Book Ride, sign in.

## Free-tier limits to know
- **Render free sleeps after 15 min idle**; the first visit then takes ~50 s. Open it a minute before a demo (or use the $7 plan).
- **Files written at runtime reset on restart** on Render free (accounts, reports). Fine for a demo; for real use, attach a disk or move them to Supabase (schema in `supabase/`).
- **Spaces sleep after 48 h without visits.**
- Groq free tier has per-minute and per-day limits; the app falls back to rules-only answers when the LLM is unavailable.
