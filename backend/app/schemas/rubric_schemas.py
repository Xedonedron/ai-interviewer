"""JSONB Rubric, CV Summary & Structured Evaluation Schemas (`app/schemas/rubric_schemas.py`).

Implements Contract 4 Section 5 (`docs/contracts/database-schema.md`) and
Contract 5 (`docs/contracts/rest-api-contract.md`) with 100% `snake_case` parity.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SeniorityLevel(StrEnum):
    JUNIOR = "JUNIOR"
    MID = "MID"
    SENIOR = "SENIOR"
    STAFF = "STAFF"
    PRINCIPAL = "PRINCIPAL"


class SessionStatus(StrEnum):
    READY = "READY"
    IN_PROGRESS = "IN_PROGRESS"
    RECONNECTING = "RECONNECTING"
    EVALUATING = "EVALUATING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    EXPIRED = "EXPIRED"


class InterviewStageId(StrEnum):
    STAGE_1_INTRO = "STAGE_1_INTRO"
    STAGE_2_CV_PROBE = "STAGE_2_CV_PROBE"
    STAGE_3_TECHNICAL = "STAGE_3_TECHNICAL"
    STAGE_4_QNA = "STAGE_4_QNA"
    STAGE_5_CLOSING = "STAGE_5_CLOSING"


class TranscriptSpeaker(StrEnum):
    AI = "AI"
    CANDIDATE = "CANDIDATE"


class AvatarStateId(StrEnum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    THINKING = "THINKING"
    SPEAKING = "SPEAKING"
    INTERRUPTED = "INTERRUPTED"


class AvatarEmotion(StrEnum):
    NEUTRAL = "neutral"
    HAPPY = "happy"
    SERIOUS = "serious"
    RELAXED = "relaxed"
    SURPRISED = "surprised"


class HiringRecommendation(StrEnum):
    STRONG_HIRE = "STRONG_HIRE"
    HIRE = "HIRE"
    HOLD = "HOLD"
    NO_HIRE = "NO_HIRE"


class ConfidenceLevel(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class CompletionReason(StrEnum):
    COMPLETED_NORMALLY = "completed_normally"
    USER_ENDED = "user_ended"
    TIME_UP = "time_up"
    SYSTEM_ERROR = "system_error"


class InterviewLanguage(StrEnum):
    ID_ID = "id-ID"
    EN_US = "en-US"


class GeminiVoiceName(StrEnum):
    PUCK = "Puck"
    CHARON = "Charon"
    KORE = "Kore"
    FENRIR = "Fenrir"
    AOEDE = "Aoede"


class RubricCriterionDto(BaseModel):
    """Single competency criterion in `job_positions.rubric_config`."""

    model_config = ConfigDict(extra="forbid")

    competency_id: str = Field(pattern=r"^[a-z0-9_]{3,50}$")
    competency_name: str = Field(min_length=3, max_length=120)
    weight_percentage: int = Field(ge=5, le=100)
    probing_guidance: str = Field(min_length=3)
    positive_signals: list[str] = Field(min_length=1)
    red_flag_signals: list[str] = Field(default_factory=list)


class RubricConfigDto(BaseModel):
    """Validated JSONB schema for `job_positions.rubric_config` (`RubricConfigSchema`)."""

    model_config = ConfigDict(extra="forbid")

    version: Literal["1.0"] = "1.0"
    passing_score_threshold: float = Field(default=3.5, ge=1.0, le=5.0)
    criteria: list[RubricCriterionDto] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def validate_total_weight(self) -> "RubricConfigDto":
        total = sum(item.weight_percentage for item in self.criteria)
        if total != 100:
            raise ValueError(
                f"Total weight_percentage pada rubric_config.criteria harus tepat 100 (diterima: {total})."
            )
        return self


class WorkExperienceDto(BaseModel):
    """Work experience item in `candidates.cv_structured_summary`."""

    model_config = ConfigDict(extra="forbid")

    company: str
    role: str
    duration_label: str
    key_achievements: list[str] = Field(default_factory=list)


class NotableProjectDto(BaseModel):
    """Notable project item in `candidates.cv_structured_summary`."""

    model_config = ConfigDict(extra="forbid")

    name: str
    tech_stack: list[str] = Field(default_factory=list)
    summary: str


class CvStructuredSummaryDto(BaseModel):
    """Validated JSONB schema for `candidates.cv_structured_summary` (`CvStructuredSummarySchema`)."""

    model_config = ConfigDict(extra="forbid")

    headline: str
    years_of_experience: float = Field(ge=0.0, le=50.0)
    core_skills: list[str] = Field(default_factory=list)
    work_experiences: list[WorkExperienceDto] = Field(default_factory=list)
    notable_projects: list[NotableProjectDto] = Field(default_factory=list)
    probing_highlights: list[str] = Field(default_factory=list)


class SupportingQuoteDto(BaseModel):
    """Verbatim evidence quote linked to `interview_transcripts`."""

    model_config = ConfigDict(extra="forbid")

    turn_id: str
    timestamp_sec: int = Field(ge=0)
    speaker: TranscriptSpeaker
    quote: str


class CompetencyScoreItemDto(BaseModel):
    """Competency evaluation item in `evaluation_reports.competency_scores`."""

    model_config = ConfigDict(extra="forbid")

    competency_id: str
    competency_name: str
    weight_percentage: int = Field(ge=5, le=100)
    score: float = Field(ge=1.0, le=5.0)
    rationale: str = Field(min_length=20)
    supporting_quotes: list[SupportingQuoteDto] = Field(default_factory=list)


class EvaluationReportLLMOutput(BaseModel):
    """Structured Output schema requested from Gemini 2.5 Pro Evaluator."""

    model_config = ConfigDict(extra="forbid")

    overall_weighted_score: float = Field(ge=1.0, le=5.0)
    hiring_recommendation: HiringRecommendation
    confidence_level: ConfidenceLevel = ConfidenceLevel.HIGH
    executive_summary: str = Field(min_length=20)
    competency_scores: list[CompetencyScoreItemDto] = Field(min_length=1)
    strengths: list[str] = Field(default_factory=list)
    areas_for_improvement: list[str] = Field(default_factory=list)
    red_flags_detected: list[str] = Field(default_factory=list)
    cv_verification_notes: str = Field(min_length=10)


class EvaluationReportDto(BaseModel):
    """Full Evaluation Report DTO returned by `GET /api/v1/sessions/{session_id}/report`."""

    model_config = ConfigDict(extra="forbid")

    report_id: str
    session_id: str
    overall_weighted_score: float = Field(ge=1.0, le=5.0)
    hiring_recommendation: HiringRecommendation
    confidence_level: ConfidenceLevel
    executive_summary: str
    competency_scores: list[CompetencyScoreItemDto] = Field(min_length=1)
    strengths: list[str]
    areas_for_improvement: list[str]
    red_flags_detected: list[str]
    cv_verification_notes: str
    evaluator_model: str
    generated_at: str
