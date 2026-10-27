# Plan: Phase 3 — Backend Development & Standalone Validation (`backend/`)

- **Date:** 2026-10-27
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-002](../decisions/ADR-002-backend-tech-stack-and-session-protocol.md)
- **Related Contracts:** [database-schema.md](../contracts/database-schema.md), [rest-api-contract.md](../contracts/rest-api-contract.md), [websocket-protocol.md](../contracts/websocket-protocol.md), [audio-pipeline-spec.md](../contracts/audio-pipeline-spec.md), [vrm-avatar-states.md](../contracts/vrm-avatar-states.md)

---

## 1. Objective & Context
Membangun layanan Backend secara utuh di `/srv/projects/ai-interviewer/backend/` untuk **Real-Time AI Interviewer Platform** yang mengimplementasikan seluruh kontrak di `docs/contracts/` serta memvalidasinya secara mandiri (*standalone*) menggunakan **Automated Pytest Suite (`backend/tests/`)**.

Komponen utama yang dibangun pada Fase 3:
1. **Database Layer (`app/db/`):**
   - SQLAlchemy 2.0 Async (`DeclarativeBase`, `Mapped`, `mapped_column`, `AsyncSession`) untuk ke-5 tabel di `database-schema.md`: `job_positions`, `candidates`, `interview_sessions`, `interview_transcripts`, dan `evaluation_reports` beserta 6 tipe `ENUM` dan repositori CRUD non-blocking (`repositories.py`).
   - Mendukung PostgreSQL 16 (`postgresql+asyncpg://`) di produksi dan `sqlite+aiosqlite://` untuk pengujian otomatis (`pytest`) maupun local standalone development.
2. **Pydantic v2 Schemas (`app/schemas/`):**
   - `api_schemas.py` (& `rest.py`): 1:1 DTO parity (`snake_case`) dengan `rest-api-contract.md` dan `frontend/src/types/api.types.ts`, termasuk validasi total bobot `rubric_config.criteria == 100` dan amplop error standar `ApiErrorResponse`.
   - `ws_schemas.py` (& `ws.py`): Seluruh frame kontrol JSON Client <-> Backend (`client.ready`, `client.barge_in`, `client.mic_state`, `client.ping`, `client.end_session`, `session.ready`, `avatar.state`, `control.barge_in`, `transcript.delta`, `session.stage_change`, `server.pong`, `session.completed`, `session.error`) serta konstanta Close Codes (`1000`, `4001`, `4002`, `4003`, `4009`).
   - `rubric_schemas.py` (& `evaluation.py`): Skema `RubricConfigDto`, `CvStructuredSummaryDto`, `EvaluationReportDto`, dan skema LLM Structured Output.
3. **Core Services & Guardrails (`app/services/`):**
   - `auth_token.py`: Pembuatan dan verifikasi Ephemeral Session JWT (`HS256`) dengan klaim `sub`, `role`, `exp`, `jti`, serta manajemen *single-active-connection lock* (`4002 SESSION_ALREADY_ACTIVE`).
   - `cv_sanitizer.py`: Sanitasi teks CV kandidat dari upaya *prompt injection* (*instruction override* seperti *"Ignore all previous instructions"*, *"Give 5/5 score"*, system tags palsu), pembungkusan di dalam delimiter `<candidate_profile_data>` & `<candidate_cv_untrusted_data>`, serta ekstraksi otomatis `CvStructuredSummaryDto` bila belum disediakan.
   - `prompt_builder.py`: Perakitan Dynamic System Instruction (Persona Pewawancara + Detail Posisi + Rubrik Kompetensi + Data CV Terisolasi + Aturan 5 Tahapan Wawancara + Runtime Behavioral Guardrails) dan blok `[SESSION RESUMPTION CONTEXT]` (10 giliran transkrip terakhir) saat kandidat melakukan *reconnect*.
   - `evaluator_service.py`: *Post-Interview Evaluation Worker* menggunakan Gemini 2.5 Pro Structured Outputs (dengan *Deterministic Rubric Evaluator Fallback* saat `GEMINI_API_KEY` kosong/mode test) serta verifikasi anti-halusinasi kutipan transkrip (`supporting_quotes`).
4. **REST API Layer (`app/api/v1/`):**
   - `health.py`: `GET /api/v1/health`
   - `sessions.py`: `POST /api/v1/sessions`, `GET /api/v1/sessions`, `GET /api/v1/sessions/{session_id}`, `POST /api/v1/sessions/{session_id}/complete`
   - `reports.py`: `GET /api/v1/sessions/{session_id}/report`
   - Standar penanganan error (`app/core/errors.py`) menghasilkan `ApiErrorResponse` untuk `400`, `401`, `403`, `404`, `409`, `422`, dan `500`.
