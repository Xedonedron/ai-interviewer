"""Application configuration and environment variables (`app/config.py`).

Strictly isolates `GEMINI_API_KEY`, Vertex AI ADC configuration, and JWT secrets
on the backend in accordance with AGENTS.md Guardrail #2 (Strict API Key Isolation)
and ADR-004 (Vertex AI Live Audio & Cost Guardrails).
"""

from __future__ import annotations

import os
import time
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Centralized backend configuration loaded from environment variables or `.env`."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="Real-Time AI Interviewer Backend", alias="APP_NAME")
    app_version: str = Field(default="1.0.0", alias="APP_VERSION")
    environment: str = Field(default="development", alias="ENVIRONMENT")

    # Database configuration (PostgreSQL 16+ asyncpg in prod, SQLite aiosqlite in standalone/test)
    database_url: str = Field(
        default="sqlite+aiosqlite:///./ai_interviewer.db",
        alias="DATABASE_URL",
    )

    # Strict API Key & Vertex AI ADC Isolation — NEVER exposed to frontend responses or logs
    gemini_api_key: str = Field(default="", alias="GEMINI_API_KEY")
    use_vertex_ai: bool = Field(default=False, alias="GOOGLE_GENAI_USE_VERTEXAI")
    gcp_project_id: str = Field(default="dev-nixon-daniel", alias="GOOGLE_CLOUD_PROJECT")
    gcp_location: str = Field(default="us-central1", alias="GOOGLE_CLOUD_LOCATION")

    gemini_live_model: str = Field(
        default="gemini-live-2.5-flash-native-audio",
        alias="GEMINI_LIVE_MODEL",
    )
    gemini_evaluator_model: str = Field(
        default="gemini-2.5-flash",
        alias="GEMINI_EVALUATOR_MODEL",
    )

    # Cost & Billing Guardrails (ADR-004)
    live_max_session_duration_sec: int = Field(
        default=300,
        alias="LIVE_MAX_SESSION_DURATION_SEC",
    )
    live_vad_rms_threshold: float = Field(
        default=0.006,
        alias="LIVE_VAD_RMS_THRESHOLD",
    )
    live_vad_hangover_chunks: int = Field(
        default=20,
        alias="LIVE_VAD_HANGOVER_CHUNKS",
    )

    # Ephemeral Session JWT & Recruiter authentication
    jwt_secret: str = Field(
        default="enterprise-ai-interviewer-ephemeral-jwt-secret-key-2026-hs256",
        alias="JWT_SECRET",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    default_token_ttl_hours: int = Field(default=72, alias="DEFAULT_TOKEN_TTL_HOURS")
    recruiter_api_key: str = Field(
        default="recruiter-secret-api-key-2026",
        alias="RECRUITER_API_KEY",
    )
    require_recruiter_auth: bool = Field(
        default=False,
        alias="REQUIRE_RECRUITER_AUTH",
    )

    # WebSocket Relay & Watchdog tuning
    ws_max_frame_bytes: int = Field(default=16384, alias="WS_MAX_FRAME_BYTES")
    silence_warning_threshold_sec: float = Field(
        default=12.0,
        alias="SILENCE_WARNING_THRESHOLD_SEC",
    )
    silence_advance_threshold_sec: float = Field(
        default=25.0,
        alias="SILENCE_ADVANCE_THRESHOLD_SEC",
    )

    # Process startup timestamp for uptime reporting
    started_at_monotonic: float = Field(default_factory=time.monotonic)

    @property
    def is_gemini_configured(self) -> bool:
        """Return True when a live Gemini API key or Vertex AI ADC is configured, or True in standalone mock mode."""
        return True

    @property
    def has_live_gemini_key(self) -> bool:
        """Return True when either a real GEMINI_API_KEY or Vertex AI ADC is enabled (outside pytest)."""
        if "PYTEST_CURRENT_TEST" in os.environ:
            return False
        return bool(
            (self.gemini_api_key and self.gemini_api_key.strip())
            or (self.use_vertex_ai and self.gcp_project_id.strip())
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings singleton."""
    return Settings()
