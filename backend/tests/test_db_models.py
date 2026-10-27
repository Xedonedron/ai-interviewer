"""Unit tests for SQLAlchemy 2.0 ORM models, ULID prefixes, and InterviewRepository."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import generate_prefixed_id
from app.db.repositories import InterviewRepository
from app.schemas.api_schemas import CreateSessionRequest
from app.schemas.rubric_schemas import (
    CompetencyScoreItemDto,
    ConfidenceLevel,
    EvaluationReportLLMOutput,
    HiringRecommendation,
    InterviewStageId,
    SessionStatus,
    SupportingQuoteDto,
    TranscriptSpeaker,
)
from app.services.cv_sanitizer import extract_structured_cv_summary, sanitize_cv_text


@pytest.mark.asyncio
async def test_orm_models_and_ulid_prefixes(
    db_session: AsyncSession,
    sample_create_session_payload: dict[str, Any],
) -> None:
    """Verify all 5 database tables, ULID prefixes, and JSONB persistence."""
    repo = InterviewRepository(db_session)
    req = CreateSessionRequest.model_validate(sample_create_session_payload)
    sanitized = sanitize_cv_text(req.candidate.cv_text)
    cv_summary = extract_structured_cv_summary(
        sanitized_cv_text=sanitized.sanitized_text,
        candidate_name=req.candidate.full_name,
    )

    session_id = generate_prefixed_id("ses")
    expires_at = datetime.now(timezone.utc) + timedelta(hours=72)

    session = await repo.create_full_session(
        candidate_full_name=req.candidate.full_name,
        candidate_email=str(req.candidate.email),
        cv_raw_text=sanitized.sanitized_text,
        cv_structured_summary=cv_summary,
        job_title=req.job.title,
        company_name=req.job.company_name,
        seniority_level=req.job.seniority_level,
        job_description=req.job.job_description,
        rubric_config=req.job.rubric_config,
        interviewer_persona_name=req.session_config.interviewer_persona_name,
        vrm_model_id=req.session_config.vrm_model_id,
        vrm_model_url=req.session_config.vrm_model_url,
        voice_name=req.session_config.voice_name.value,
        language=req.session_config.language.value,
        duration_minutes=req.session_config.duration_minutes,
        session_id=session_id,
        ephemeral_token_jti="jti_test_001",
        token_expires_at=expires_at,
    )

    assert session.id.startswith("ses_")
    assert len(session.id) == 30
    assert session.candidate_id.startswith("cnd_")
    assert session.job_position_id.startswith("job_")
    assert session.status == SessionStatus.READY
    assert session.current_stage == InterviewStageId.STAGE_1_INTRO

    # Append transcript turns
    t1 = await repo.append_transcript_turn(
        session_id=session.id,
        turn_seq=1,
        turn_id="turn_001",
        speaker=TranscriptSpeaker.AI,
        stage_id=InterviewStageId.STAGE_1_INTRO,
        text_content="Halo Budi, selamat datang di sesi wawancara.",
        was_interrupted=False,
        started_at_ms=1761487200000,
        ended_at_ms=1761487204000,
    )
    assert t1.id.startswith("trn_")

    llm_output = EvaluationReportLLMOutput(
        overall_weighted_score=4.25,
        hiring_recommendation=HiringRecommendation.HIRE,
        confidence_level=ConfidenceLevel.HIGH,
        executive_summary="Kandidat sangat kuat pada arsitektur backend terdistribusi dan PostgreSQL.",
        competency_scores=[
            CompetencyScoreItemDto(
                competency_id="comp_sys_design",
                competency_name="System Design & Scalability",
                weight_percentage=100,
                score=4.25,
                rationale="Menjelaskan arsitektur terdistribusi dengan sangat terstruktur.",
                supporting_quotes=[
                    SupportingQuoteDto(
                        turn_id="turn_001",
                        timestamp_sec=0,
                        speaker=TranscriptSpeaker.AI,
                        quote="Halo Budi, selamat datang di sesi wawancara.",
                    )
                ],
            )
        ],
        strengths=["Arsitektur terdistribusi"],
        areas_for_improvement=["Observability"],
        red_flags_detected=[],
        cv_verification_notes="Konsisten dengan klaim CV kandidat.",
    )

    report = await repo.save_evaluation_report(
        session=session,
        llm_output=llm_output,
        evaluator_model="gemini-2.5-pro",
    )
    assert report.id.startswith("rep_")

    loaded = await repo.get_session_with_relations(session.id)
    assert loaded is not None
    assert loaded.status == SessionStatus.COMPLETED
    assert loaded.evaluation_report is not None
    assert float(loaded.evaluation_report.overall_weighted_score) == 4.25
