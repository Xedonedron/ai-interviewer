# Plan: Phase 1 — Master Implementation Workflow & Complete Data Contracts

- **Date:** 2026-10-26
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-002](../decisions/ADR-002-backend-tech-stack-and-session-protocol.md)

---

## 1. Objective & Context
Setelah menyelesaikan [PRD.md](../../PRD.md) dan mengunci [ADR-001](../decisions/ADR-001-core-architecture.md) serta [ADR-002](../decisions/ADR-002-backend-tech-stack-and-session-protocol.md), proyek **Real-Time AI Interviewer Platform** menerapkan **Contract-First Engineering Workflow** yang terbagi menjadi 4 Fase Berurutan dengan Gate Validasi ketat.

Tujuan dari **Fase 1** ini adalah:
1. Menyusun dokumen blueprint alur kerja rekayasa (**Master Implementation Workflow**) di [docs/ARCHITECTURE_AND_WORKFLOW.md](../ARCHITECTURE_AND_WORKFLOW.md) yang mendefinisikan urutan dependensi pengerjaan dari Fase 1 hingga Fase 4 beserta **Validation Gates (Definition of Done)** untuk setiap fase (termasuk cara menguji Frontend secara mandiri dengan *Mock WebSocket/Audio Simulator* pada Fase 2 dan menguji Backend secara mandiri dengan *Pytest Suite* pada Fase 3).
2. Menyusun kontrak skema database PostgreSQL 16 (`SQLAlchemy 2.0` + `JSONB`) secara menyeluruh di [docs/contracts/database-schema.md](../contracts/database-schema.md) lengkap dengan diagram ERD (`erDiagram` Mermaid), DDL/kolom, `ENUM`, indeks, dan JSON Schema eksak untuk kolom `JSONB`.
3. Menyusun kontrak spesifikasi REST API & DTO Schema (`/api/v1/...`) di [docs/contracts/rest-api-contract.md](../contracts/rest-api-contract.md) lengkap dengan struktur request/response, standar error response JSON, matriks HTTP status codes, serta pemetaan 1:1 antara TypeScript Interfaces (Frontend) dan Pydantic v2 Models (Backend).
4. Melakukan audit dan validasi silang (*cross-contract audit*) terhadap seluruh 5 dokumen kontrak di [docs/contracts/](../contracts/README.md) (`websocket-protocol.md`, `audio-pipeline-spec.md`, `vrm-avatar-states.md`, `database-schema.md`, `rest-api-contract.md`) dan `PRD.md` agar nama atribut (`session_id`, `turn_id`, `turn_seq`, `stage`, `state`, `emotion`, dll.) 100% konsisten.
5. Memperbarui Knowledge Graph (`graphify-out/`) dan status proyek di [docs/STATE.md](../STATE.md).

---

## 2. Scope & Key Decisions
- **In Scope:**
  - Pembuatan rencana kerja Fase 1 (`docs/plans/2026-10-26-phase-1-master-workflow-and-data-contracts.md`) dan dokumen blueprint `docs/ARCHITECTURE_AND_WORKFLOW.md`.
  - Pembuatan kontrak database `docs/contracts/database-schema.md` (5 tabel inti: `job_positions`, `candidates`, `interview_sessions`, `interview_transcripts`, `evaluation_reports` + ERD + JSON Schema).
  - Pembuatan kontrak REST API `docs/contracts/rest-api-contract.md` (6 endpoint inti `/api/v1/...`, error envelope standar, matriks HTTP status code, dan TypeScript <-> Pydantic v2 DTO mapping).
  - Audit konsistensi dan perbaikan typo/penamaan field pada `docs/contracts/websocket-protocol.md`, `PRD.md`, dan pembaruan indeks `docs/contracts/README.md`.
  - Sinkronisasi penuh Knowledge Graph (`graphify-out/`) dan pencatatan state proyek di `docs/STATE.md`.
- **Out of Scope:**
  - Implementasi kode aplikasi Frontend (`frontend/`) — akan dieksekusi di **Fase 2**.
  - Implementasi kode aplikasi Backend (`backend/`) — akan dieksekusi di **Fase 3**.
  - Integrasi E2E dan containerization Docker — akan dieksekusi di **Fase 4**.
- **Key Decisions Agreed:**
  - Pendekatan **Contract-First**: Tidak ada baris kode aplikasi yang ditulis sebelum ke-5 dokumen kontrak di `docs/contracts/` berstatus `Locked (v1.0.0)` dan lolos audit silang 100%.
  - **1:1 Field Naming Parity**: Seluruh payload JSON (baik di REST API maupun JSON Control Frame WebSocket) menggunakan `snake_case` yang identik antara TypeScript Interface di Frontend dan Pydantic v2 Model di Backend untuk menghindari bug translasi `camelCase <-> snake_case`.
  - **Standalone Validation First**: Frontend wajib memiliki *Mock/Simulator Harness* (`MockInterviewHarness` + generator sampel audio PCM 24kHz) agar animasi 3D VRM dan lip-sync dapat diuji tanpa backend; Backend wajib memiliki *Pytest Suite* (`httpx.AsyncClient` + `FakeGeminiLiveSession`) agar logika bisnis dan relay dapat diuji tanpa browser.

