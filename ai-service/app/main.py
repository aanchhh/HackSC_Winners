import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, Header, HTTPException, Query
from langchain_core.messages import AIMessage, HumanMessage
from sse_starlette.sse import EventSourceResponse

from app.agent.graph import graph
from app.config import settings
from app.rag.summarize import neighborhood_summary
from app.listings import pipeline
from app.listings.index import INDEX, Filters, parse_query, warm
from app.schemas import BlockSummary, ChatRequest

log = logging.getLogger("uvicorn.error")


async def _refresh_loop():
    """'Real-time': re-scrape on a schedule. Refresh right away if data is missing or stale."""
    listings_file = Path(settings.data_dir) / "listings.json"
    while True:
        age_min = (time.time() - listings_file.stat().st_mtime) / 60 if listings_file.exists() else 1e9
        if not INDEX.listings or age_min >= settings.refresh_minutes:
            try:
                log.info("listings refresh: %s", await pipeline.refresh())
            except Exception as e:
                log.warning("listings refresh failed: %s", e)
        await asyncio.sleep(max(settings.refresh_minutes, 1) * 60)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    INDEX.load()
    await asyncio.to_thread(warm)
    task = asyncio.create_task(_refresh_loop()) if settings.refresh_minutes > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="TrojanScout AI service", lifespan=lifespan)
_summary_cache: dict[tuple[float, float], BlockSummary] = {}


def _check_key(key: str | None):
    if key != settings.internal_key:
        raise HTTPException(401, "bad internal key")


@app.get("/health")
async def health():
    return {"ok": True, "service": "ai-service", "llm": bool(settings.llm_api_key)}


@app.get("/ai/listings/search")
async def listings_search(
    q: str = "", k: int = Query(20, le=100), maxRent: int | None = None, minBeds: int | None = None,
    inDps: bool | None = None, inFryft: bool | None = None, source: str | None = None,
    x_internal_key: str | None = Header(None),
):
    """Hybrid search. Explicit query params override constraints parsed from the text."""
    _check_key(x_internal_key)
    t0 = time.perf_counter()
    text, parsed = parse_query(q)
    explicit = dict(maxRent=maxRent, minBeds=minBeds, inDps=inDps, inFryft=inFryft, source=source)
    f = Filters(**{**asdict(parsed), **{k_: v for k_, v in explicit.items() if v is not None}})
    hits = await asyncio.to_thread(INDEX.search, text, f, k)
    return {
        "query": q, "filters": {k_: v for k_, v in asdict(f).items() if v is not None},
        "count": len(hits), "tookMs": round((time.perf_counter() - t0) * 1000),
        "results": [{**h["listing"].model_dump(), "score": h["score"], "denseRank": h["denseRank"], "bm25Rank": h["bm25Rank"]} for h in hits],
    }


@app.get("/ai/listings/status")
async def listings_status():
    return {"count": len(INDEX.listings), "indexedAt": INDEX.built_at, "refreshMinutes": settings.refresh_minutes}


@app.post("/ai/listings/refresh")
async def listings_refresh(x_internal_key: str | None = Header(None)):
    _check_key(x_internal_key)
    return await pipeline.refresh()


@app.get("/ai/neighborhood", response_model=BlockSummary)
async def neighborhood(lat: float, lng: float, x_internal_key: str | None = Header(None)):
    _check_key(x_internal_key)
    key = (round(lat, 5), round(lng, 5))
    if key not in _summary_cache:
        _summary_cache[key] = await neighborhood_summary(lat, lng)
    return _summary_cache[key]


@app.post("/ai/chat")
async def chat(req: ChatRequest, x_internal_key: str | None = Header(None)):
    _check_key(x_internal_key)
    queue: asyncio.Queue = asyncio.Queue()

    async def emit(event: str, data: dict):
        await queue.put({"event": event, "data": json.dumps(data)})

    async def run():
        history = [HumanMessage(t.content) if t.role == "user" else AIMessage(t.content) for t in req.history]
        try:
            await graph.ainvoke({"messages": [*history, HumanMessage(req.message)], "profile": req.profile},
                                config={"configurable": {"emit": emit}})
        except Exception as e:
            await emit("error", {"message": f"Agent failed: {e}"})
        finally:
            await emit("done", {})
            await queue.put(None)

    async def stream():
        task = asyncio.create_task(run())
        while (item := await queue.get()) is not None:
            yield item
        await task

    return EventSourceResponse(stream(), headers={"X-Accel-Buffering": "no"})
