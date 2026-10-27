/**
 * REST API Client (`apiClient.ts`)
 * Implements all 6 endpoints from `docs/contracts/rest-api-contract.md` (`/api/v1/...`)
 * with Dual-Mode Operation:
 * - Default Integration Mode (`VITE_USE_MOCK_SIMULATOR=false`): connects to live FastAPI backend
 *   via `VITE_API_BASE_URL` (or `/api/v1/...` proxy) and gracefully falls back to Simulator if offline.
 * - Standalone Simulator Mode (`?mock=true` or `VITE_USE_MOCK_SIMULATOR=true` / `VITE_USE_MOCK=true`):
 *   intercepts requests in-memory for zero-backend validation.
 */

import type {
  CandidateSessionMetadataResponse,
  CompleteSessionRequest,
  CompleteSessionResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  HealthCheckResponse,
  SessionListItemDto,
  SessionListResponse,
  SessionReportResponse,
  SessionStatus,
} from '../types/api.types';
import {
  DEFAULT_INTERVIEW_STAGES,
  MOCK_CANDIDATE_METADATA,
  MOCK_SESSION_ID_COMPLETED,
  MOCK_SESSION_REPORT,
  MOCK_SESSIONS_LIST,
} from './simulator/mockFixtures';

// In-memory runtime store for sessions created during standalone simulator testing
const runtimeSessionsList: SessionListItemDto[] = [...MOCK_SESSIONS_LIST];
const runtimeCandidateMeta: Record<string, CandidateSessionMetadataResponse> = {
  ...MOCK_CANDIDATE_METADATA,
};
const runtimeSessionReports: Record<string, SessionReportResponse> = {
  [MOCK_SESSION_ID_COMPLETED]: MOCK_SESSION_REPORT,
};
const runtimeSessionTokens: Record<string, string> = {};

const SESSION_TOKEN_STORAGE_PREFIX = 'ai_interviewer_token_';

export function cacheSessionToken(sessionId: string, token: string): void {
  if (!sessionId || !token) return;
  runtimeSessionTokens[sessionId] = token;
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(`${SESSION_TOKEN_STORAGE_PREFIX}${sessionId}`, token);
    } catch {
      // Ignore storage quota errors
    }
  }
}

export function resolveSessionToken(sessionId: string, providedToken?: string): string | undefined {
  if (providedToken && providedToken !== 'sim_ws_token') {
    return providedToken;
  }
  if (runtimeSessionTokens[sessionId]) {
    return runtimeSessionTokens[sessionId];
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const cached = window.sessionStorage.getItem(`${SESSION_TOKEN_STORAGE_PREFIX}${sessionId}`);
      if (cached) return cached;
    } catch {
      // Ignore storage access errors
    }
  }
  return isSimulatorModeEnabled() ? providedToken : undefined;
}

export function getApiBaseUrl(): string {
  const rawBase = (import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? '';
  return rawBase.replace(/\/+$/, '');
}

export function isSimulatorModeEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mock') === 'false') return false;
    if (params.get('mock') === 'true') return true;
  }
  const envMockSimulator = import.meta.env?.VITE_USE_MOCK_SIMULATOR;
  if (envMockSimulator === 'true') return true;
  if (envMockSimulator === 'false') return false;

  const envLegacyMock = import.meta.env?.VITE_USE_MOCK;
  if (envLegacyMock === 'true') return true;
  if (envLegacyMock === 'false') return false;

  // Phase 4 Default: Live Backend Integration Mode (`false`), with automatic network-offline fallback
  return false;
}

export class HttpApiError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpApiError';
    this.status = status;
    this.code = code;
  }
}

