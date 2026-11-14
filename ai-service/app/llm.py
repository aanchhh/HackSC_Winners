"""One LLM client, used everywhere. Returns None in mock mode (no LLM_API_KEY)."""
from functools import lru_cache

from langchain_anthropic import ChatAnthropic

from app.config import settings


@lru_cache
def get_llm() -> ChatAnthropic | None:
    if not settings.llm_api_key:
        return None
    return ChatAnthropic(model=settings.llm_model, api_key=settings.llm_api_key, max_tokens=16000)
