# Graph Report - ai-interviewer  (2026-10-27)

## Corpus Check
- 107 files · ~95,008 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 12 file(s) not represented in the graph (top: (none) 5, .example 3, .vrm 2)

## Summary
- 1277 nodes · 2710 edges · 76 communities (54 shown, 22 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 332 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3f58e8d0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- api.types.ts
- get_session_metadata
- Product Requirements Document (PRD): Real-Time AI Interviewer Platform
- VrmProceduralAnimator
- PcmStreamPlayer
- VrmAvatarEngine
- InterviewRoomPage
- audioAndVrmEngine.test.ts
- STATE.md
- 3.2 JSON Control Frames (Backend -> Client)
- sessions.py
- 3. Rincian Eksekusi & Gate Validasi per Fase
- UpstreamLiveSessionProtocol
- compilerOptions
- 3. Core Functionalities (Deep-Dive Specifications)
- ActiveSessionConnectionRegistry
- AGENTS.md — AI Interviewer Platform Workspace Rules
- Requirements: Real-Time AI Interviewer Platform
- Plan: [Judul Plan / Fitur]
- InterviewSessionOrchestrator
- Plan: Comprehensive PRD, ADR-002 & Initial System Contracts
- VrmLipSync.ts
- test_security_and_prompts.py
- PcmCaptureProcessor
- session_orchestrator.py
- InterviewRepository
- 3. Complete Endpoints Specification (`/api/v1/...`)
- package.json
- test_rest_api.py
- VrmAvatarEngine.ts
- test_e2e_lifecycle.py
- MockInterviewHarness.ts
- ws.types.ts
- conftest.py
- evaluator_service.py
- Settings
- InterviewWsClient
- MicCaptureManager
- 3.6 Fungsi 6: Automated Transcript & Competency Evaluation Report
- test_ws_relay.py
- Plan: Workspace Preparation, Documentation Governance & Graphify Setup
- 2. Considered Options
- Real-Time AI Interviewer Platform (3D WebGL VRM + Full-Duplex Audio + Evidence-Anchored Rubric Engine)
- 4.1 Rincian Layar & Komponen UI
- 5. Backend Specifications (WebSocket Relay Protocol, APIs & Guardrails)
- MockInterviewHarness
- GeminiLiveEvent
- 1. Executive Summary, Product Vision & Goals
- 6. End-to-End Workflows (Sequence & Architecture Diagrams)
- 7. Edge Cases, Resilience & Failure Modes
- Plan: Phase 3 — Backend Development & Standalone Validation (`backend/`)
- DESIGN.md — Warm Minimalist Design System & Frontend UI Specification
- 2. Considered Options
- ai-interviewer-backend
- verify_e2e.sh
- DeterministicGeminiLiveSession
- GoogleGenAIGeminiLiveSession
- Contract 2: Audio Pipeline & Lip-Sync Signal Specification (`audio-pipeline-spec.md`)
- Plan: Phase 1 — Master Implementation Workflow & Complete Data Contracts
- .send_realtime_audio

## God Nodes (most connected - your core abstractions)
1. `InterviewRepository` - 47 edges
2. `InterviewStageId` - 40 edges
3. `InterviewSessionOrchestrator` - 38 edges
4. `PcmStreamPlayer` - 38 edges
5. `VrmAvatarEngine` - 34 edges
6. `TranscriptSpeaker` - 27 edges
7. `InterviewRoomPage()` - 25 edges
8. `MockInterviewHarness` - 25 edges
9. `InterviewSession` - 24 edges
10. `SessionStatus` - 24 edges

## Surprising Connections (you probably didn't know these)
- `1. Objective & Context` --references--> `DeterministicGeminiLiveSession`  [INFERRED]
  docs/plans/2026-10-26-phase-3-backend-and-standalone-validation.md → backend/app/ws/gemini_live_client.py
- `1. Filosofi Rekayasa: Contract-First & Standalone-Validated Phases` --references--> `PcmStreamPlayer`  [INFERRED]
  docs/ARCHITECTURE_AND_WORKFLOW.md → frontend/src/engine/audio/PcmStreamPlayer.ts
- `Deliverables Utama` --references--> `PcmStreamPlayer`  [INFERRED]
  docs/ARCHITECTURE_AND_WORKFLOW.md → frontend/src/engine/audio/PcmStreamPlayer.ts
- `2.3 Local VAD untuk Audio Ducking (Fast Barge-In Assist)` --references--> `PcmStreamPlayer`  [INFERRED]
  docs/contracts/audio-pipeline-spec.md → frontend/src/engine/audio/PcmStreamPlayer.ts
- `Daftar Kontrak Aktif (`v1.0.0` — Locked & Cross-Validated)` --references--> `PcmStreamPlayer`  [INFERRED]
  docs/contracts/README.md → frontend/src/engine/audio/PcmStreamPlayer.ts

## Import Cycles
- None detected.

## Communities (76 total, 22 thin omitted)

### Community 0 - "api.types.ts"
Cohesion: 0.06
Nodes (46): RECOMMENDATION_LABEL, RECOMMENDATION_BADGE, RECOMMENDATION_LABEL, STATUS_BADGE, STATUS_LABEL, fetchWithMockFallback(), getApiBaseUrl(), HttpApiError (+38 more)

### Community 1 - "get_session_metadata"
Cohesion: 0.10
Nodes (9): complete_session(), create_session(), _extract_bearer_token(), get_session_metadata(), HiringRecommendation_or_none(), list_sessions(), _to_iso_z(), _verify_optional_candidate_token() (+1 more)

### Community 2 - "Product Requirements Document (PRD): Real-Time AI Interviewer Platform"
Cohesion: 0.22
Nodes (9): 2.1 High-Level System Architecture Diagram, 2.2 Detailed Technology Stack & Justification, 2. Complete Tech Stack & System Architecture, 8.1 End-to-End Voice Latency Budget (< 1.5 – 2.0 Detik), 8.2 Security, Privacy & Credential Isolation, 8.3 Cloud Resource Footprint & Cost Efficiency Analysis (GCP), 8. Non-Functional Requirements (NFR), Security & Scalability, Daftar Isi (+1 more)

### Community 3 - "VrmProceduralAnimator"
Cohesion: 0.14
Nodes (11): 3D VRM Models Directory (`public/models/`), Procedural Humanoid Rig Fallback (60 FPS Guaranteed), BLINK_CLOSE_SEC, BLINK_HOLD_SEC, BLINK_MAX_INTERVAL_SEC, BLINK_MIN_INTERVAL_SEC, BLINK_OPEN_SEC, BLINK_TOTAL_DURATION_SEC (+3 more)

### Community 4 - "PcmStreamPlayer"
Cohesion: 0.11
Nodes (11): create_gemini_live_session(), sanitize_and_lock_transcript_language(), test_sanitize_and_lock_transcript_language_enforces_id_en_and_preserves_tech_terms(), 4. Verification Criteria (Gate Validasi Fase 2), 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist, 4. Verification Criteria (+3 more)

### Community 5 - "VrmAvatarEngine"
Cohesion: 0.12
Nodes (11): 5. Implementation Log & Actual Changes, computeFrameRms(), VrmAvatarEngine, 5.2 WebSocket Relay Endpoint & Message Contract, 9. Phased Implementation Roadmap & Acceptance Criteria, Milestone 1: Core WebSocket Relay & Full-Duplex Voice Pipeline, Milestone 2: 3D VRM Avatar Engine, Viseme Lip-Sync & Non-Verbal State Machine, Milestone 3: Dynamic Context Injection, Interview Stage Controller & Pre-Interview Lobby (+3 more)

### Community 6 - "InterviewRoomPage"
Cohesion: 0.17
Nodes (24): Checklist Gate Validasi Fase 2 (Definition of Done), 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist, 5. Implementation Log & Actual Changes, Plan: Phase 2 — Frontend Development & Standalone Validation (`frontend/`), 1. Objective & Context, App() (+16 more)

### Community 7 - "audioAndVrmEngine.test.ts"
Cohesion: 0.10
Nodes (19): CHUNK_BYTES_40MS, CHUNK_SAMPLES_40MS, DEFAULT_MEDIA_CONSTRAINTS, downsampleFloat32Buffer(), LOCAL_VAD_CONSECUTIVE_FRAMES, LOCAL_VAD_RMS_THRESHOLD, MicCaptureCallbacks, quantizeFloat32BufferToInt16() (+11 more)

### Community 8 - "STATE.md"
Cohesion: 0.07
Nodes (33): Daftar Kontrak Aktif (`v1.0.0` — Locked & Cross-Validated), Matriks Audit Konsistensi Atribut Lintas Kontrak (Cross-Contract Field Parity), System Contracts & Protocol Specifications (`docs/contracts/`), 1. Compatibility & Standard Expression Names (`@pixiv/three-vrm`), 2. Avatar State Machine Definitions, 3. Mathematical Formula for Viseme Smoothing & Clamping, Contract 3: 3D VRM Avatar States, Blendshapes & Procedural Animation (`vrm-avatar-states.md`), Daftar Expression / Blendshape Standar yang Digunakan: (+25 more)

### Community 9 - "3.2 JSON Control Frames (Backend -> Client)"
Cohesion: 0.10
Nodes (21): 1. Connection & Handshake Specification, 2.1 Binary Audio Frame (Upstream Microphone Stream), 2.2 JSON Control Frames (Client -> Backend), 2. Client -> Backend Relay Messages, 3.1 Binary Audio Frame (Downstream AI Voice Stream), 3.2 JSON Control Frames (Backend -> Client), 3. Backend Relay -> Client Messages, 4. Custom WebSocket Close Codes (+13 more)

### Community 10 - "sessions.py"
Cohesion: 0.09
Nodes (30): get_session_report(), _to_iso_z(), ApiErrorDetail, ApiErrorObject, ApiErrorResponse, CandidateCreateInput, CandidateSessionMetadataResponse, CompleteSessionRequest (+22 more)

### Community 11 - "3. Rincian Eksekusi & Gate Validasi per Fase"
Cohesion: 0.11
Nodes (19): 1. Filosofi Rekayasa: Contract-First & Standalone-Validated Phases, 2. Diagram Urutan Dependensi 4 Fase Rekayasa, 3. Rincian Eksekusi & Gate Validasi per Fase, Checklist Gate Validasi Fase 1 (Definition of Done), Checklist Gate Validasi Fase 3 (Definition of Done), Checklist Gate Validasi Fase 4 (Definition of Done), Deliverables Utama, Desain *Standalone Mock/Simulator Harness* (`?mock=true` atau `VITE_USE_MOCK=true`) (+11 more)

### Community 13 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 14 - "3. Core Functionalities (Deep-Dive Specifications)"
Cohesion: 0.14
Nodes (14): 3.1 Fungsi 1: Dynamic Context & System Prompt Injection, 3.2 Fungsi 2: Full-Duplex Low-Latency Audio Streaming Pipeline, 3.3 Fungsi 3: Natural Interruption (Barge-In) Mechanism, 3.4 Fungsi 4: 3D VRM Avatar Rendering, Viseme Lip-Sync & Non-Verbal Expressions, 3.5 Fungsi 5: Interview Stage Progression & Time Management, 3. Core Functionalities (Deep-Dive Specifications), A. Dua Lapis Deteksi Interupsi (Dual-Layer Barge-In), A. Komponen Penyusun Konteks (Input Assembler) (+6 more)

### Community 15 - "ActiveSessionConnectionRegistry"
Cohesion: 0.08
Nodes (16): ActiveSessionConnectionRegistry, 1. Design Principles & ID Conventions, 2. Entity-Relationship Diagram (`erDiagram`), 3. PostgreSQL `ENUM` Types Specification, 4.1 Tabel 1: `job_positions`, 4.2 Tabel 2: `candidates`, 4.3 Tabel 3: `interview_sessions`, 4.4 Tabel 4: `interview_transcripts` (+8 more)

### Community 16 - "AGENTS.md — AI Interviewer Platform Workspace Rules"
Cohesion: 0.17
Nodes (12): 1. Sumber Kebenaran & Konteks Proyek (Single Source of Truth), 2. Protokol Wajib: Plan -> Implement -> Track Changes & Update Graph, 3. MANDATORY RULE: Knowledge Graph Navigation (Graphify), 4. Architecture Guardrails (Pantangan Teknis Mutlak), 4 Aturan Alur Kerja Koding dengan Graphify:, 5. Struktur Direktori Dokumentasi Proyek, 6. Gaya Komunikasi & Bahasa, A. Tahap Perencanaan & Reconnaissance (Before Implementation) (+4 more)

### Community 17 - "Requirements: Real-Time AI Interviewer Platform"
Cohesion: 0.17
Nodes (12): 1. Executive Summary & Objective, 2.1 3D VRM (Client-Side Rendering) vs Live2D / VTube Studio, 2.2 LLM & Voice Engine: Gemini Multimodal Live API, 2.3 Backend Proxy / Relay, 2. Core Architectural Decisions, 3.1 Client / Frontend (Web Browser), 3.2 Backend Service (Relay / Gateway), 3.3 Infrastructure & Deployment (+4 more)

### Community 18 - "Plan: [Judul Plan / Fitur]"
Cohesion: 0.07
Nodes (24): 1. Context & Problem Statement, 2. Considered Options, 3. Decision Outcome, 4. Consequences & Trade-offs, ADR-XXX: [Judul Keputusan Arsitektur / Teknis], Justification / Rationale, 1. Objective & Context, 2. Scope & Key Decisions (+16 more)

### Community 19 - "InterviewSessionOrchestrator"
Cohesion: 0.08
Nodes (15): AudioConfigPayload, ClientBargeInFrame, ClientEndSessionFrame, ClientMicStateFrame, ClientPingFrame, ClientReadyFrame, ControlBargeInFrame, ServerPongFrame (+7 more)

### Community 20 - "Plan: Comprehensive PRD, ADR-002 & Initial System Contracts"
Cohesion: 0.20
Nodes (10): 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist, 4. Verification Criteria, 5. Implementation Log & Actual Changes, Deviations from Original Plan, Files Created / Modified, Knowledge Graph (`graphify`) Sync Status (+2 more)

### Community 21 - "VrmLipSync.ts"
Cohesion: 0.15
Nodes (13): ATTACK_RATE_LAMBDA, clampVisemeBudget(), computeTargetVisemesFromFormants(), extractFormantEnergiesFromBuffers(), FAST_INTERRUPT_LAMBDA, FormantBandEnergies, freqToBinIndex(), MAX_TOTAL_VISEME_BUDGET (+5 more)

### Community 22 - "test_security_and_prompts.py"
Cohesion: 0.10
Nodes (12): CvStructuredSummaryDto, NotableProjectDto, WorkExperienceDto, extract_structured_cv_summary(), sanitize_cv_text(), SanitizedCvResult, wrap_candidate_profile_data(), build_interview_system_instruction() (+4 more)

### Community 27 - "session_orchestrator.py"
Cohesion: 0.07
Nodes (10): get_health(), get_settings(), check_db_connection(), get_db_session(), WSCloseCodes, create_ephemeral_session_token(), EphemeralTokenClaims, IssuedEphemeralToken (+2 more)

### Community 28 - "InterviewRepository"
Cohesion: 0.08
Nodes (12): Base, _encode_base32(), generate_prefixed_id(), utc_now(), Candidate, EvaluationReport, InterviewSession, JobPosition (+4 more)

### Community 29 - "3. Complete Endpoints Specification (`/api/v1/...`)"
Cohesion: 0.09
Nodes (23): 1. API Design Conventions & Authentication, 2.1 Standard Error JSON Format (`ApiErrorResponse`), 2.2 HTTP Status Codes & Application Error Codes Matrix, 2. Standard Error Response Envelope & HTTP Status Matrix, 3.1 `POST /api/v1/sessions` — Create Interview Session (Recruiter), 3.2 `GET /api/v1/sessions` — List Interview Sessions (Recruiter Dashboard), 3.3 `GET /api/v1/sessions/{session_id}` — Get Public Session Metadata (Candidate Lobby), 3.4 `POST /api/v1/sessions/{session_id}/complete` — Complete Session & Trigger Evaluation (+15 more)

### Community 30 - "package.json"
Cohesion: 0.04
Nodes (44): dependencies, lucide-react, @pixiv/three-vrm, react, react-dom, react-router-dom, three, zustand (+36 more)

### Community 31 - "test_rest_api.py"
Cohesion: 0.23
Nodes (3): test_full_rest_session_lifecycle(), test_health_endpoint(), test_rest_api_error_schemas_404_422_401_403()

### Community 32 - "VrmAvatarEngine.ts"
Cohesion: 0.17
Nodes (9): QualityGovernor, QualityMetrics, QualityTier, AvatarRuntimeTelemetry, ProceduralRigHandles, VisemeWeights, ProceduralPoseOutput, @pixiv/three-vrm (+1 more)

### Community 33 - "test_e2e_lifecycle.py"
Cohesion: 0.26
Nodes (4): _make_16k_pcm_frame(), _recv_until_type(), test_phase4_complete_e2e_interview_lifecycle_and_security_guardrails(), test_phase4_rest_completion_with_csat_and_report()

### Community 34 - "MockInterviewHarness.ts"
Cohesion: 0.17
Nodes (12): isSimulatorModeEnabled(), resolveSessionToken(), DEFAULT_INTERVIEW_STAGES, MockHarnessListeners, STAGE_AI_PROMPTS, SYNTH_SAMPLE_RATE, SyntheticSyllableSpec, VOWEL_CYCLE (+4 more)

### Community 35 - "ws.types.ts"
Cohesion: 0.13
Nodes (18): InterviewStoreState, LiveTranscriptItem, CandidateSessionMetadataResponse, InterviewStageId, TranscriptSpeaker, ClientBargeInFrame, ClientEndSessionFrame, ClientMicStateFrame (+10 more)

### Community 36 - "conftest.py"
Cohesion: 0.05
Nodes (17): build_error_payload(), generate_request_id(), register_exception_handlers(), handle_app_error(), handle_http_exception(), handle_unexpected_exception(), handle_validation_error(), init_db() (+9 more)

### Community 37 - "evaluator_service.py"
Cohesion: 0.12
Nodes (9): InterviewTranscript, CompetencyScoreItemDto, EvaluationReportLLMOutput, RubricConfigDto, SupportingQuoteDto, TranscriptSpeaker, PostInterviewEvaluationService, verify_and_anchor_supporting_quotes() (+1 more)

### Community 39 - "InterviewWsClient"
Cohesion: 0.25
Nodes (3): InterviewWsClient, ClientToServerControlFrame, MicStateReason

### Community 40 - "MicCaptureManager"
Cohesion: 0.08
Nodes (18): 2. Scope & Key Decisions, 3. Action Plan & Checklist, 4. Verification Criteria, 5. Implementation Log & Actual Changes, Plan: Fix AI Interviewer Audio Playback Cutoffs (Echo Barge-In Loop) & Smooth 3D VRM Animation, 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist (+10 more)

### Community 41 - "3.6 Fungsi 6: Automated Transcript & Competency Evaluation Report"
Cohesion: 0.50
Nodes (4): 3.6 Fungsi 6: Automated Transcript & Competency Evaluation Report, A. Pencatatan Transkrip Dua Arah Real-Time, B. Mesin Evaluasi Pasca-Wawancara (*Post-Interview Evaluation Worker*), C. Skema Rubrik & Struktur Laporan Evaluasi

### Community 42 - "test_ws_relay.py"
Cohesion: 0.25
Nodes (3): _receive_until_json_type(), test_websocket_full_lifecycle_audio_barge_in_stage_resumption_and_evaluation(), test_websocket_jwt_close_codes_4001_4002_4003()

### Community 43 - "Plan: Workspace Preparation, Documentation Governance & Graphify Setup"
Cohesion: 0.20
Nodes (10): 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist, 4. Verification Criteria, 5. Implementation Log & Actual Changes, Deviations from Original Plan, Files Created / Modified, Knowledge Graph (`graphify`) Sync Status (+2 more)

### Community 44 - "2. Considered Options"
Cohesion: 0.33
Nodes (6): 1. Context & Problem Statement, 2. Considered Options, 3. Decision Outcome, 4. Consequences & Trade-offs, ADR-003: Warm Minimalist Design System & Clean Candidate/Recruiter UX, Justification / Rationale

### Community 45 - "Real-Time AI Interviewer Platform (3D WebGL VRM + Full-Duplex Audio + Evidence-Anchored Rubric Engine)"
Cohesion: 0.15
Nodes (13): 1. Arsitektur Sistem & Single Source of Truth (Contracts), 2. Fitur Utama & Guardrails Keamanan, 3. Struktur Direktori, 4. Menjalankan Secara Lokal (Development & Dual-Mode Switch), 5. Menjalankan Automated Test Suite & Verifikasi E2E, 6. Deployment dengan Docker Compose & Google Cloud Run, A. Menjalankan Backend (`http://127.0.0.1:8000`), A. Menjalankan Stack Penuh dengan Docker Compose (`PostgreSQL 16 + Backend + Frontend`) (+5 more)

### Community 46 - "4.1 Rincian Layar & Komponen UI"
Cohesion: 0.29
Nodes (7): 1. Layar 1: Pre-Interview Lobby & Device Check (`/interview/:sessionId/lobby`), 2. Layar 2: Main Interview Room (`/interview/:sessionId/room`), 3. Layar 3: Post-Interview Summary / Thank You Screen (`/interview/:sessionId/completed`), 4.1 Rincian Layar & Komponen UI, 4.2 Unified Frontend State Machine (`stateDiagram-v2`), 4. Frontend Specifications (UI/UX, Components & State Machine), 4. Layar 4: Recruiter Setup & Evaluation Report View (`/admin/sessions` & `/admin/sessions/:sessionId/report`)

### Community 47 - "5. Backend Specifications (WebSocket Relay Protocol, APIs & Guardrails)"
Cohesion: 0.50
Nodes (4): 5.1 REST API Endpoints Specification, 5.3 Backend Dual-Loop Concurrency Architecture (`asyncio.TaskGroup`), 5.4 Prompt Engineering & Anti-Jailbreak Guardrails, 5. Backend Specifications (WebSocket Relay Protocol, APIs & Guardrails)

### Community 48 - "MockInterviewHarness"
Cohesion: 0.17
Nodes (5): generateSyntheticFormantPcm24k(), MockInterviewHarness, AvatarEmotion, AvatarStateId, AvatarStateFrame

### Community 52 - "1. Executive Summary, Product Vision & Goals"
Cohesion: 0.40
Nodes (5): 1.1 Problem Statement, 1.2 Product Vision & Value Proposition, 1.3 User Personas & Core Use Cases, 1.4 Success Metrics (KPIs), 1. Executive Summary, Product Vision & Goals

### Community 53 - "6. End-to-End Workflows (Sequence & Architecture Diagrams)"
Cohesion: 0.40
Nodes (5): 6.1 Workflow 1: Session Creation, Candidate Onboarding & WebSocket Handshake, 6.2 Workflow 2: Real-Time Full-Duplex Audio Streaming & Client-Side VRM Lip-Sync Loop, 6.3 Workflow 3: Barge-In (Natural Interruption) & Instant Audio Buffer Flush, 6.4 Workflow 4: Session Termination & Asynchronous Evaluation Report Generation, 6. End-to-End Workflows (Sequence & Architecture Diagrams)

### Community 54 - "7. Edge Cases, Resilience & Failure Modes"
Cohesion: 0.40
Nodes (5): 7.1 Network Drop / WebSocket Disconnect & Session Resumption, 7.2 Candidate Silence / Dead Air (Kandidat Terdiam Lama), 7.3 Audio Hardware Failure, Permission Revoked & Browser Autoplay Policy, 7.4 Low-End Device Performance Degradation (Adaptive 3D Quality Scaling), 7. Edge Cases, Resilience & Failure Modes

### Community 56 - "Plan: Phase 3 — Backend Development & Standalone Validation (`backend/`)"
Cohesion: 0.33
Nodes (6): 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist, 4. Verification Criteria (Gate Validasi Fase 3), 5. Implementation Log & Actual Changes, Plan: Phase 3 — Backend Development & Standalone Validation (`backend/`)

### Community 57 - "DESIGN.md — Warm Minimalist Design System & Frontend UI Specification"
Cohesion: 0.18
Nodes (10): 1. Visi Estetika & Filosofi Desain (Warm Minimalist), 2. Palet Warna (Color Tokens), 3. Tipografi (Typography), 4. Navigasi Header & Pemisahan Peran (Role-Separated Header), 5. Spesifikasi Halaman Kandidat (Candidate Experience), 6. Spesifikasi Halaman Recruiter / Admin (Clean Business UI), A. Lobby Persiapan — Wizard 3-Tahap ([`CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx)), B. Ruang Wawancara Utama — Resizable Split-Pane ([`InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx)) (+2 more)

### Community 60 - "2. Considered Options"
Cohesion: 0.20
Nodes (10): 1. Context & Problem Statement, 2. Considered Options, 3. Decision Outcome, 4. Consequences & Trade-offs, A. Backend Relay Framework, ADR-002: Backend Tech Stack, Hybrid WebSocket Framing & Session State Architecture, B. WebSocket Transport Framing (Client <-> Backend Relay), C. Frontend Client Stack (+2 more)

### Community 67 - "DeterministicGeminiLiveSession"
Cohesion: 0.18
Nodes (7): DeterministicGeminiLiveSession, 1. Context & Problem Statement, 2. Considered Options, 3. Decision Outcome, 4. Consequences & Trade-offs, ADR-004: Vertex AI Gemini Multimodal Live API (`gemini-live-2.5-flash-native-audio`) via ADC & Billing Guardrails, Justification / Rationale

### Community 68 - "GoogleGenAIGeminiLiveSession"
Cohesion: 0.15
Nodes (11): GoogleGenAIGeminiLiveSession, 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist, 4. Verification Criteria, 5. Implementation Log & Actual Changes, Deviations from Original Plan, Files Created / Modified (+3 more)

### Community 69 - "Contract 2: Audio Pipeline & Lip-Sync Signal Specification (`audio-pipeline-spec.md`)"
Cohesion: 0.20
Nodes (10): 1. End-to-End Audio Format Summary, 2.1 Browser `getUserMedia` Constraints, 2.2 Downsampling & Quantization di `pcm-capture-processor.ts`, 2.3 Local VAD untuk Audio Ducking (Fast Barge-In Assist), 2. Upstream Capture Specification (`AudioWorkletNode`), 3.1 Web Audio Node Graph Topology, 3.2 Gapless Scheduling & Barge-In Flush Rules, 3. Downstream Playback & Analyser Graph Specification (+2 more)

### Community 70 - "Plan: Phase 1 — Master Implementation Workflow & Complete Data Contracts"
Cohesion: 0.20
Nodes (10): 1. Objective & Context, 2. Scope & Key Decisions, 3. Action Plan & Checklist, 4. Verification Criteria (Phase 1 Validation Gate), 5. Implementation Log & Actual Changes, Deviations from Original Plan, Files Created / Modified, Knowledge Graph (`graphify`) Sync Status (+2 more)

### Community 71 - ".send_realtime_audio"
Cohesion: 0.23
Nodes (3): compute_pcm16_rms(), generate_pcm24k_formant_chunk(), _generate_pcm16k_speech_frame()

## Knowledge Gaps
- **9 isolated node(s):** `ai-interviewer-backend`, `@types/react`, `@types/react-dom`, `@types/three`, `autoprefixer` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 616 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `PcmStreamPlayer` connect `PcmStreamPlayer` to `Contract 2: Audio Pipeline & Lip-Sync Signal Specification (`audio-pipeline-spec.md`)`, `InterviewRoomPage`, `audioAndVrmEngine.test.ts`, `STATE.md`, `3.2 JSON Control Frames (Backend -> Client)`, `MicCaptureManager`, `3. Rincian Eksekusi & Gate Validasi per Fase`, `2. Considered Options`, `VrmAvatarEngine`, `3. Core Functionalities (Deep-Dive Specifications)`, `Plan: Comprehensive PRD, ADR-002 & Initial System Contracts`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Are the 24 inferred relationships involving `InterviewRepository` (e.g. with `get_session_report()` and `complete_session()`) actually correct?**
  _`InterviewRepository` has 24 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ai-interviewer-backend`, `@types/react`, `@types/react-dom` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `api.types.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.06289308176100629 - nodes in this community are weakly interconnected._
- **Why does `GoogleGenAIGeminiLiveSession` connect `GoogleGenAIGeminiLiveSession` to `DeterministicGeminiLiveSession`, `PcmStreamPlayer`, `evaluator_service.py`, `.send_realtime_audio`, `MicCaptureManager`, `sessions.py`, `GeminiLiveEvent`, `._hard_duration_watchdog`, `.send_text_cue`, `session_orchestrator.py`?**
  _High betweenness centrality (0.145) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `InterviewStageId` (e.g. with `get_session_report()` and `create_session()`) actually correct?**
  _`InterviewStageId` has 22 INFERRED edges - model-reasoned connections that need verification._
- **Should `get_session_metadata` be split into smaller, more focused modules?**
  _Cohesion score 0.10344827586206896 - nodes in this community are weakly interconnected._