---

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat dokumen blueprint [docs/ARCHITECTURE_AND_WORKFLOW.md](../ARCHITECTURE_AND_WORKFLOW.md) yang menjabarkan urutan dependensi 4 Fase dan Checklist Gate Validasi (DoD) per fase.
- [x] **Step 2:** Buat kontrak skema database & ERD [docs/contracts/database-schema.md](../contracts/database-schema.md) (5 tabel PostgreSQL 16, ENUM, Foreign Keys, Indexes, dan JSON Schema untuk `rubric_config`, `cv_structured_summary`, `competency_scores`).
- [x] **Step 3:** Buat kontrak REST API & DTO [docs/contracts/rest-api-contract.md](../contracts/rest-api-contract.md) (6 endpoint `/api/v1/...`, standar error JSON, matriks HTTP code, dan TypeScript vs Pydantic v2 mapping).
- [x] **Step 4:** Audit & validasi silang seluruh kontrak di `docs/contracts/` (`websocket-protocol.md`, `audio-pipeline-spec.md`, `vrm-avatar-states.md`, `database-schema.md`, `rest-api-contract.md`) serta perbarui [docs/contracts/README.md](../contracts/README.md).
- [x] **Step 5:** Sinkronisasi Knowledge Graph (`graphify`) agar node dari dokumen kontrak dan workflow baru terhubung di `graphify-out/graph.json`, `graphify-out/GRAPH_REPORT.md`, dan `graphify-out/graph.html`.
- [x] **Step 6:** Verifikasi akhir, lengkapi bagian **Implementation Log & Actual Changes** pada dokumen plan ini, dan perbarui [docs/STATE.md](../STATE.md).

---

## 4. Verification Criteria (Phase 1 Validation Gate)
1. Kelima dokumen kontrak di `docs/contracts/` tersedia, lengkap, dan terdaftar di `docs/contracts/README.md` dengan status `Locked (v1.0.0)`.
2. Seluruh tabel (`job_positions`, `candidates`, `interview_sessions`, `interview_transcripts`, `evaluation_reports`) memiliki definisi kolom, tipe data SQLAlchemy/PostgreSQL, constraint, indeks, dan JSON Schema untuk kolom `JSONB`.
3. Seluruh endpoint REST API (`POST /api/v1/sessions`, `GET /api/v1/sessions`, `GET /api/v1/sessions/{session_id}`, `POST /api/v1/sessions/{session_id}/complete`, `GET /api/v1/sessions/{session_id}/report`, `GET /api/v1/health`) memiliki contoh JSON request/response lengkap dan DTO TypeScript/Pydantic yang 100% sinkron.
4. Tidak ada inkonsistensi nama field (`session_id`, `turn_id`, `turn_seq`, `stage`, `state`, `emotion`) antara kontrak WebSocket, kontrak REST API, kontrak Database, dan PRD.
5. `graphify query` berhasil menemukan node kontrak baru di dalam `graphify-out/graph.json`.

---

## 5. Implementation Log & Actual Changes

### Files Created / Modified
- [docs/plans/2026-10-26-phase-1-master-workflow-and-data-contracts.md](./2026-10-26-phase-1-master-workflow-and-data-contracts.md): Rencana kerja dan log eksekusi Fase 1.
- [docs/ARCHITECTURE_AND_WORKFLOW.md](../ARCHITECTURE_AND_WORKFLOW.md): Blueprint alur kerja rekayasa 4 Fase, struktur direktori target `frontend/` dan `backend/`, desain *Mock/Simulator Harness*, serta *Validation Gates* per fase.
- [docs/contracts/database-schema.md](../contracts/database-schema.md): Kontrak skema PostgreSQL 16 (5 tabel inti, 6 tipe ENUM, indeks, DDL SQL, dan JSON Schema Draft 2020-12 untuk `rubric_config`, `cv_structured_summary`, `competency_scores`).
- [docs/contracts/rest-api-contract.md](../contracts/rest-api-contract.md): Kontrak lengkap 6 endpoint REST `/api/v1/...`, amplop error standar `ApiErrorResponse`, matriks HTTP status codes, dan pemetaan 1:1 DTO TypeScript vs Pydantic v2.
- [docs/contracts/websocket-protocol.md](../contracts/websocket-protocol.md): Perbaikan spasi pada `"turn_seq"` di contoh `transcript.delta` dan penambahan catatan pemetaan penyimpanan ke `interview_transcripts`.
- [docs/contracts/README.md](../contracts/README.md): Pembaruan daftar 5 kontrak aktif (`v1.0.0 — Locked`) beserta tabel Matriks Audit Konsistensi Atribut Lintas Kontrak.
- [PRD.md](../../PRD.md): Penyelarasan nama field `resume_from_turn_seq` dan `turn_id` pada `supporting_quotes` agar 100% konsisten dengan kontrak.
- [docs/STATE.md](../STATE.md): Pembaruan status proyek bahwa Fase 1 telah lulus Gate Validasi 100% dan siap melangkah ke Fase 2.

### Knowledge Graph (`graphify`) Sync Status
- Knowledge graph di `graphify-out/` telah diperbarui dan disinkronkan dengan seluruh node baru dari `database-schema.md`, `rest-api-contract.md`, dan `ARCHITECTURE_AND_WORKFLOW.md`.

### Deviations from Original Plan
- Tidak ada deviasi. Selain membuat rencana kerja di `docs/plans/2026-10-26-phase-1-master-workflow-and-data-contracts.md`, kami juga menyediakan dokumen arsitektur terdedikasi `docs/ARCHITECTURE_AND_WORKFLOW.md` agar panduan lintas fase mudah dirujuk.

### Outcome & Follow-up
- **Fase 1 (Master Implementation Workflow & Complete Data Contracts)** telah **LOLOS VALIDASI 100%**.
- Langkah selanjutnya adalah mengeksekusi **Fase 2: Frontend Development & Standalone Validation (`frontend/`)**.
