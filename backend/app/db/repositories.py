"""Async Database Repositories (`app/db/repositories.py`).

Encapsulates all non-blocking SQLAlchemy 2.0 queries for `JobPosition`, `Candidate`,
`InterviewSession`, `InterviewTranscript`, and `EvaluationReport`.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.base import generate_prefixed_id, utc_now
from app.db.models import (
    Candidate,
    EvaluationReport,
    InterviewSession,
    InterviewTranscript,
    JobPosition,
)
from app.schemas.rubric_schemas import (
    ConfidenceLevel,
    CvStructuredSummaryDto,
    EvaluationReportLLMOutput,
    HiringRecommendation,
    InterviewStageId,
    RubricConfigDto,
    SeniorityLevel,
    SessionStatus,
    TranscriptSpeaker,
)


class InterviewRepository:
    """Async repository for managing interview lifecycle entities."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_full_session(
        self,
        *,
        candidate_full_name: str,
        candidate_email: str,
        cv_raw_text: str,
        cv_structured_summary: CvStructuredSummaryDto,
        job_title: str,
        company_name: str,
        seniority_level: SeniorityLevel,
        job_description: str,
        rubric_config: RubricConfigDto,
        interviewer_persona_name: str,
        vrm_model_id: str,
        vrm_model_url: str,
        voice_name: str,
        language: str,
        duration_minutes: int,
        session_id: str,
        ephemeral_token_jti: str,
        token_expires_at: datetime,
    ) -> InterviewSession:
        """Create `JobPosition`, `Candidate`, and `InterviewSession` atomically."""
        job_pos = JobPosition(
            id=generate_prefixed_id("job"),
            title=job_title,
            company_name=company_name,
            seniority_level=seniority_level,
            job_description=job_description,
            rubric_config=rubric_config.model_dump(mode="json"),
            default_duration_minutes=duration_minutes,
            is_active=True,
        )
        candidate = Candidate(
            id=generate_prefixed_id("cnd"),
            full_name=candidate_full_name,
            email=candidate_email,
            cv_raw_text=cv_raw_text,
            cv_structured_summary=cv_structured_summary.model_dump(mode="json"),
        )
        interview_session = InterviewSession(
            id=session_id,
            job_position_id=job_pos.id,
            candidate_id=candidate.id,
            status=SessionStatus.READY,
            current_stage=InterviewStageId.STAGE_1_INTRO,
            interviewer_persona_name=interviewer_persona_name,
            vrm_model_id=vrm_model_id,
            vrm_model_url=vrm_model_url,
            voice_name=voice_name,
            language=language,
            duration_minutes=duration_minutes,
            duration_seconds=0,
            last_turn_seq=0,
            ephemeral_token_jti=ephemeral_token_jti,
            token_expires_at=token_expires_at,
        )

        self.db.add(job_pos)
        self.db.add(candidate)
        self.db.add(interview_session)
        await self.db.commit()

        return await self.get_session_with_relations(session_id)  # type: ignore[return-value]

    async def get_session_with_relations(
        self,
        session_id: str,
    ) -> InterviewSession | None:
        """Fetch an `InterviewSession` with eager-loaded `job_position`, `candidate`, `transcripts`, and `evaluation_report`."""
        stmt = (
            select(InterviewSession)
            .where(InterviewSession.id == session_id)
            .options(
                selectinload(InterviewSession.job_position),
                selectinload(InterviewSession.candidate),
                selectinload(InterviewSession.transcripts),
                selectinload(InterviewSession.evaluation_report),
            )
            .execution_options(populate_existing=True)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_sessions(
        self,
        *,
        status: SessionStatus | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[InterviewSession], int]:
        """List interview sessions ordered by `created_at DESC` with total count."""
        base_stmt = select(InterviewSession).options(
            selectinload(InterviewSession.job_position),
            selectinload(InterviewSession.candidate),
            selectinload(InterviewSession.evaluation_report),
        )
        count_stmt = select(func.count(InterviewSession.id))

        if status is not None:
            base_stmt = base_stmt.where(InterviewSession.status == status)
            count_stmt = count_stmt.where(InterviewSession.status == status)

        total_res = await self.db.execute(count_stmt)
        total = int(total_res.scalar_one() or 0)

        items_stmt = (
            base_stmt.order_by(InterviewSession.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        items_res = await self.db.execute(items_stmt)
        items = list(items_res.scalars().all())
        return items, total

    async def mark_session_in_progress(
        self,
        session: InterviewSession,
    ) -> InterviewSession:
        """Transition session to `IN_PROGRESS` and set `started_at` if not yet set."""
        session.status = SessionStatus.IN_PROGRESS
        if session.started_at is None:
            session.started_at = utc_now()
        session.updated_at = utc_now()
        await self.db.commit()
        await self.db.refresh(session)
        return session

    async def update_session_stage(
        self,
        session_id: str,
        new_stage: InterviewStageId,
        elapsed_seconds: int | None = None,
    ) -> InterviewSession | None:
        """Persist a stage transition on `interview_sessions`."""
        session = await self.get_session_with_relations(session_id)
        if session is None:
            return None
        session.current_stage = new_stage
        if elapsed_seconds is not None and elapsed_seconds >= 0:
            session.duration_seconds = elapsed_seconds
        session.updated_at = utc_now()
        await self.db.commit()
        return session

    async def append_transcript_turn(
        self,
        *,
        session_id: str,
        turn_seq: int,
        turn_id: str,
        speaker: TranscriptSpeaker,
        stage_id: InterviewStageId,
        text_content: str,
        was_interrupted: bool = False,
        started_at_ms: int,
        ended_at_ms: int,
    ) -> InterviewTranscript:
        """Insert or update a finalized transcript turn and update `session.last_turn_seq`."""
        existing_stmt = select(InterviewTranscript).where(
            InterviewTranscript.session_id == session_id,
            InterviewTranscript.turn_seq == turn_seq,
        )
        existing_res = await self.db.execute(existing_stmt)
        transcript = existing_res.scalars().first()

        safe_end_ms = max(started_at_ms, ended_at_ms)

        if transcript is None:
            transcript = InterviewTranscript(
                id=generate_prefixed_id("trn"),
                session_id=session_id,
                turn_seq=turn_seq,
                turn_id=turn_id,
                speaker=speaker,
                stage_id=stage_id,
                text_content=text_content,
                was_interrupted=was_interrupted,
                started_at_ms=started_at_ms,
                ended_at_ms=safe_end_ms,
            )
            self.db.add(transcript)
        else:
            transcript.text_content = text_content
            transcript.was_interrupted = was_interrupted
            transcript.ended_at_ms = safe_end_ms

        session_stmt = select(InterviewSession).where(InterviewSession.id == session_id)
        session_res = await self.db.execute(session_stmt)
        session = session_res.scalars().first()
        if session is not None and turn_seq > session.last_turn_seq:
            session.last_turn_seq = turn_seq
            session.updated_at = utc_now()

        await self.db.commit()
        return transcript

    async def mark_turn_interrupted(
        self,
        session_id: str,
        turn_id: str,
    ) -> InterviewTranscript | None:
        """Mark an existing transcript turn as `was_interrupted = True` on barge-in."""
        stmt = select(InterviewTranscript).where(
            InterviewTranscript.session_id == session_id,
            InterviewTranscript.turn_id == turn_id,
        )
        res = await self.db.execute(stmt)
        transcript = res.scalars().first()
        if transcript is not None:
            transcript.was_interrupted = True
            await self.db.commit()
        return transcript

    async def get_recent_transcripts(
        self,
        session_id: str,
        limit: int = 10,
    ) -> list[InterviewTranscript]:
        """Fetch up to `limit` most recent turns in chronological order for Session Resumption."""
        stmt = (
            select(InterviewTranscript)
            .where(InterviewTranscript.session_id == session_id)
            .order_by(InterviewTranscript.turn_seq.desc())
            .limit(limit)
        )
        res = await self.db.execute(stmt)
        rows = list(res.scalars().all())
        rows.reverse()
        return rows

    async def mark_session_evaluating(
        self,
        session: InterviewSession,
        *,
        reason: str,
        client_duration_seconds: int | None = None,
    ) -> InterviewSession:
        """Transition session to `EVALUATING` when completed."""
        now = utc_now()
        session.status = SessionStatus.EVALUATING
        session.completion_reason = reason
        if session.completed_at is None:
            session.completed_at = now
        if client_duration_seconds is not None and client_duration_seconds >= 0:
            session.duration_seconds = client_duration_seconds
        elif session.started_at is not None and session.duration_seconds == 0:
            started = session.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=now.tzinfo)
            elapsed = int(max(1.0, (now - started).total_seconds()))
            session.duration_seconds = elapsed
        session.updated_at = now
        await self.db.commit()
        return session

    async def save_evaluation_report(
        self,
        *,
        session: InterviewSession,
        llm_output: EvaluationReportLLMOutput,
        evaluator_model: str,
    ) -> EvaluationReport:
        """Persist `EvaluationReport` and mark `InterviewSession` as `COMPLETED`."""
        now = utc_now()
        existing_stmt = select(EvaluationReport).where(
            EvaluationReport.session_id == session.id
        )
        existing_res = await self.db.execute(existing_stmt)
        report = existing_res.scalars().first()

        comp_scores_json: list[dict[str, Any]] = [
            item.model_dump(mode="json") for item in llm_output.competency_scores
        ]
        weighted_score = Decimal(f"{llm_output.overall_weighted_score:.2f}")

        if report is None:
            report = EvaluationReport(
                id=generate_prefixed_id("rep"),
                session_id=session.id,
                overall_weighted_score=weighted_score,
                hiring_recommendation=HiringRecommendation(
                    llm_output.hiring_recommendation
                ),
                confidence_level=ConfidenceLevel(llm_output.confidence_level),
                executive_summary=llm_output.executive_summary,
                competency_scores=comp_scores_json,
                strengths=list(llm_output.strengths),
                areas_for_improvement=list(llm_output.areas_for_improvement),
                red_flags_detected=list(llm_output.red_flags_detected),
                cv_verification_notes=llm_output.cv_verification_notes,
                evaluator_model=evaluator_model,
                generated_at=now,
            )
            self.db.add(report)
        else:
            report.overall_weighted_score = weighted_score
            report.hiring_recommendation = HiringRecommendation(
                llm_output.hiring_recommendation
            )
            report.confidence_level = ConfidenceLevel(llm_output.confidence_level)
            report.executive_summary = llm_output.executive_summary
            report.competency_scores = comp_scores_json
            report.strengths = list(llm_output.strengths)
            report.areas_for_improvement = list(llm_output.areas_for_improvement)
            report.red_flags_detected = list(llm_output.red_flags_detected)
            report.cv_verification_notes = llm_output.cv_verification_notes
            report.evaluator_model = evaluator_model
            report.generated_at = now

        session.status = SessionStatus.COMPLETED
        session.current_stage = InterviewStageId.STAGE_5_CLOSING
        if session.completed_at is None:
            session.completed_at = now
        session.updated_at = now

        await self.db.commit()
        await self.db.refresh(report)
        return report
