"""One LLM client, used everywhere. Returns None in mock mode (no LLM_API_KEY).

Pick the provider with LLM_PROVIDER in ai-service/.env:
  google     → free tier via Google AI Studio (aistudio.google.com/apikey). Default model gemini-2.5-flash.
  anthropic  → Claude (paid API, console.anthropic.com). Default model claude-opus-5-5.
  groq       → free tier (console.groq.com). Set LLM_MODEL to a model from console.groq.com/docs/models.
All three support structured output (filter extraction) and streaming (the chat answer)."""
from functools import lru_cache

from app.config import settings

DEFAULT_MODELS = {"google": "gemini-2.5-flash", "anthropic": "claude-opus-5-5", "groq": "llama-3.3-70b-versatile"}


def provider() -> str:
    return (settings.llm_provider or "google").lower()


def model_name() -> str:
    return settings.llm_model or DEFAULT_MODELS.get(provider(), "")


@lru_cache
def get_llm():
    if not settings.llm_api_key:
        return None
    p, m = provider(), model_name()
    if p == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=m, google_api_key=settings.llm_api_key, temperature=0.2)
    if p == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=m, api_key=settings.llm_api_key, max_tokens=16000)
    if p == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model=m, api_key=settings.llm_api_key, temperature=0.2)
    raise ValueError(f"Unknown LLM_PROVIDER {p!r} (use google, anthropic or groq)")
