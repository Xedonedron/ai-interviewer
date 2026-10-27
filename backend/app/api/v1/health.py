"""GET /api/v1/health endpoint."""

from __future__ import annotations

import time
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.session import check_db_connection, get_db_session
from app.schemas.api_schemas import HealthCheckResponse
from app.services.auth_token import active_connection_registry

router = APIRouter(tags=["Health"])


@router.get("/health", response_model=HealthCheckResponse)
async def get_health(
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> HealthCheckResponse:
    """Return service health, DB connectivity, Gemini config status, and active WS count."""
    settings = get_settings()
    db_ok = await check_db_connection(db)
    uptime_sec = max(0, int(time.monotonic() - settings.started_at_monotonic))
    status_val = "healthy" if db_ok else "degraded"
    return HealthCheckResponse(
        status=status_val,
        version=settings.app_version,
        database_connected=db_ok,
        gemini_configured=settings.is_gemini_configured,
        active_ws_sessions=active_connection_registry.active_count,
        uptime_sec=uptime_sec,
    )