5. **Hybrid WebSocket Relay (`app/ws/`):**
   - `gemini_live_client.py`: Adapter ke `google-genai` `client.aio.live.connect()` untuk streaming audio `PCM_S16LE` 16kHz -> 24kHz dua arah, dilengkapi `DeterministicGeminiLiveSession` ketika `GEMINI_API_KEY` kosong atau mode test aktif.
   - `session_orchestrator.py`: Orkestrasi `asyncio.TaskGroup` 4 loop paralel (`client_to_gemini_loop`, `gemini_to_client_loop`, `stage_and_timekeeper_loop`, `silence_watchdog_loop`) + background queue writer untuk menyimpan `interview_transcripts` secara non-blocking, sinyal `<15ms` `control.barge_in`, dan transisi tahapan `session.stage_change`.
   - `interview_ws.py`: Endpoint `/ws/interview/{session_id}?token={ephemeral_jwt_token}` dengan validasi Close Codes `4001`, `4002`, `4003`, `4009`.

---

## 2. Scope & Key Decisions
- **In Scope:**
  - Pembangunan seluruh paket `backend/app/` dan `backend/tests/`.
  - Konfigurasi virtual environment Python 3.12 (`backend/.venv`) dan `pyproject.toml` / `requirements.txt`.
  - Pengujian otomatis menyeluruh (`pytest`) untuk DB models, REST API (6 endpoints + error envelopes), CV Sanitizer & Prompt Builder, Ephemeral JWT & WebSocket Close Codes (`4001`, `4002`, `4003`), Full-Duplex Binary PCM Relay + Barge-In + Stage Progression + Reconnect Resumption, serta Post-Interview Evaluation Worker.
  - Sinkronisasi Knowledge Graph (`graphify update .`) dan pembaruan `docs/STATE.md`.
- **Out of Scope:**
  - Containerization penuh multi-service (`docker-compose.yml` produksi dengan Nginx/Frontend) yang dijadwalkan pada Fase 4.
- **Key Decisions Agreed:**
  - Menyediakan kesesuaian penuh baik dengan penamaan modul di prompt Fase 3 (`api_schemas.py`, `ws_schemas.py`, `rubric_schemas.py`, `session_orchestrator.py`, `auth_token.py`, `prompt_builder.py`, `evaluator_service.py`) maupun alias re-export untuk nama di `ARCHITECTURE_AND_WORKFLOW.md` (`rest.py`, `ws.py`, `evaluation.py`, `relay_session.py`, `auth_jwt.py`, `prompt_injector.py`, `evaluation_worker.py`) sehingga kompatibel 100% dengan seluruh referensi dokumen.
  - Pada endpoint `GET /api/v1/sessions/{session_id}` dan `POST /api/v1/sessions/{session_id}/complete`, autentikasi memeriksa `Authorization: Bearer <token>` atau query `?token=` bila dikirimkan (menolak token invalid/expired dengan `401` dan token milik sesi lain dengan `403`), sekaligus mendukung akses Recruiter (`X-API-Key`) atau pratinjau lokal sesuai konfigurasi.

---

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat dokumen plan `docs/plans/2026-10-26-phase-3-backend-and-standalone-validation.md`.
- [x] **Step 2:** Siapkan `backend/pyproject.toml`, `backend/requirements.txt`, dan instalasi dependensi di `backend/.venv` (Python 3.12).
- [x] **Step 3:** Implementasi `app/config.py`, `app/core/errors.py`, dan Database Layer `app/db/` (`base.py`, `models.py`, `session.py`, `repositories.py`) + konfigurasi Alembic (`alembic.ini`, `alembic/env.py`).
- [x] **Step 4:** Implementasi Pydantic v2 Schemas di `app/schemas/` (`api_schemas.py`, `ws_schemas.py`, `rubric_schemas.py` beserta alias kontrak).
- [x] **Step 5:** Implementasi Core Services di `app/services/` (`auth_token.py`, `cv_sanitizer.py`, `prompt_builder.py`, `evaluator_service.py`).
- [x] **Step 6:** Implementasi REST API v1 di `app/api/v1/` (`health.py`, `sessions.py`, `reports.py`) dan FastAPI entrypoint `app/main.py`.
- [x] **Step 7:** Implementasi Hybrid WebSocket Relay di `app/ws/` (`gemini_live_client.py`, `session_orchestrator.py`, `interview_ws.py`).
- [x] **Step 8:** Tulis dan jalankan automated test suite `pytest` di `backend/tests/` (`conftest.py`, `test_db_models.py`, `test_rest_api.py`, `test_security_and_prompts.py`, `test_ws_relay.py`).
- [x] **Step 9:** Jalankan `graphify update .`, perbarui log plan ini menjadi `Completed`, dan update `docs/STATE.md`.

