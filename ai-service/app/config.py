from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "claude-opus-5-5"
    node_internal_url: str = "http://localhost:4000"
    internal_key: str = "change-me"

    # Listings pipeline
    data_dir: str = str(Path(__file__).resolve().parents[2] / "data")
    index_dir: str = str(Path(__file__).resolve().parents[1] / ".index")
    refresh_minutes: int = 60          # 0 = only refresh on demand
    rentcast_api_key: str = ""
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"   # "" disables reranking


settings = Settings()
