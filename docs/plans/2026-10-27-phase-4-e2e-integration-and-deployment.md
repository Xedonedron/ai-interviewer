# Plan: Phase 4 — End-to-End Integration, Containerization & Full System Validation

- **Date:** 2026-10-27
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-002](../decisions/ADR-002-backend-tech-stack-and-session-protocol.md)
- **Related Contracts:** [websocket-protocol.md](../contracts/websocket-protocol.md), [audio-pipeline-spec.md](../contracts/audio-pipeline-spec.md), [vrm-avatar-states.md](../contracts/vrm-avatar-states.md), [database-schema.md](../contracts/database-schema.md), [rest-api-contract.md](../contracts/rest-api-contract.md)

---

## 1. Objective & Context
Setelah **Fase 1** (Data Contracts), **Fase 2** (`frontend/` + Standalone Simulator), dan **Fase 3** (`backend/` + Automated Pytest Suite) selesai 100%, **Fase 4** menyatukan seluruh subsistem ke dalam mode integrasi penuh (*Live Backend Mode* dengan *Dual-Mode Switch* ke Simulator), menyiapkan paket kontainerisasi produksi (`Dockerfile`, `nginx.conf`, `docker-compose.yml`), serta menjalankan pengujian **End-to-End (E2E) Lifecycle, Performance & Security Audit** sesuai Gate 4.1 s/d Gate 4.4 pada [ARCHITECTURE_AND_WORKFLOW.md](../ARCHITECTURE_AND_WORKFLOW.md).

---

## 2. Scope & Key Decisions
- **In Scope:**
  1. **Integrasi Penuh Frontend <-> Backend (Dual-Mode Transport):**
     - Penyelarasan `frontend/vite.config.ts` (`/api` -> `http://127.0.0.1:8000` dan `/ws` -> `ws://127.0.0.1:8000`) dan variabel lingkungan (`VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_USE_MOCK_SIMULATOR=false` secara default dengan toggle `?mock=true` ke Simulator).
     - Penyediaan modul client di `frontend/src/services/apiClient.ts` (& `frontend/src/services/api/apiClient.ts`) serta `frontend/src/services/wsClient.ts` (& `frontend/src/services/ws/interviewWsClient.ts`) dengan paritas DTO 100% terhadap `backend/app/api/v1/` dan `backend/app/ws/`.
     - Penyediaan file `.env.example` di root `/srv/projects/ai-interviewer/.env.example`, `frontend/.env.example`, dan `backend/.env.example`.
  2. **Containerization & Cloud Run Deployment Readiness (Gate 4.3):**
     - `backend/Dockerfile` (Python 3.12-slim, non-root user `appuser`, `uvicorn` dengan `uvloop`/`httptools`, `HEALTHCHECK`) dan `backend/.dockerignore`.
     - `frontend/Dockerfile` (Multi-stage Node 20 Alpine build -> Nginx 1.27 Alpine runtime) + `frontend/nginx.conf` (reverse proxy `/api/` dan upgrade WebSocket `/ws/interview/`, SPA fallback) + `frontend/.dockerignore`.
     - `docker-compose.yml` (PostgreSQL 16 Alpine + Backend FastAPI + Frontend Nginx) dan skrip verifikasi otomatis `scripts/verify_e2e.sh`.
     - Pembaruan menyeluruh `README.md` (arsitektur, panduan menjalankan lokal, dual-mode simulator vs live backend, pengujian `vitest` & `pytest`, serta panduan `docker compose` & Google Cloud Run).
  3. **End-to-End Verification & Security Audit (Gate 4.1 & Gate 4.2):**
     - Pembuatan dan eksekusi `backend/tests/test_e2e_lifecycle.py` yang menguji siklus hidup utuh dari Recruiter Session Setup (`POST /api/v1/sessions`) -> Dashboard (`GET /api/v1/sessions`) -> Candidate Lobby (`GET /api/v1/sessions/{id}`) -> Full-Duplex WebSocket Audio (`16kHz -> 24kHz PCM`), `<50ms` Barge-In, Stage Progression, Auto-Reconnect (`resume_from_turn_seq`), Completion (`client.end_session` & `POST /complete`), hingga Evaluation Report (`GET /api/v1/sessions/{id}/report`) beserta verifikasi kutipan verbatim.
     - Audit keamanan: memastikan **0 kebocoran `GEMINI_API_KEY`** di seluruh kode dan hasil build `frontend/dist/`.
  4. **Final Documentation & Graph Sync (Gate 4.4):**
     - Eksekusi `graphify update .`, penandaan seluruh checklist Gate Fase 2, 3, dan 4 di `docs/ARCHITECTURE_AND_WORKFLOW.md`, dan pembaruan `docs/STATE.md` ke status **100% COMPLETED**.

---

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat dokumen plan `docs/plans/2026-10-27-phase-4-e2e-integration-and-deployment.md`.
- [x] **Step 2:** Selaraskan konfigurasi integrasi `frontend/vite.config.ts`, `frontend/src/services/apiClient.ts` (+ `src/services/api/apiClient.ts`), `frontend/src/services/wsClient.ts` (+ `src/services/ws/interviewWsClient.ts`), dan halaman UI terkait, serta buat `.env.example` di root, `frontend/`, dan `backend/`.
- [x] **Step 3:** Buat artefak kontainerisasi & deployment (`backend/Dockerfile`, `backend/.dockerignore`, `frontend/Dockerfile`, `frontend/nginx.conf`, `frontend/.dockerignore`, `docker-compose.yml`, dan `scripts/verify_e2e.sh`).
- [x] **Step 4:** Perbarui `README.md` utama secara komprehensif.
- [x] **Step 5:** Tulis dan jalankan `backend/tests/test_e2e_lifecycle.py` serta `scripts/verify_e2e.sh` (mencakup live server E2E check, `vitest run`, `vite build`, `pytest`, dan audit kebocoran `GEMINI_API_KEY`).
- [x] **Step 6:** Jalankan `graphify update .`, tandai seluruh checklist Gate di `docs/ARCHITECTURE_AND_WORKFLOW.md`, perbarui plan ini menjadi `Completed`, dan update `docs/STATE.md` bahwa seluruh 4 Fase telah **100% COMPLETED**.

