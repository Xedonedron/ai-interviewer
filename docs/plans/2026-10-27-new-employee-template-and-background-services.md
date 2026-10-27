# Plan: Background Services Startup & New Employee Template (Data Platform & AI Systems Engineer)

- **Tanggal:** 2026-10-27
- **Status:** Completed
- **Related ADRs:** [ADR-001](file:///srv/projects/ai-interviewer/docs/decisions/ADR-001-core-architecture.md), [ADR-002](file:///srv/projects/ai-interviewer/docs/decisions/ADR-002-backend-tech-stack-and-session-protocol.md), [ADR-003](file:///srv/projects/ai-interviewer/docs/decisions/ADR-003-warm-minimalist-design-system.md), [ADR-004](file:///srv/projects/ai-interviewer/docs/decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md)

---

## 1. Tujuan & Konteks
1. **Menjalankan Sistem di Background (`IsDaemon: true`):**
   - Ditemukan bahwa port `8000` di host sedang digunakan oleh proyek eksternal (`/opt/data/projects/primecare/backend`), sehingga request ke `/api/v1/health` pada port `8000` mengembalikan `404 Not Found`.
   - Solusi: Menjalankan backend FastAPI `ai-interviewer` secara background pada port khusus **`8010`** (`0.0.0.0:8010`), mengarahkan proxy Vite frontend (`VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:8010`) ke port `8010`, dan menjalankan server Vite frontend di background pada **`0.0.0.0:5173`**.
2. **Memproses CV sebagai Template Karyawan Baru (`Data Platform & AI Systems Engineer`):**
   - Mengonversi dokumen LaTeX CV kandidat (**Nixon Daniel — Data Platform & AI Systems Engineer — Smartnet Magna Global / Institut Teknologi Del / Google Certified Professional**) menjadi template default pembuatan sesi wawancara (`INITIAL_CREATE_SESSION_TEMPLATE`, `DEFAULT_RUBRIC_CONFIG`, serta fixture sesi & metadata) di [`frontend/src/services/simulator/mockFixtures.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/simulator/mockFixtures.ts), [`MockInterviewHarness.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/simulator/MockInterviewHarness.ts), [`CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx), [`InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx), [`InterviewCompletedPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewCompletedPage.tsx), dan [`apiClient.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/apiClient.ts).
   - Memperkaya daftar ekstraksi skill (`_KNOWN_SKILLS`) di [`backend/app/services/cv_sanitizer.py`](file:///srv/projects/ai-interviewer/backend/app/services/cv_sanitizer.py) agar mencakup teknologi Data Platform & Applied AI dari CV (`BigQuery`, `Greenplum`, `Pub/Sub`, `Dataflow`, `Apache Beam`, `Apache Airflow`, `Cloud Composer`, `Vertex AI`, `Gemini`, `ChromaDB`, `pgvector`, `Next.js`, `Celery`, `Apache Spark`, `Apache Kafka`, `DuckDB`, `SQL`).
   - Melakukan *seeding* sesi wawancara langsung (`POST /api/v1/sessions`) ke database SQLite backend yang aktif agar sesi kandidat baru langsung tersedia dalam status `READY` di Dashboard Recruiter maupun Candidate Lobby.

---

## 2. Langkah Implementasi (Checklist)
- [x] **Step 1 — Update Template Kandidat & Rubrik Kompetensi di Frontend:**
  - Perbarui `DEFAULT_RUBRIC_CONFIG`, `INITIAL_CREATE_SESSION_TEMPLATE`, `MOCK_SESSIONS_LIST`, `MOCK_CANDIDATE_METADATA`, dan `MOCK_SESSION_REPORT` di [`frontend/src/services/simulator/mockFixtures.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/simulator/mockFixtures.ts) serta dialog di [`MockInterviewHarness.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/simulator/MockInterviewHarness.ts).
  - Perbarui fallback nama kandidat dan posisi di [`CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx), [`InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx), [`InterviewCompletedPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewCompletedPage.tsx), dan [`apiClient.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/apiClient.ts).
- [x] **Step 2 — Update Skill Extractor di Backend & Konfigurasi Proxy Port `8010`:**
  - Tambahkan skill Data Platform & Applied AI pada `_KNOWN_SKILLS` di [`backend/app/services/cv_sanitizer.py`](file:///srv/projects/ai-interviewer/backend/app/services/cv_sanitizer.py).
  - Perbarui `VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:8010` di [`frontend/.env`](file:///srv/projects/ai-interviewer/frontend/.env), [`frontend/.env.example`](file:///srv/projects/ai-interviewer/frontend/.env.example), dan fallback di [`frontend/vite.config.ts`](file:///srv/projects/ai-interviewer/frontend/vite.config.ts).
- [x] **Step 3 — Verifikasi Unit Test & Production Build:**
  - Jalankan `pytest` di `backend/` (`10/10 passed`) dan `vitest` (`14/14 passed`) + `npm run build` (`0 errors`) di `frontend/`.
- [x] **Step 4 — Jalankan Backend & Frontend secara Background (`IsDaemon: true`) & Seed Sesi Baru:**
  - Jalankan `uvicorn app.main:app --host 0.0.0.0 --port 8010` secara background.
  - Jalankan Vite dev server (`npm run dev -- --host 0.0.0.0 --port 5173`) secara background.
  - Seed sesi wawancara baru menggunakan payload template karyawan baru via `POST http://127.0.0.1:5173/api/v1/sessions` -> `session_id: ses_01m5xvgdc0ykwhcfzbs9a08nvc`.
- [x] **Step 5 — Sinkronisasi Graphify & Dokumentasi State:**
  - Jalankan `graphify update .` dan perbarui [`docs/STATE.md`](file:///srv/projects/ai-interviewer/docs/STATE.md).

---

## 3. Implementation Log & Actual Changes
- **Modified Files:**
  - [`frontend/src/services/simulator/mockFixtures.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/simulator/mockFixtures.ts) — Mengganti `INITIAL_CREATE_SESSION_TEMPLATE` dan `DEFAULT_RUBRIC_CONFIG` dengan profil lengkap **Nixon Daniel — Data Platform & AI Systems Engineer (Smartnet Magna Global / Institut Teknologi Del)** beserta 3 kriteria rubrik kompetensi (35% *Real-Time Streaming & BigQuery Medallion Architecture*, 35% *Enterprise Applied AI, Asynchronous RAG & Multi-Agent Systems*, 30% *Distributed MPP Database (Greenplum) & Query Optimization*).
  - [`frontend/src/services/simulator/MockInterviewHarness.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/simulator/MockInterviewHarness.ts) — Menyesuaikan prompt per tahap wawancara di simulator dengan CV Data Platform & AI Systems Engineer.
  - [`frontend/src/pages/CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx), [`frontend/src/pages/InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx), [`frontend/src/pages/InterviewCompletedPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewCompletedPage.tsx), [`frontend/src/services/apiClient.ts`](file:///srv/projects/ai-interviewer/frontend/src/services/apiClient.ts) — Memperbarui default nama kandidat (`Nixon Daniel`) dan posisi (`Data Platform & AI Systems Engineer`).
  - [`backend/app/services/cv_sanitizer.py`](file:///srv/projects/ai-interviewer/backend/app/services/cv_sanitizer.py) — Menambahkan daftar skill Data Platform & Applied AI ke `_KNOWN_SKILLS`.
  - [`frontend/vite.config.ts`](file:///srv/projects/ai-interviewer/frontend/vite.config.ts), [`frontend/.env`](file:///srv/projects/ai-interviewer/frontend/.env), [`frontend/.env.example`](file:///srv/projects/ai-interviewer/frontend/.env.example) — Mengarahkan `VITE_BACKEND_PROXY_TARGET` ke `http://127.0.0.1:8010`.
- **Live Seeded Session:**
  - `session_id`: `ses_01m5xvgdc0ykwhcfzbs9a08nvc`
  - `candidate_join_url`: `/interview/ses_01m5xvgdc0ykwhcfzbs9a08nvc/lobby?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJzZXNfMDFtNXh2Z2RjMHlrd2hjZnpiczlhMDhudmMiLCJyb2xlIjoiY2FuZGlkYXRlIiwianRpIjoianRpXzBkYTNjMzRkOWZmNGFmMTJjZWExN2Q3NDk0NDhiZDg3IiwiaWF0IjoxNzkzMDc3MDMyLCJleHAiOjE3OTMzMzYyMzJ9.XxmBifLGM8Pslxz6_Y8Wp7r131nr3qwML5qQ5MoxhBA`
