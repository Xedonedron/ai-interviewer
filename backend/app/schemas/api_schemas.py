"""REST API Request & Response DTO Schemas (`app/schemas/api_schemas.py`).

100% 1:1 `snake_case` parity with `docs/contracts/rest-api-contract.md` and
`frontend/src/types/api.types.ts`.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.rubric_schemas import (
    AvatarEmotion,
    AvatarStateId,
    CompetencyScoreItemDto,
    CompletionReason,
    ConfidenceLevel,
    CvStructuredSummaryDto,
    EvaluationReportDto,
    GeminiVoiceName,
    HiringRecommendation,
    InterviewLanguage,
    InterviewStageId,
    NotableProjectDto,
    RubricConfigDto,
    RubricCriterionDto,
    SeniorityLevel,
    SessionStatus,
    SupportingQuoteDto,
    TranscriptSpeaker,
    WorkExperienceDto,
)


class ApiErrorDetail(BaseModel):
    field: str
    issue: str


class ApiErrorObject(BaseModel):
    code: str
    message: str
    details: list[ApiErrorDetail] = Field(default_factory=list)
    request_id: str


class ApiErrorResponse(BaseModel):
    error: ApiErrorObject


class CandidateCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    cv_text: str = Field(min_length=10)
    cv_structured_summary: CvStructuredSummaryDto | None = None


class JobCreateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=2, max_length=200)
    company_name: str = Field(default="Enterprise AI Corp", min_length=2, max_length=150)
    seniority_level: SeniorityLevel = SeniorityLevel.SENIOR
    job_description: str = Field(min_length=10)
    rubric_config: RubricConfigDto


class SessionConfigInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interviewer_persona_name: str = Field(default="Alya", min_length=1, max_length=100)
    vrm_model_id: str = Field(default="alya_v1", min_length=1, max_length=64)
    vrm_model_url: str = Field(default="/models/alya.vrm", min_length=1, max_length=512)
    voice_name: GeminiVoiceName = GeminiVoiceName.AOEDE
    language: InterviewLanguage = InterviewLanguage.ID_ID
    duration_minutes: int = Field(default=30, ge=10, le=90)
    token_ttl_hours: int | None = Field(default=72, ge=1, le=720)


class CreateSessionRequest(BaseModel):
    """Request payload for `POST /api/v1/sessions`."""

    model_config = ConfigDict(extra="forbid")

    candidate: CandidateCreateInput
    job: JobCreateInput
    session_config: SessionConfigInput = Field(default_factory=SessionConfigInput)


class CreateSessionResponse(BaseModel):
    """Response payload (`201 Created`) for `POST /api/v1/sessions`."""

    session_id: str
    job_position_id: str
    candidate_id: str
    status: SessionStatus
    current_stage: InterviewStageId
    candidate_join_url: str
    ws_endpoint_url: str
    ephemeral_token: str
    token_expires_at: str
    created_at: str


class SessionListItemDto(BaseModel):
    """Item in `GET /api/v1/sessions`."""

    session_id: str
    status: SessionStatus
    current_stage: InterviewStageId
    candidate_name: str
    candidate_email: str
    job_title: str
    company_name: str
    seniority_level: SeniorityLevel
    language: InterviewLanguage
    duration_minutes: int
    duration_seconds: int
    overall_weighted_score: float | None = None
    hiring_recommendation: HiringRecommendation | None = None
    started_at: str | None = None
    completed_at: str | None = None
    created_at: str


class SessionListResponse(BaseModel):
    """Response payload (`200 OK`) for `GET /api/v1/sessions`."""

    items: list[SessionListItemDto]
    total: int
    limit: int
    offset: int


class InterviewStageInfoDto(BaseModel):
    """Stage allocation item for `CandidateSessionMetadataResponse`."""

    stage_id: InterviewStageId
    stage_label: str
    allocated_minutes: int


class CandidateSessionMetadataResponse(BaseModel):
    """Response payload (`200 OK`) for `GET /api/v1/sessions/{session_id}`.

    Security Guardrail: NEVER includes `rubric_config`, `cv_raw_text`, or `probing_highlights`.
    """

    model_config = ConfigDict(extra="forbid")

    session_id: str
    status: SessionStatus
    current_stage: InterviewStageId
    candidate_name: str
    job_title: str
    company_name: str
    seniority_level: SeniorityLevel
    interviewer_persona_name: str
    vrm_model_id: str
    vrm_model_url: str
    voice_name: GeminiVoiceName
    language: InterviewLanguage
    duration_minutes: int
    remaining_seconds: int
    last_turn_seq: int
    ws_endpoint_url: str
    stages: list[InterviewStageInfoDto]


class CompleteSessionRequest(BaseModel):
    """Request payload for `POST /api/v1/sessions/{session_id}/complete`."""

    model_config = ConfigDict(extra="forbid")

    reason: CompletionReason = CompletionReason.COMPLETED_NORMALLY
    client_duration_seconds: int | None = Field(default=None, ge=0)
    candidate_csat_rating: int | None = Field(default=None, ge=1, le=5)
    candidate_feedback: str | None = Field(default=None, max_length=2000)


class CompleteSessionResponse(BaseModel):
    """Response payload (`202 Accepted`) for `POST /api/v1/sessions/{session_id}/complete`."""

    session_id: str
    status: SessionStatus
    completion_reason: CompletionReason
    report_eta_seconds: int
    completed_at: str


class TranscriptTurnDto(BaseModel):
    """Transcript turn item in `SessionReportResponse`."""

    turn_seq: int
    turn_id: str
    speaker: TranscriptSpeaker
    stage_id: InterviewStageId
    text_content: str
    was_interrupted: bool
    started_at_ms: int
    ended_at_ms: int


class SessionReportResponse(BaseModel):
    """Response payload (`200 OK`) for `GET /api/v1/sessions/{session_id}/report`."""

    session_id: str
    status: SessionStatus
    candidate_name: str
    candidate_email: str
    job_title: str
    company_name: str
    seniority_level: SeniorityLevel
    language: InterviewLanguage
    duration_minutes: int
    duration_seconds: int
    started_at: str | None = None
    completed_at: str | None = None
    evaluation_report: EvaluationReportDto | None = None
    transcript: list[TranscriptTurnDto] = Field(default_factory=list)


class HealthCheckResponse(BaseModel):
    """Response payload (`200 OK`) for `GET /api/v1/health`."""

    status: Literal["healthy", "degraded"] = "healthy"
    version: str = "1.0.0"
    database_connected: bool = True
    gemini_configured: bool = True
    active_ws_sessions: int = 0
    uptime_sec: int = 0
