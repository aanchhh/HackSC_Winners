"""START → parse_intent ─┬ search            → extract_filters → search_listings → enrich → rank → explain → END
                         ├ ask_about_listing → enrich → explain → END
                         ├ need_info         → ask_clarifying → END
                         └ general           → explain → END
Every node emits an SSE `step` via the `emit` callable in config["configurable"]."""
import asyncio
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph

from app.agent import prompts
from app.agent.state import AgentState
from app.agent.tools import commute, hybrid_search, neighborhood_rag, score, search_listings, true_cost, zone_check
from app.listings.index import INDEX
from app.llm import get_llm
from app.schemas import Filters


async def _step(config: RunnableConfig, label: str, status: str):
    emit = config["configurable"].get("emit")
    if emit:
        await emit("step", {"label": label, "status": status})


def _last_user_text(state: AgentState) -> str:
    return state["messages"][-1].content if state.get("messages") else ""


async def parse_intent(state: AgentState, config: RunnableConfig):
    await _step(config, "Understanding your question", "running")
    text = _last_user_text(state).lower()
    # TODO(Yash): replace heuristic with LLM structured output
    intent = "search" if re.search(r"\$|under|fryft|dps|min|bed|cheap|find|near", text) else "general"
    await _step(config, "Understanding your question", "done")
    return {"intent": intent}


async def extract_filters(state: AgentState, config: RunnableConfig):
    await _step(config, "Extracting filters", "running")
    profile, text = state["profile"], _last_user_text(state)
    llm = get_llm()
    if llm:
        f = await llm.with_structured_output(Filters).ainvoke(
            [SystemMessage(prompts.EXTRACT_FILTERS), HumanMessage(f"Profile: {profile.model_dump_json()}\nMessage: {text}")])
    else:  # mock mode
        m = re.search(r"\$?\s?([\d,]{3,})", text)
        f = Filters(maxRent=int(m.group(1).replace(",", "")) if m else profile.budget,
                    inFryft=True if "fryft" in text.lower() else None, buildingIds=profile.buildingIds)
    await _step(config, "Extracting filters", "done")
    return {"filters": f}


async def search(state: AgentState, config: RunnableConfig):
    await _step(config, "Searching listings", "running")
    f = state["filters"]
    if INDEX.listings:  # live scraped listings via hybrid retrieval
        res = await hybrid_search.ainvoke({"query": _last_user_text(state), "maxRent": f.maxRent, "minBeds": f.beds,
                                           "inDps": f.inDps, "inFryft": f.inFryft, "k": 8})
    else:               # fallback: Node filter over seed data
        res = await search_listings.ainvoke({"maxRent": f.maxRent, "beds": f.beds, "inFryft": f.inFryft, "inDps": f.inDps})
    await _step(config, "Searching listings", "done")
    return {"candidates": res if isinstance(res, list) else []}


async def enrich(state: AgentState, config: RunnableConfig):
    await _step(config, "Checking zones, commute, cost & block data", "running")
    profile = state["profile"].model_dump()

    async def one(l: dict):
        z, c, tc, nb = await asyncio.gather(
            zone_check.ainvoke({"lat": l["lat"], "lng": l["lng"]}),
            commute.ainvoke({"listingId": l["id"], "buildingIds": profile["buildingIds"] or [1]}),
            true_cost.ainvoke({"listingId": l["id"], "profile": profile}),
            neighborhood_rag.ainvoke({"lat": l["lat"], "lng": l["lng"]}),
        )
        return {**l, "zones": z, "commute": c, "cost": tc, "block": nb}

    enriched = await asyncio.gather(*(one(l) for l in state.get("candidates", [])))
    await _step(config, "Checking zones, commute, cost & block data", "done")
    return {"enriched": list(enriched)}


async def rank(state: AgentState, config: RunnableConfig):
    await _step(config, "Ranking by your priorities", "running")
    enriched = state.get("enriched", [])
    scores = await score.ainvoke({"listingIds": [l["id"] for l in enriched], "profile": state["profile"].model_dump()})
    by_id = {s["listingId"]: s["fitScore"] for s in scores} if isinstance(scores, list) else {}
    ranked = sorted(enriched, key=lambda l: by_id.get(l["id"], 0), reverse=True)
    for l in ranked:
        l["fitScore"] = by_id.get(l["id"])
    emit = config["configurable"].get("emit")
    if emit:
        await emit("listings", {"ids": [l["id"] for l in ranked]})
    await _step(config, "Ranking by your priorities", "done")
    return {"ranked": ranked}


async def explain(state: AgentState, config: RunnableConfig):
    await _step(config, "Writing the answer", "running")
    emit = config["configurable"].get("emit")
    ranked = state.get("ranked", [])
    llm = get_llm()
    if llm:
        # Compact facts only (local models are much faster with a short context)
        facts = []
        for i, l in enumerate(ranked[:5], 1):
            cost, zones = l.get("cost") or {}, l.get("zones") or {}
            walk = ", ".join(f"{c['building']} {c['walk']} min" for c in (l.get("commute") or []) if isinstance(c, dict))
            units = ", ".join(u["label"] for u in (l.get("units") or [])[:4])
            facts.append(f"[{i}] {l.get('name')} | {l.get('rent')} {l.get('priceUnit')} | {units} | "
                         f"{'inside' if zones.get('inDps') else 'outside'} DPS | walk: {walk} | True Cost ${cost.get('total', '?')}/mo | "
                         f"fit {l.get('fitScore')} | {(l.get('block') or {}).get('summary', '')[:160]}")
        msgs = [SystemMessage(prompts.EXPLAIN + " Keep it under 150 words: a one-line recommendation, then the top 3 as short bullets."),
                HumanMessage(f"Question: {_last_user_text(state)}\nRanked listings (best first):\n" + "\n".join(facts))]
        async for chunk in llm.astream(msgs):
            if chunk.text and emit:
                await emit("token", {"text": chunk.text})
    elif emit:
        text = (f"[mock] Found {len(ranked)} listing(s). Top: "
                + ", ".join(f"{l.get('name', l['id'])} ${l.get('rent')} (fit {l.get('fitScore')})" for l in ranked[:3])
                if ranked else "[mock] Set LLM_API_KEY in ai-service/.env to enable real answers.")
        for word in text.split(" "):
            await emit("token", {"text": word + " "})
            await asyncio.sleep(0.02)
    await _step(config, "Writing the answer", "done")
    return {}


async def ask_clarifying(state: AgentState, config: RunnableConfig):
    emit = config["configurable"].get("emit")
    if emit:
        await emit("token", {"text": "Which buildings do you have class in, and what's your monthly budget?"})
    return {}


def build_graph():
    g = StateGraph(AgentState)
    for name, fn in [("parse_intent", parse_intent), ("extract_filters", extract_filters), ("search_listings", search),
                     ("enrich", enrich), ("rank", rank), ("explain", explain), ("ask_clarifying", ask_clarifying)]:
        g.add_node(name, fn)
    g.add_edge(START, "parse_intent")
    g.add_conditional_edges("parse_intent", lambda s: s["intent"], {
        "search": "extract_filters", "ask_about_listing": "enrich", "need_info": "ask_clarifying", "general": "explain"})
    g.add_edge("extract_filters", "search_listings")
    g.add_edge("search_listings", "enrich")
    g.add_edge("enrich", "rank")
    g.add_edge("rank", "explain")
    g.add_edge("explain", END)
    g.add_edge("ask_clarifying", END)
    return g.compile()


graph = build_graph()
