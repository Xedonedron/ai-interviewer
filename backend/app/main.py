"""FastAPI application entrypoint for AI Interviewer Platform Backend."""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import health, reports, sessions
from app.config import get_settings
from app.core.errors import register_exception_handlers
from app.db.session import init_db
from app.ws import interview_ws


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize database tables on startup."""
    await init_db()
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next) -> Response:  # type: ignore[no-untyped-def]
        request_id = request.headers.get("X-Request-ID") or f"req_{uuid.uuid4().hex[:12]}"
        request.state.request_id = request_id
        response: Response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    register_exception_handlers(app)

    # Mount REST API v1 routers
    app.include_router(health.router, prefix="/api/v1")
    app.include_router(sessions.router, prefix="/api/v1")
    app.include_router(reports.router, prefix="/api/v1")

    # Mount WebSocket relay router
    app.include_router(interview_ws.router)

    return app


app = create_app()
