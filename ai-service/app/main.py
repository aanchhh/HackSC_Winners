import asyncio
import json

from fastapi import FastAPI, Header, HTTPException
from langchain_core.messages import AIMessage, HumanMessage
from sse_starlette.sse import EventSourceResponse

from app.agent.graph import graph
from app.config import settings
from app.rag.summarize import neighborhood_summary
from app.schemas import BlockSummary, ChatRequest

app = FastAPI(title="TrojanScout AI service")
_summary_cache: dict[tuple[float, float], BlockSummary] = {}


def _check_key(key: str | None):
    if key != settings.internal_key:
        raise HTTPException(401, "bad internal key")


@app.get("/health")
async def health():
    return {"ok": True, "service": "ai-service", "llm": bool(settings.llm_api_key)}


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