---

## 4. Verification Criteria (Gate Validasi Fase 4)
- **Gate 4.1 (Full E2E Lifecycle Pass):** Siklus hidup penuh Recruiter Setup -> Session List -> Candidate Lobby -> WebSocket Handshake & Audio Streaming 16kHz/24kHz -> `<50ms` Barge-In -> Stage Progression -> Reconnect Resumption -> Session Completion -> Structured Evaluation Report lulus 100% pada `pytest` (`test_e2e_lifecycle.py`) dan live server E2E verification (`scripts/verify_e2e.sh`).
- **Gate 4.2 (Performance & Security Guardrail Compliance):**
  - `0` kemunculan `GEMINI_API_KEY` atau rahasia backend di `frontend/src/` maupun `frontend/dist/`.
  - Latensi sinyal *barge-in* di backend `< 15ms` dan *audio playback queue flush* di browser `< 50ms`.
  - Seluruh rendering 3D VRM dan ekstraksi viseme FFT berjalan di sisi browser.
- **Gate 4.3 (Containerization & Deployment Readiness):** `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, dan `docker-compose.yml` tersedia dan tervalidasi.
- **Gate 4.4 (Final Documentation & Graph Sync):** `graphify update .` berjalan bersih, checklist `ARCHITECTURE_AND_WORKFLOW.md` dan `STATE.md` 100% selesai.

---

## 5. Implementation Log & Actual Changes
- **Frontend <-> Backend Full Integration & Dual-Mode Switch:**
  - Memperbarui [`frontend/vite.config.ts`](../../frontend/vite.config.ts) dengan proxy `/api` -> `http://127.0.0.1:8000` dan `/ws` -> `ws://127.0.0.1:8000` (dengan dukungan `VITE_BACKEND_PROXY_TARGET`).
  - Memperbarui [`frontend/src/services/apiClient.ts`](../../frontend/src/services/apiClient.ts) (+ re-export di [`frontend/src/services/api/apiClient.ts`](../../frontend/src/services/api/apiClient.ts)) serta [`frontend/src/services/wsClient.ts`](../../frontend/src/services/wsClient.ts) (+ re-export di [`frontend/src/services/ws/interviewWsClient.ts`](../../frontend/src/services/ws/interviewWsClient.ts)) untuk mendukung `VITE_API_BASE_URL`, `VITE_WS_BASE_URL`, `VITE_USE_MOCK_SIMULATOR=false` secara default, serta resolusi token otomatis (`cacheSessionToken`/`resolveSessionToken`).
  - Menyempurnakan [`frontend/src/App.tsx`](../../frontend/src/App.tsx), [`frontend/src/pages/RecruiterSetupPage.tsx`](../../frontend/src/pages/RecruiterSetupPage.tsx), dan [`frontend/src/pages/InterviewCompletedPage.tsx`](../../frontend/src/pages/InterviewCompletedPage.tsx) agar alur live WebSocket dan REST completion berjalan mulus.
  - Membuat file konfigurasi lingkungan [`.env.example`](../../.env.example), [`frontend/.env.example`](../../frontend/.env.example), dan [`backend/.env.example`](../../backend/.env.example).
- **Containerization & Cloud Run Deployment Readiness (Gate 4.3):**
  - Membuat [`backend/Dockerfile`](../../backend/Dockerfile) (Python 3.12-slim, non-root `appuser`, `uvicorn` + `uvloop` + `httptools`, `HEALTHCHECK`) dan [`backend/.dockerignore`](../../backend/.dockerignore).
  - Membuat [`frontend/Dockerfile`](../../frontend/Dockerfile) (Multi-stage Node 20 Alpine build -> Nginx 1.27 Alpine), [`frontend/nginx.conf`](../../frontend/nginx.conf) (proxy `/api/`, WebSocket upgrade `/ws/interview/` dengan `proxy_buffering off` dan timeout `3600s`, SPA fallback), dan [`frontend/.dockerignore`](../../frontend/.dockerignore).
  - Membuat [`docker-compose.yml`](../../docker-compose.yml) (PostgreSQL 16 Alpine + Backend FastAPI + Frontend Nginx), [`scripts/verify_e2e.sh`](../../scripts/verify_e2e.sh), serta memperbarui [`README.md`](../../README.md).
- **End-to-End Verification & Security Audit (Gate 4.1 & Gate 4.2):**
  - Menambahkan metode [`mark_turn_interrupted`](../../backend/app/db/repositories.py) dan menyempurnakan manajemen lifecycle transaksi database di [`InterviewSessionOrchestrator`](../../backend/app/ws/session_orchestrator.py).
  - Membuat dan menjalankan [`backend/tests/test_e2e_lifecycle.py`](../../backend/tests/test_e2e_lifecycle.py): seluruh **10/10 test suite backend (`pytest`)** dan **10/10 test suite frontend (`vitest`)** lulus 100%, termasuk audit `0` kemunculan `GEMINI_API_KEY` di `frontend/src` & `frontend/dist` melalui [`scripts/verify_e2e.sh`](../../scripts/verify_e2e.sh).