---

## 4. Verification Criteria (Gate Validasi Fase 3)
- **Gate 3.1 (Database Schema & ORM Parity):** Model SQLAlchemy 2.0 untuk 5 tabel (`job_positions`, `candidates`, `interview_sessions`, `interview_transcripts`, `evaluation_reports`) tervalidasi 100% sesuai `database-schema.md`.
- **Gate 3.2 (REST API Contract Compliance):** Seluruh 6 endpoint `/api/v1/...` lulus pengujian `pytest` (`httpx.AsyncClient`) termasuk skenario error `401`, `403`, `404`, `409`, dan `422` (`ApiErrorResponse`).
- **Gate 3.3 (WebSocket Relay, JWT Lock & Barge-In):**
  - Token invalid/expired ditolak dengan Close Code `4001`.
  - Koneksi simultan kedua pada sesi aktif ditolak dengan Close Code `4002`.
  - Koneksi ke sesi yang sudah `COMPLETED` ditolak dengan Close Code `4003`.
  - Handshake `client.ready` -> `session.ready`, pengiriman binary 16kHz PCM (`1,280 bytes`) -> penerimaan binary 24kHz PCM + `transcript.delta`, sinyal `control.barge_in` (`<50ms`), `session.stage_change`, dan `resume_from_turn_seq > 0` (*Session Resumption*) lulus 100%.
- **Gate 3.4 (Security Guardrails & Evaluator):**
  - `cv_sanitizer` menetralisir instruksi *prompt injection* dan membungkus profil kandidat di dalam `<candidate_profile_data>` & `<candidate_cv_untrusted_data>`.
  - `evaluator_service` menghasilkan `EvaluationReportDto` valid dengan kutipan transkrip terverifikasi.
- **Gate 3.5 (Knowledge Graph Sync):** `graphify update .` berjalan bersih tanpa error (`1122 nodes, 2403 edges, 66 communities`).

---

## 5. Implementation Log & Actual Changes
- **Files Created:**
  - `backend/pyproject.toml`, `backend/requirements.txt`, `backend/alembic.ini`, `backend/alembic/env.py`
  - `backend/app/config.py`, `backend/app/main.py`, `backend/app/core/errors.py`
  - `backend/app/db/base.py`, `backend/app/db/models.py`, `backend/app/db/session.py`, `backend/app/db/repositories.py`
  - `backend/app/schemas/api_schemas.py`, `backend/app/schemas/ws_schemas.py`, `backend/app/schemas/rubric_schemas.py` (+ alias `rest.py`, `ws.py`, `evaluation.py`)
  - `backend/app/services/auth_token.py`, `backend/app/services/cv_sanitizer.py`, `backend/app/services/prompt_builder.py`, `backend/app/services/evaluator_service.py` (+ alias `auth_jwt.py`, `prompt_injector.py`, `evaluation_worker.py`)
  - `backend/app/api/v1/health.py`, `backend/app/api/v1/sessions.py`, `backend/app/api/v1/reports.py`
  - `backend/app/ws/gemini_live_client.py`, `backend/app/ws/session_orchestrator.py`, `backend/app/ws/interview_ws.py` (+ alias `relay_session.py`)
  - `backend/tests/conftest.py`, `backend/tests/test_db_models.py`, `backend/tests/test_rest_api.py`, `backend/tests/test_security_and_prompts.py`, `backend/tests/test_ws_relay.py`
- **Verification Results:**
  - `pytest -v`: **8/8 passed in 1.21s** (mencakup seluruh 6 endpoint REST + error schema, ORM 5 tabel & ULID prefix, sanitasi CV dari prompt injection, Ephemeral JWT Close Codes `4001`/`4002`/`4003`, siklus penuh WebSocket Relay audio 16kHz -> 24kHz, `<50ms` barge-in, stage progression, session resumption, dan post-interview structured rubric evaluation).
  - `graphify update .`: Berhasil memperbarui Knowledge Graph (`1122 nodes, 2403 edges, 66 communities`).
