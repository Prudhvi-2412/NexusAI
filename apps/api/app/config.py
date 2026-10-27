"""Environment-backed application settings for the API process."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./nexusai.db"
    migration_database_url: str = ""
    rls_enforcement: bool = False
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    gemini_fallback_model: str = "gemini-3.5-flash-lite"
    gemini_embedding_model: str = "gemini-embedding-001"
    telegram_transcription_model: str = "gemini-3.5-transcribe"
    telegram_tts_model: str = "gemini-3.8-flash-lite-tts"
    cors_origins: str = "http://localhost:3000"
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/v1/integrations/google/callback"
    google_token_key: str = ""
    google_auth_allowed_email: str = ""
    session_secret: str = ""
    session_cookie_samesite: str = "lax"
    production_mode: bool = False
    web_url: str = "http://localhost:3000"
    mcp_servers_json: str = "[]"
    public_egress_proxy: str = ""
    telegram_bot_token: str = ""
    github_app_client_id: str = ""
    github_app_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/v1/integrations/github/callback"
    linkedin_client_id: str = ""
    linkedin_client_secret: str = ""
    linkedin_redirect_uri: str = "http://localhost:8000/api/v1/integrations/linkedin/callback"
    linkedin_api_version: str = "202609"
    instagram_app_id: str = ""
    instagram_app_secret: str = ""
    instagram_redirect_uri: str = "http://localhost:8000/api/v1/integrations/instagram/callback"
    instagram_api_version: str = "v26.0"


settings = Settings()
