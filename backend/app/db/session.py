"""SQLAlchemy 2.0 AsyncEngine and AsyncSession management (`app/db/session.py`)."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings
from app.db.base import Base

settings = get_settings()

engine: AsyncEngine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def init_db(target_engine: AsyncEngine | None = None) -> None:
    """Create all tables if they do not yet exist."""
    active_engine = target_engine or engine
    async with active_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def check_db_connection(
    target: AsyncEngine | AsyncSession | None = None,
) -> bool:
    """Execute a lightweight `SELECT 1` health check against the database."""
    try:
        if isinstance(target, AsyncSession):
            await target.execute(text("SELECT 1"))
            return True
        active_engine = target or engine
        async with active_engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding an `AsyncSession` per request."""
    async with AsyncSessionLocal() as session:
        yield session
