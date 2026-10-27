"""Evaluation report & full transcript endpoint (GET /api/v1/sessions/{session_id}/report)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.db.repositories import InterviewRepository
from app.db.session import get_db_session
from app.schemas.api_schemas import SessionReportResponse, TranscriptTurnDto
from app.schemas.rubric_schemas import (
    InterviewLanguage,
    InterviewStageId,
    SeniorityLevel,
    SessionStatus,
    TranscriptSpeaker,
)
from app.services.evaluator_service import evaluator_service

router = APIRouter(prefix="/sessions", tags=["Reports"])


def _to_iso_z(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


@router.get("/{session_id}/report", response_model=SessionReportResponse)
async def get_session_report(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> SessionReportResponse:
    """Return structured evaluation report and full chronological transcript for a session."""
    repo = InterviewRepository(db)
    session = await repo.get_session_with_relations(session_id)
    if session is None:
        raise AppError(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SESSION_NOT_FOUND",
            message=f"Sesi wawancara '{session_id}' tidak ditemukan.",
            details=[{"field": "session_id", "issue": "not_found"}],
        )

    if session.status in (
        SessionStatus.READY,
        SessionStatus.IN_PROGRESS,
        SessionStatus.RECONNECTING,
    ):
        raise AppError(
            status_code=status.HTTP_409_CONFLICT,
            code="SESSION_INVALID_STATE_TRANSITION",
            message=(
                f"Laporan evaluasi belum tersedia karena sesi masih berstatus '{session.status}'."
            ),
            details=[
                {
                    "field": "status",
                    "issue": f"report_unavailable_in_{session.status}",
                }
            ],
        )

    # If session is in EVALUATING and report isn't persisted yet, generate it now
    if session.status == SessionStatus.EVALUATING and session.evaluation_report is None:
        await evaluator_service.evaluate_session(db, session_id)
        session = await repo.get_session_with_relations(session_id)
        assert session is not None

    evaluation_dto = (
        evaluator_service.to_dto(session.evaluation_report)
        if session.evaluation_report is not None
        else None
    )

    transcript_dtos = [
        TranscriptTurnDto(
            turn_seq=t.turn_seq,
            turn_id=t.turn_id,
            speaker=TranscriptSpeaker(t.speaker),
            stage_id=InterviewStageId(t.stage_id),
            text_content=t.text_content,
            was_interrupted=t.was_interrupted,
            started_at_ms=t.started_at_ms,
            ended_at_ms=t.ended_at_ms,
        )
        for t in session.transcripts
    ]

    return SessionReportResponse(
        session_id=session.id,
        status=SessionStatus(session.status),
        candidate_name=session.candidate.full_name,
        candidate_email=session.candidate.email,
        job_title=session.job_position.title,
        company_name=session.job_position.company_name,
        seniority_level=SeniorityLevel(session.job_position.seniority_level),
        language=InterviewLanguage(session.language),
        duration_minutes=session.duration_minutes,
        duration_seconds=session.duration_seconds,
        started_at=_to_iso_z(session.started_at),
        completed_at=_to_iso_z(session.completed_at),
        evaluation_report=evaluation_dto,
        transcript=transcript_dtos,
    )
