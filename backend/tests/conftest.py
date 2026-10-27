"""Shared pytest fixtures for database, FastAPI app, and sample payloads."""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.db.base import Base
from app.db.session import get_db_session
from app.main import create_app
from app.services.auth_token import active_connection_registry


@pytest_asyncio.fixture
async def test_db_engine(tmp_path: Path) -> AsyncIterator[AsyncEngine]:
    """Create an isolated SQLite async database per test function."""
    db_file = tmp_path / "test_interviewer.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_file}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session_factory(
    test_db_engine: AsyncEngine,
) -> async_sessionmaker[AsyncSession]:
    """Return an async_sessionmaker bound to the isolated test DB engine."""
    return async_sessionmaker(
        bind=test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )


@pytest_asyncio.fixture
async def db_session(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    """Yield a single AsyncSession for direct repository/ORM tests."""
    async with db_session_factory() as session:
        yield session


@pytest_asyncio.fixture
async def app(
    db_session_factory: async_sessionmaker[AsyncSession],
) -> Any:
    """Create a FastAPI app with overridden get_db_session dependency."""
    active_connection_registry.clear_all()
    fastapi_app = create_app()

    async def _override_get_db() -> AsyncIterator[AsyncSession]:
        async with db_session_factory() as session:
            yield session

    fastapi_app.dependency_overrides[get_db_session] = _override_get_db
    return fastapi_app


@pytest_asyncio.fixture
async def async_client(app: Any) -> AsyncIterator[AsyncClient]:
    """Yield an httpx.AsyncClient connected to the FastAPI ASGI app."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client


@pytest.fixture
def sample_create_session_payload() -> dict[str, Any]:
    """Return a valid CreateSessionRequest dictionary matching rest-api-contract.md."""
    return {
        "candidate": {
            "full_name": "Budi Santoso",
            "email": "budi.santoso@example.com",
            "cv_text": (
                "Senior Software Engineer di PT FinTech Nusantara (6 tahun pengalaman). "
                "Memimpin migrasi monolith ke microservices Python FastAPI & Go. "
                "Menangani 15.000 RPS pada sistem pembayaran QRIS dan optimasi PostgreSQL."
            ),
        },
        "job": {
            "title": "Senior Backend Engineer",
            "company_name": "Enterprise AI Corp",
            "seniority_level": "SENIOR",
            "job_description": (
                "Bertanggung jawab merancang dan mengimplementasikan layanan terdistribusi "
                "berkinerja tinggi menggunakan Python, FastAPI, PostgreSQL, dan Redis."
            ),
            "rubric_config": {
                "version": "1.0",
                "passing_score_threshold": 3.5,
                "criteria": [
                    {
                        "competency_id": "comp_sys_design",
                        "competency_name": "System Design & Scalability",
                        "weight_percentage": 40,
                        "probing_guidance": "Gali pengalaman merancang arsitektur fault-tolerant dan scalable.",
                        "positive_signals": [
                            "Menjelaskan trade-off konsistensi vs latensi",
                            "Menggunakan metrik kuantitatif RPS/p99",
                        ],
                        "red_flag_signals": [
                            "Tidak memahami bottleneck database",
                        ],
                    },
                    {
                        "competency_id": "comp_backend_eng",
                        "competency_name": "Backend Engineering & Database",
                        "weight_percentage": 35,
                        "probing_guidance": "Uji penguasaan concurrency asyncio, query optimization, dan API design.",
                        "positive_signals": [
                            "Paham event loop non-blocking I/O",
                            "Menguasai indexing dan connection pooling PostgreSQL",
                        ],
                        "red_flag_signals": [],
                    },
                    {
                        "competency_id": "comp_comm_problem",
                        "competency_name": "Problem Solving & Communication",
                        "weight_percentage": 25,
                        "probing_guidance": "Evaluasi kejelasan komunikasi teknis dengan metode STAR.",
                        "positive_signals": [
                            "Menjawab terstruktur dengan konteks Situation, Task, Action, Result",
                        ],
                        "red_flag_signals": [],
                    },
                ],
            },
        },
        "session_config": {
            "interviewer_persona_name": "Alya",
            "vrm_model_id": "alya_v1",
            "vrm_model_url": "/models/alya.vrm",
            "voice_name": "Aoede",
            "language": "id-ID",
            "duration_minutes": 30,
            "token_ttl_hours": 72,
        },
    }
