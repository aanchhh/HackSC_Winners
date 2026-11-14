from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages

from app.schemas import Filters, Intent, Profile


class AgentState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    profile: Profile
    intent: Intent
    filters: Filters
    candidates: list[dict[str, Any]]
    enriched: list[dict[str, Any]]
    ranked: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    answer: str
