"""Session lifecycle REST API endpoints (/api/v1/sessions)."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import AppError
from app.db.base import generate_prefixed_id
from app.db.repositories import InterviewRepository
from app.db.session import get_db_session
from app.schemas.api_schemas import (
    CandidateSessionMetadataResponse,
    CompleteSessionRequest,
    CompleteSessionResponse,
    CreateSessionRequest,
    CreateSessionResponse,
    SessionListItemDto,
    SessionListResponse,
)
from app.schemas.rubric_schemas import (
    CompletionReason,
    GeminiVoiceName,
    InterviewLanguage,
    InterviewStageId,
    SeniorityLevel,
    SessionStatus,
)
from app.services.auth_token import (
    TokenVerificationError,
    create_ephemeral_session_token,
    verify_ephemeral_session_token,
)
from app.services.cv_sanitizer import extract_structured_cv_summary, sanitize_cv_text
from app.services.evaluator_service import evaluator_service
from app.services.prompt_builder import compute_interview_stages

router = APIRouter(prefix="/sessions", tags=["Sessions"])


def _to_iso_z(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _extract_bearer_token(
    authorization: str | None,
    query_token: str | None,
) -> str | None:
    """Extract bearer token from Authorization header or query parameter."""
    if authorization:
        parts = authorization.strip().split(" ", 1)
        if len(parts) == 2 and parts[0].lower() == "bearer":
            return parts[1].strip()
        return authorization.strip()
    if query_token:
        return query_token.strip()
    return None


def _verify_optional_candidate_token(
    session_id: str,
    authorization: str | None,
    query_token: str | None,
) -> None:
    """Verify candidate token when supplied (401 on invalid/expired, 403 on session mismatch)."""
    settings = get_settings()
    token = _extract_bearer_token(authorization, query_token)
    if not token:
        return
    if settings.recruiter_api_key and token == settings.recruiter_api_key:
        return
    try:
        verify_ephemeral_session_token(
            token=token,
            expected_session_id=session_id,
        )
    except TokenVerificationError as exc:
        raise AppError(
            status_code=exc.status_code,
            code=exc.code,
            message=exc.message,
            details=[{"field": "token", "issue": exc.code.lower()}],
        ) from exc


@router.post(
    "",
    response_model=CreateSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(
    payload: CreateSessionRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
) -> CreateSessionResponse:
    """Create JobPosition, Candidate (with sanitized CV), InterviewSession, and Ephemeral JWT."""
    repo = InterviewRepository(db)

    sanitized_result = sanitize_cv_text(payload.candidate.cv_text)
    cv_summary = extract_structured_cv_summary(
        sanitized_cv_text=sanitized_result.sanitized_text,
        candidate_name=payload.candidate.full_name,
        provided_summary=payload.candidate.cv_structured_summary,
    )

    session_id = generate_prefixed_id("ses")
    issued_token = create_ephemeral_session_token(
        session_id=session_id,
        ttl_hours=payload.session_config.token_ttl_hours,
    )

    interview_session = await repo.create_full_session(
        candidate_full_name=payload.candidate.full_name,
        candidate_email=str(payload.candidate.email),
        cv_raw_text=sanitized_result.sanitized_text,
        cv_structured_summary=cv_summary,
        job_title=payload.job.title,
        company_name=payload.job.company_name,
        seniority_level=payload.job.seniority_level,
        job_description=payload.job.job_description,
        rubric_config=payload.job.rubric_config,
        interviewer_persona_name=payload.session_config.interviewer_persona_name,
        vrm_model_id=payload.session_config.vrm_model_id,
        vrm_model_url=payload.session_config.vrm_model_url,
        voice_name=payload.session_config.voice_name.value,
        language=payload.session_config.language.value,
        duration_minutes=payload.session_config.duration_minutes,
        session_id=session_id,
        ephemeral_token_jti=issued_token.jti,
        token_expires_at=issued_token.expires_at,
    )

    host = request.headers.get("host") or "localhost:8000"
    ws_scheme = "wss" if request.url.scheme == "https" else "ws"
    ws_endpoint_url = f"{ws_scheme}://{host}/ws/interview/{interview_session.id}"
    candidate_join_url = (
        f"/interview/{interview_session.id}/lobby?token={issued_token.token}"
    )

    return CreateSessionResponse(
        session_id=interview_session.id,
        job_position_id=interview_session.job_position_id,
        candidate_id=interview_session.candidate_id,
        status=SessionStatus(interview_session.status),
        current_stage=InterviewStageId(interview_session.current_stage),
        candidate_join_url=candidate_join_url,
        ws_endpoint_url=ws_endpoint_url,
        ephemeral_token=issued_token.token,
        token_expires_at=_to_iso_z(issued_token.expires_at) or "",
        created_at=_to_iso_z(interview_session.created_at) or "",
    )


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    db: Annotated[AsyncSession, Depends(get_db_session)],
    status_filter: Annotated[SessionStatus | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> SessionListResponse:
    """List interview sessions for recruiter dashboard with pagination."""
    repo = InterviewRepository(db)
    sessions, total = await repo.list_sessions(
        status=status_filter,
        limit=limit,
        offset=offset,
    )

    items: list[SessionListItemDto] = []
    for s in sessions:
        overall_score = (
            float(s.evaluation_report.overall_weighted_score)
            if s.evaluation_report is not None
            else None
        )
        hiring_rec = (
            HiringRecommendation_or_none(s.evaluation_report.hiring_recommendation)
            if s.evaluation_report is not None
            else None
        )
        items.append(
            SessionListItemDto(
                session_id=s.id,
                status=SessionStatus(s.status),
                current_stage=InterviewStageId(s.current_stage),
                candidate_name=s.candidate.full_name,
                candidate_email=s.candidate.email,
                job_title=s.job_position.title,
                company_name=s.job_position.company_name,
                seniority_level=SeniorityLevel(s.job_position.seniority_level),
                language=InterviewLanguage(s.language),
                duration_minutes=s.duration_minutes,
                duration_seconds=s.duration_seconds,
                overall_weighted_score=overall_score,
                hiring_recommendation=hiring_rec,
                started_at=_to_iso_z(s.started_at),
                completed_at=_to_iso_z(s.completed_at),
                created_at=_to_iso_z(s.created_at) or "",
            )
        )

    return SessionListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


def HiringRecommendation_or_none(val: object) -> object:
    from app.schemas.rubric_schemas import HiringRecommendation

    if val is None:
        return None
    return HiringRecommendation(str(val))


@router.get("/{session_id}", response_model=CandidateSessionMetadataResponse)
async def get_session_metadata(
    session_id: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Query()] = None,
) -> CandidateSessionMetadataResponse:
    """Fetch candidate-safe session metadata (never exposes rubric_config or cv_raw_text)."""
    _verify_optional_candidate_token(session_id, authorization, token)

    repo = InterviewRepository(db)
    session = await repo.get_session_with_relations(session_id)
    if session is None:
        raise AppError(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SESSION_NOT_FOUND",
            message=f"Sesi wawancara '{session_id}' tidak ditemukan.",
            details=[{"field": "session_id", "issue": "not_found"}],
        )

    stages = compute_interview_stages(session.duration_minutes)
    remaining_seconds = max(0, session.duration_minutes * 60 - session.duration_seconds)
    host = request.headers.get("host") or "localhost:8000"
    ws_scheme = "wss" if request.url.scheme == "https" else "ws"
    ws_endpoint_url = f"{ws_scheme}://{host}/ws/interview/{session.id}"

    return CandidateSessionMetadataResponse(
        session_id=session.id,
        status=SessionStatus(session.status),
        current_stage=InterviewStageId(session.current_stage),
        candidate_name=session.candidate.full_name,
        job_title=session.job_position.title,
        company_name=session.job_position.company_name,
        seniority_level=SeniorityLevel(session.job_position.seniority_level),
        interviewer_persona_name=session.interviewer_persona_name,
        vrm_model_id=session.vrm_model_id,
        vrm_model_url=session.vrm_model_url,
        voice_name=GeminiVoiceName(session.voice_name),
        language=InterviewLanguage(session.language),
        duration_minutes=session.duration_minutes,
        remaining_seconds=remaining_seconds,
        last_turn_seq=session.last_turn_seq,
        ws_endpoint_url=ws_endpoint_url,
        stages=stages,
    )


@router.post(
    "/{session_id}/complete",
    response_model=CompleteSessionResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def complete_session(
    session_id: str,
    db: Annotated[AsyncSession, Depends(get_db_session)],
    payload: CompleteSessionRequest | None = None,
    authorization: Annotated[str | None, Header()] = None,
    token: Annotated[str | None, Query()] = None,
) -> CompleteSessionResponse:
    """Explicitly end an active interview session and trigger rubric evaluation."""
    _verify_optional_candidate_token(session_id, authorization, token)

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
        SessionStatus.COMPLETED,
        SessionStatus.EXPIRED,
        SessionStatus.FAILED,
    ):
        raise AppError(
            status_code=status.HTTP_409_CONFLICT,
            code="SESSION_INVALID_STATE_TRANSITION",
            message=(
                f"Sesi wawancara '{session_id}' sudah berada pada status "
                f"'{session.status}' dan tidak dapat diselesaikan ulang."
            ),
            details=[
                {
                    "field": "status",
                    "issue": f"cannot_transition_from_{session.status}",
                }
            ],
        )

    req_body = payload or CompleteSessionRequest()
    updated_session = await repo.mark_session_evaluating(
        session,
        reason=req_body.reason.value,
        client_duration_seconds=req_body.client_duration_seconds,
    )
    completed_at_iso = _to_iso_z(updated_session.completed_at) or ""

    # Execute rubric evaluation immediately so subsequent GET /report calls succeed deterministically
    await evaluator_service.evaluate_session(db, session_id)

    return CompleteSessionResponse(
        session_id=session_id,
        status=SessionStatus.EVALUATING,
        completion_reason=CompletionReason(req_body.reason),
        report_eta_seconds=12,
        completed_at=completed_at_iso,
    )
