"""FastAPI WebSocket endpoint (/ws/interview/{session_id}) with JWT & Close Code enforcement."""

from __future__ import annotations

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import InterviewRepository
from app.db.session import get_db_session
from app.schemas.rubric_schemas import SessionStatus
from app.schemas.ws_schemas import WSCloseCodes
from app.services.auth_token import (
    TokenVerificationError,
    active_connection_registry,
    verify_ephemeral_session_token,
)
from app.ws.session_orchestrator import InterviewSessionOrchestrator

logger = logging.getLogger(__name__)

router = APIRouter(tags=["WebSocket"])


@router.websocket("/ws/interview/{session_id}")
async def interview_websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    token: Annotated[str | None, Query()] = None,
) -> None:
    """Full-duplex WebSocket relay endpoint with strict Ephemeral JWT and single-connection lock."""
    await websocket.accept()

    # 1. Verify Ephemeral JWT (4001 on missing, invalid, expired, or session_id mismatch)
    if not token:
        await websocket.close(
            code=WSCloseCodes.AUTH_INVALID_OR_EXPIRED,
            reason="AUTH_INVALID_OR_EXPIRED",
        )
        return

    try:
        claims = verify_ephemeral_session_token(
            token=token,
            expected_session_id=session_id,
        )
    except TokenVerificationError:
        await websocket.close(
            code=WSCloseCodes.AUTH_INVALID_OR_EXPIRED,
            reason="AUTH_INVALID_OR_EXPIRED",
        )
        return

    # 2. Load session from database and verify JTI & session status
    repo = InterviewRepository(db)
    session = await repo.get_session_with_relations(session_id)
    if session is None or session.ephemeral_token_jti != claims.jti:
        await websocket.close(
            code=WSCloseCodes.AUTH_INVALID_OR_EXPIRED,
            reason="AUTH_INVALID_OR_EXPIRED",
        )
        return

    # 3. Reject if session is already completed/evaluating/expired/failed (4003)
    if session.status in (
        SessionStatus.COMPLETED,
        SessionStatus.EVALUATING,
        SessionStatus.EXPIRED,
        SessionStatus.FAILED,
    ):
        await websocket.close(
            code=WSCloseCodes.SESSION_ALREADY_COMPLETED,
            reason="SESSION_ALREADY_COMPLETED",
        )
        return

    # 4. Enforce single active WebSocket connection per session_id (4002)
    connection_id = uuid.uuid4().hex
    acquired = await active_connection_registry.try_acquire(session_id, connection_id)
    if not acquired:
        await websocket.close(
            code=WSCloseCodes.SESSION_ALREADY_ACTIVE,
            reason="SESSION_ALREADY_ACTIVE",
        )
        return

    try:
        orchestrator = InterviewSessionOrchestrator(
            websocket=websocket,
            db=db,
            session=session,
        )
        await orchestrator.run()
    except Exception as exc:
        logger.exception("Unhandled error in WebSocket session %s: %s", session_id, exc)
        try:
            await websocket.close(
                code=WSCloseCodes.UPSTREAM_GEMINI_RESET,
                reason="UPSTREAM_GEMINI_RESET",
            )
        except Exception:
            pass
    finally:
        await active_connection_registry.release(session_id, connection_id)
