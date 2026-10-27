"""SQLAlchemy 2.0 ORM Models (`app/db/models.py`).

Implements all 5 tables, 6 ENUM types, constraints, and indexes from
Contract 4 (`docs/contracts/database-schema.md`).
Compatible with both PostgreSQL 16 (`JSONB` / native `ENUM`) and SQLite (`JSON` for tests).
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, generate_prefixed_id, utc_now
from app.schemas.rubric_schemas import (
    ConfidenceLevel,
    HiringRecommendation,
    InterviewStageId,
    SeniorityLevel,
    SessionStatus,
    TranscriptSpeaker,
)

# Cross-dialect JSONB type: uses native PostgreSQL JSONB when running on Postgres,
# and falls back to standard JSON on SQLite for fast standalone pytest runs.
JSONBType = JSON().with_variant(JSONB(), "postgresql")


class JobPosition(Base):
    """Table 1: `job_positions` — Job role description, seniority, and rubric matrix."""

    __tablename__ = "job_positions"
    __table_args__ = (
        CheckConstraint(
            "default_duration_minutes BETWEEN 10 AND 90",
            name="ck_job_positions_duration_range",
        ),
        Index("idx_job_positions_active_created", "is_active", "created_at"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: generate_prefixed_id("job"),
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    company_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
        default="Enterprise AI Corp",
    )
    seniority_level: Mapped[SeniorityLevel] = mapped_column(
        SAEnum(SeniorityLevel, name="seniority_level_enum"),
        nullable=False,
        default=SeniorityLevel.SENIOR,
    )
    job_description: Mapped[str] = mapped_column(Text, nullable=False)
    rubric_config: Mapped[dict[str, Any]] = mapped_column(JSONBType, nullable=False)
    default_duration_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=30,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    sessions: Mapped[list["InterviewSession"]] = relationship(
        back_populates="job_position",
        lazy="selectin",
    )


class Candidate(Base):
    """Table 2: `candidates` — Candidate profile, sanitized CV text, and structured CV summary."""

    __tablename__ = "candidates"
    __table_args__ = (Index("idx_candidates_email", "email"),)

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: generate_prefixed_id("cnd"),
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    cv_raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    cv_structured_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONBType,
        nullable=False,
        default=dict,
    )
    cv_file_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    sessions: Mapped[list["InterviewSession"]] = relationship(
        back_populates="candidate",
        lazy="selectin",
    )


class InterviewSession(Base):
    """Table 3: `interview_sessions` — Core session lifecycle, stage state, VRM/voice config & JWT JTI lock."""

    __tablename__ = "interview_sessions"
    __table_args__ = (
        CheckConstraint(
            "duration_minutes BETWEEN 10 AND 90",
            name="ck_interview_sessions_duration_minutes",
        ),
        CheckConstraint(
            "duration_seconds >= 0",
            name="ck_interview_sessions_duration_seconds",
        ),
        CheckConstraint(
            "last_turn_seq >= 0",
            name="ck_interview_sessions_last_turn_seq",
        ),
        Index("idx_interview_sessions_status_created", "status", "created_at"),
        Index("idx_interview_sessions_candidate_id", "candidate_id"),
        Index("idx_interview_sessions_job_position_id", "job_position_id"),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: generate_prefixed_id("ses"),
    )
    job_position_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("job_positions.id", ondelete="RESTRICT"),
        nullable=False,
    )
    candidate_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("candidates.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[SessionStatus] = mapped_column(
        SAEnum(SessionStatus, name="session_status_enum"),
        nullable=False,
        default=SessionStatus.READY,
    )
    current_stage: Mapped[InterviewStageId] = mapped_column(
        SAEnum(InterviewStageId, name="interview_stage_enum"),
        nullable=False,
        default=InterviewStageId.STAGE_1_INTRO,
    )
    interviewer_persona_name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="Alya",
    )
    vrm_model_id: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="alya_v1",
    )
    vrm_model_url: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
        default="/models/alya.vrm",
    )
    voice_name: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="Aoede",
    )
    language: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="id-ID",
    )
    duration_minutes: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=30,
    )
    duration_seconds: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    last_turn_seq: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
    ephemeral_token_jti: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        unique=True,
    )
    token_expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
    completion_reason: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
    )

    job_position: Mapped["JobPosition"] = relationship(
        back_populates="sessions",
        lazy="selectin",
    )
    candidate: Mapped["Candidate"] = relationship(
        back_populates="sessions",
        lazy="selectin",
    )
    transcripts: Mapped[list["InterviewTranscript"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="InterviewTranscript.turn_seq.asc()",
        lazy="selectin",
    )
    evaluation_report: Mapped["EvaluationReport | None"] = relationship(
        back_populates="session",
        uselist=False,
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class InterviewTranscript(Base):
    """Table 4: `interview_transcripts` — Verbatim turns between AI and Candidate."""

    __tablename__ = "interview_transcripts"
    __table_args__ = (
        UniqueConstraint(
            "session_id",
            "turn_seq",
            name="uq_interview_transcripts_session_turn_seq",
        ),
        CheckConstraint("turn_seq >= 1", name="ck_interview_transcripts_turn_seq"),
        CheckConstraint(
            "ended_at_ms >= started_at_ms",
            name="ck_interview_transcripts_timestamps",
        ),
        Index(
            "idx_interview_transcripts_session_stage",
            "session_id",
            "stage_id",
            "turn_seq",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: generate_prefixed_id("trn"),
    )
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    turn_id: Mapped[str] = mapped_column(String(36), nullable=False)
    speaker: Mapped[TranscriptSpeaker] = mapped_column(
        SAEnum(TranscriptSpeaker, name="transcript_speaker_enum"),
        nullable=False,
    )
    stage_id: Mapped[InterviewStageId] = mapped_column(
        SAEnum(InterviewStageId, name="interview_stage_enum"),
        nullable=False,
    )
    text_content: Mapped[str] = mapped_column(Text, nullable=False)
    was_interrupted: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    started_at_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ended_at_ms: Mapped[int] = mapped_column(BigInteger, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped["InterviewSession"] = relationship(back_populates="transcripts")


class EvaluationReport(Base):
    """Table 5: `evaluation_reports` — 1:1 Post-Interview structured evaluation report."""

    __tablename__ = "evaluation_reports"
    __table_args__ = (
        CheckConstraint(
            "overall_weighted_score BETWEEN 1.00 AND 5.00",
            name="ck_evaluation_reports_score_range",
        ),
        Index(
            "idx_evaluation_reports_recommendation_score",
            "hiring_recommendation",
            "overall_weighted_score",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: generate_prefixed_id("rep"),
    )
    session_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    overall_weighted_score: Mapped[Decimal] = mapped_column(
        Numeric(4, 2),
        nullable=False,
    )
    hiring_recommendation: Mapped[HiringRecommendation] = mapped_column(
        SAEnum(HiringRecommendation, name="hiring_recommendation_enum"),
        nullable=False,
    )
    confidence_level: Mapped[ConfidenceLevel] = mapped_column(
        SAEnum(ConfidenceLevel, name="confidence_level_enum"),
        nullable=False,
        default=ConfidenceLevel.HIGH,
    )
    executive_summary: Mapped[str] = mapped_column(Text, nullable=False)
    competency_scores: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONBType,
        nullable=False,
    )
    strengths: Mapped[list[str]] = mapped_column(
        JSONBType,
        nullable=False,
        default=list,
    )
    areas_for_improvement: Mapped[list[str]] = mapped_column(
        JSONBType,
        nullable=False,
        default=list,
    )
    red_flags_detected: Mapped[list[str]] = mapped_column(
        JSONBType,
        nullable=False,
        default=list,
    )
    cv_verification_notes: Mapped[str] = mapped_column(Text, nullable=False)
    evaluator_model: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        default="gemini-2.5-pro",
    )
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
    )

    session: Mapped["InterviewSession"] = relationship(
        back_populates="evaluation_report",
    )