async function fetchWithMockFallback<T>(
  path: string,
  options: RequestInit,
  mockResolver: () => T | Promise<T>,
): Promise<T> {
  if (isSimulatorModeEnabled()) {
    return await mockResolver();
  }
  const url = `${getApiBaseUrl()}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => null);
      const code = errBody?.error?.code || `HTTP_${res.status}`;
      const message =
        errBody?.error?.message || `HTTP Error ${res.status} on ${path}`;
      throw new HttpApiError(res.status, code, message);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof HttpApiError) {
      throw err;
    }
    // Network-level failure (backend server not running in standalone dev) -> fallback to Mock Simulator
    return await mockResolver();
  }
}

export const apiClient = {
  /**
   * 3.1 `POST /api/v1/sessions` — Create Interview Session (Recruiter)
   */
  async createSession(payload: CreateSessionRequest): Promise<CreateSessionResponse> {
    const response = await fetchWithMockFallback<CreateSessionResponse>(
      '/api/v1/sessions',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      () => {
        const totalWeight = payload.job.rubric_config.criteria.reduce(
          (acc, c) => acc + c.weight_percentage,
          0,
        );
        if (totalWeight !== 100) {
          throw new Error(
            `VALIDATION_ERROR: Total weight_percentage pada rubric_config.criteria harus tepat 100 (diterima: ${totalWeight}).`,
          );
        }

        const ulidSuffix = Math.random().toString(36).substring(2, 12);
        const sessionId = `ses_01jc9x${ulidSuffix}`;
        const jobId = `job_01jc9x${ulidSuffix}`;
        const candidateId = `cnd_01jc9x${ulidSuffix}`;
        const nowIso = new Date().toISOString();
        const expIso = new Date(
          Date.now() + (payload.session_config.token_ttl_hours ?? 72) * 3600_000,
        ).toISOString();
        const mockToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${btoa(
          JSON.stringify({ sub: sessionId, role: 'candidate' }),
        )}.mock_sig`;

        const newItem: SessionListItemDto = {
          session_id: sessionId,
          status: 'READY',
          current_stage: 'STAGE_1_INTRO',
          candidate_name: payload.candidate.full_name,
          candidate_email: payload.candidate.email,
          job_title: payload.job.title,
          company_name: payload.job.company_name,
          seniority_level: payload.job.seniority_level,
          language: payload.session_config.language,
          duration_minutes: payload.session_config.duration_minutes,
          duration_seconds: 0,
          overall_weighted_score: null,
          hiring_recommendation: null,
          started_at: null,
          completed_at: null,
          created_at: nowIso,
        };
        runtimeSessionsList.unshift(newItem);

        runtimeCandidateMeta[sessionId] = {
          session_id: sessionId,
          status: 'READY',
          current_stage: 'STAGE_1_INTRO',
          candidate_name: payload.candidate.full_name,
          job_title: payload.job.title,
          company_name: payload.job.company_name,
          seniority_level: payload.job.seniority_level,
          interviewer_persona_name: payload.session_config.interviewer_persona_name,
          vrm_model_id: payload.session_config.vrm_model_id,
          vrm_model_url: payload.session_config.vrm_model_url,
          voice_name: payload.session_config.voice_name,
          language: payload.session_config.language,
          duration_minutes: payload.session_config.duration_minutes,
          remaining_seconds: payload.session_config.duration_minutes * 60,
          last_turn_seq: 0,
          ws_endpoint_url: `/ws/interview/${sessionId}`,
          stages: DEFAULT_INTERVIEW_STAGES,
        };

        return {
          session_id: sessionId,
          job_position_id: jobId,
          candidate_id: candidateId,
          status: 'READY',
          current_stage: 'STAGE_1_INTRO',
          candidate_join_url: `/interview/${sessionId}/lobby?token=${mockToken}`,
          ws_endpoint_url: `/ws/interview/${sessionId}`,
          ephemeral_token: mockToken,
          token_expires_at: expIso,
          created_at: nowIso,
        };
      },
    );

    cacheSessionToken(response.session_id, response.ephemeral_token);
    return response;
  },

  /**
   * 3.2 `GET /api/v1/sessions` — List Interview Sessions (Recruiter Dashboard)
   */
  async listSessions(params?: {
    status?: SessionStatus;
    limit?: number;
    offset?: number;
  }): Promise<SessionListResponse> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString() ? `?${query.toString()}` : '';

    return fetchWithMockFallback(`/api/v1/sessions${qs}`, { method: 'GET' }, () => {
      const filtered = params?.status
        ? runtimeSessionsList.filter((item) => item.status === params.status)
        : runtimeSessionsList;
      return {
        items: filtered,
        total: filtered.length,
        limit: params?.limit ?? 20,
        offset: params?.offset ?? 0,
      };
    });
  },

  /**
   * 3.3 `GET /api/v1/sessions/{session_id}` — Get Public Session Metadata (Candidate Lobby)
   */
  async getCandidateSessionMetadata(
    sessionId: string,
    token?: string,
  ): Promise<CandidateSessionMetadataResponse> {
    const resolvedToken = resolveSessionToken(sessionId, token);
    return fetchWithMockFallback(
      `/api/v1/sessions/${sessionId}`,
      {
        method: 'GET',
        headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
      },
      () => {
        const found =
          runtimeCandidateMeta[sessionId] ??
          runtimeCandidateMeta[MOCK_SESSION_ID_COMPLETED];
        return {
          ...found,
          session_id: sessionId,
        };
      },
    );
  },

  /**
   * 3.4 `POST /api/v1/sessions/{session_id}/complete` — Complete Session & Trigger Evaluation
   */
  async completeSession(
    sessionId: string,
    payload: CompleteSessionRequest,
    token?: string,
  ): Promise<CompleteSessionResponse> {
    const resolvedToken = resolveSessionToken(sessionId, token);
    return fetchWithMockFallback(
      `/api/v1/sessions/${sessionId}/complete`,
      {
        method: 'POST',
        headers: resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {},
        body: JSON.stringify(payload),
      },
      () => {
        const completedAt = new Date().toISOString();
        const existingItem = runtimeSessionsList.find(
          (s) => s.session_id === sessionId,
        );
        if (existingItem) {
          existingItem.status = 'COMPLETED';
          existingItem.current_stage = 'STAGE_5_CLOSING';
          existingItem.completed_at = completedAt;
          existingItem.duration_seconds = payload.client_duration_seconds ?? 1745;
          existingItem.overall_weighted_score = 4.25;
          existingItem.hiring_recommendation = 'HIRE';
        }

        if (!runtimeSessionReports[sessionId]) {
          runtimeSessionReports[sessionId] = {
            ...MOCK_SESSION_REPORT,
            session_id: sessionId,
            candidate_name: existingItem?.candidate_name ?? 'Nixon Daniel',
            candidate_email:
              existingItem?.candidate_email ??
              'nixon.daniel@smartnetmagna.com',
            job_title:
              existingItem?.job_title ??
              'Data Platform & AI Systems Engineer',
            company_name:
              existingItem?.company_name ?? 'Smartnet Magna Global',
            completed_at: completedAt,
          };
        }

        return {
          session_id: sessionId,
          status: 'EVALUATING',
          completion_reason: payload.reason,
          report_eta_seconds: 15,
          completed_at: completedAt,
        };
      },
    );
  },

  /**
   * 3.5 `GET /api/v1/sessions/{session_id}/report` — Get Evaluation Report & Full Transcript
   */
  async getSessionReport(sessionId: string): Promise<SessionReportResponse> {
    return fetchWithMockFallback(
      `/api/v1/sessions/${sessionId}/report`,
      { method: 'GET' },
      () => {
        const report =
          runtimeSessionReports[sessionId] ?? MOCK_SESSION_REPORT;
        return {
          ...report,
          session_id: sessionId,
        };
      },
    );
  },

  /**
   * 3.6 `GET /api/v1/health` — Health & Readiness Check
   */
  async getHealth(): Promise<HealthCheckResponse> {
    return fetchWithMockFallback('/api/v1/health', { method: 'GET' }, () => ({
      status: 'healthy',
      version: '1.0.0',
      database_connected: true,
      gemini_configured: true,
      active_ws_sessions: 1,
      uptime_sec: 86400,
    }));
  },
};
