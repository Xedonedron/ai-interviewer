/**
 * Contract 5: REST API & DTO Schema Specification (`rest-api-contract.md`)
 * Version: 1.0.0 — 100% 1:1 snake_case Parity with Backend Pydantic v2 Models
 */

export type SeniorityLevel = 'JUNIOR' | 'MID' | 'SENIOR' | 'STAFF' | 'PRINCIPAL';

export type SessionStatus =
  | 'READY'
  | 'IN_PROGRESS'
  | 'RECONNECTING'
  | 'EVALUATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'EXPIRED';

export type InterviewStageId =
  | 'STAGE_1_INTRO'
  | 'STAGE_2_CV_PROBE'
  | 'STAGE_3_TECHNICAL'
  | 'STAGE_4_QNA'
  | 'STAGE_5_CLOSING';

export type TranscriptSpeaker = 'AI' | 'CANDIDATE';

export type AvatarStateId = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'INTERRUPTED';

export type AvatarEmotion = 'neutral' | 'happy' | 'serious' | 'relaxed' | 'surprised';

export type HiringRecommendation = 'STRONG_HIRE' | 'HIRE' | 'HOLD' | 'NO_HIRE';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type CompletionReason = 'completed_normally' | 'user_ended' | 'time_up' | 'system_error';

export type InterviewLanguage = 'id-ID' | 'en-US';

export type GeminiVoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Aoede';

export interface ApiErrorDetail {
  field: string;
  issue: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
    request_id: string;
  };
}

export interface RubricCriterionDto {
  competency_id: string;
  competency_name: string;
  weight_percentage: number;
  probing_guidance: string;
  positive_signals: string[];
  red_flag_signals: string[];
}

export interface RubricConfigDto {
  version: '1.0';
  passing_score_threshold: number;
  criteria: RubricCriterionDto[];
}

export interface WorkExperienceDto {
  company: string;
  role: string;
  duration_label: string;
  key_achievements: string[];
}

export interface NotableProjectDto {
  name: string;
  tech_stack: string[];
  summary: string;
}

export interface CvStructuredSummaryDto {
  headline: string;
  years_of_experience: number;
  core_skills: string[];
  work_experiences: WorkExperienceDto[];
  notable_projects: NotableProjectDto[];
  probing_highlights: string[];
}

export interface CreateSessionRequest {
  candidate: {
    full_name: string;
    email: string;
    cv_text: string;
    cv_structured_summary?: CvStructuredSummaryDto;
  };
  job: {
    title: string;
    company_name: string;
    seniority_level: SeniorityLevel;
    job_description: string;
    rubric_config: RubricConfigDto;
  };
  session_config: {
    interviewer_persona_name: string;
    vrm_model_id: string;
    vrm_model_url: string;
    voice_name: GeminiVoiceName;
    language: InterviewLanguage;
    duration_minutes: number;
    token_ttl_hours?: number;
  };
}

export interface CreateSessionResponse {
  session_id: string;
  job_position_id: string;
  candidate_id: string;
  status: SessionStatus;
  current_stage: InterviewStageId;
  candidate_join_url: string;
  ws_endpoint_url: string;
  ephemeral_token: string;
  token_expires_at: string;
  created_at: string;
}

export interface SessionListItemDto {
  session_id: string;
  status: SessionStatus;
  current_stage: InterviewStageId;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  company_name: string;
  seniority_level: SeniorityLevel;
  language: InterviewLanguage;
  duration_minutes: number;
  duration_seconds: number;
  overall_weighted_score: number | null;
  hiring_recommendation: HiringRecommendation | null;
  candidate_join_url?: string;
  candidate_token?: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SessionListResponse {
  items: SessionListItemDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface InterviewStageInfoDto {
  stage_id: InterviewStageId;
  stage_label: string;
  allocated_minutes: number;
}

export interface CandidateSessionMetadataResponse {
  session_id: string;
  status: SessionStatus;
  current_stage: InterviewStageId;
  candidate_name: string;
  job_title: string;
  company_name: string;
  seniority_level: SeniorityLevel;
  interviewer_persona_name: string;
  vrm_model_id: string;
  vrm_model_url: string;
  voice_name: GeminiVoiceName;
  language: InterviewLanguage;
  duration_minutes: number;
  remaining_seconds: number;
  last_turn_seq: number;
  ws_endpoint_url: string;
  stages: InterviewStageInfoDto[];
  candidate_token?: string;
}

export interface CompleteSessionRequest {
  reason: CompletionReason;
  client_duration_seconds?: number;
  candidate_csat_rating?: number;
  candidate_feedback?: string;
}

export interface CompleteSessionResponse {
  session_id: string;
  status: SessionStatus;
  completion_reason: CompletionReason;
  report_eta_seconds: number;
  completed_at: string;
}

export interface SupportingQuoteDto {
  turn_id: string;
  timestamp_sec: number;
  speaker: TranscriptSpeaker;
  quote: string;
}

export interface CompetencyScoreItemDto {
  competency_id: string;
  competency_name: string;
  weight_percentage: number;
  score: number;
  rationale: string;
  supporting_quotes: SupportingQuoteDto[];
}

export interface EvaluationReportDto {
  report_id: string;
  session_id: string;
  overall_weighted_score: number;
  hiring_recommendation: HiringRecommendation;
  confidence_level: ConfidenceLevel;
  executive_summary: string;
  competency_scores: CompetencyScoreItemDto[];
  strengths: string[];
  areas_for_improvement: string[];
  red_flags_detected: string[];
  cv_verification_notes: string;
  evaluator_model: string;
  generated_at: string;
}

export interface TranscriptTurnDto {
  turn_seq: number;
  turn_id: string;
  speaker: TranscriptSpeaker;
  stage_id: InterviewStageId;
  text_content: string;
  was_interrupted: boolean;
  started_at_ms: number;
  ended_at_ms: number;
}

export interface SessionReportResponse {
  session_id: string;
  status: SessionStatus;
  candidate_name: string;
  candidate_email: string;
  job_title: string;
  company_name: string;
  seniority_level: SeniorityLevel;
  language: InterviewLanguage;
  duration_minutes: number;
  duration_seconds: number;
  started_at: string | null;
  completed_at: string | null;
  evaluation_report: EvaluationReportDto | null;
  transcript: TranscriptTurnDto[];
}

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  version: string;
  database_connected: boolean;
  gemini_configured: boolean;
  active_ws_sessions: number;
  uptime_sec: number;
}
