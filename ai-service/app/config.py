from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "claude-opus-5-5"
    node_internal_url: str = "http://localhost:4000"
    internal_key: str = "change-me"


settings = Settings()
