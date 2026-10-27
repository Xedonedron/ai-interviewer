# Plan: Comprehensive PRD, ADR-002 & Initial System Contracts

- **Date:** 2026-10-26
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-002](../decisions/ADR-002-backend-tech-stack-and-session-protocol.md)

---

## 1. Objective & Context
Menyusun dokumen **Product Requirements Document (`PRD.md`)** yang sangat komprehensif, mendalam secara teknis, dan *implementation-ready* untuk proyek **Real-Time AI Interviewer Platform**, disertai penguncian keputusan arsitektur *tech stack* backend & protokol sesi di `ADR-002` serta spesifikasi kontrak sistem awal di `docs/contracts/`.

## 2. Scope & Key Decisions
- **In Scope:**
  - Pembuatan `docs/decisions/ADR-002-backend-tech-stack-and-session-protocol.md` (pemilihan Python 3.12 + FastAPI + `google-genai` async SDK, hybrid WebSocket protocol JSON + Binary PCM, serta PostgreSQL/Firestore persistence).
  - Penyusunan `/srv/projects/ai-interviewer/PRD.md` yang mencakup 9 bagian utama: Executive Summary & KPIs, Complete Tech Stack & System Architecture, 6 Core Functionalities Deep-Dive, Frontend Specifications & State Machine, Backend Specifications (REST APIs, WebSocket Relay Protocol, Guardrails), 4 End-to-End Workflows dengan Mermaid Diagrams, Edge Cases & Resilience, Non-Functional Requirements (Latency Budget, Security, Cloud Cost Efficiency), dan Phased Implementation Roadmap.
  - Inisialisasi 3 dokumen kontrak teknis di `docs/contracts/`:
    1. `docs/contracts/websocket-protocol.md`
    2. `docs/contracts/audio-pipeline-spec.md`
    3. `docs/contracts/vrm-avatar-states.md`
  - Sinkronisasi penuh *Knowledge Graph* (`graphify-out/`) atas seluruh dokumen baru.
  - Pembaruan `docs/STATE.md` dan penutupan log plan ini.
- **Out of Scope:**
  - Implementasi kode sumber di `frontend/` dan `backend/` (akan dieksekusi pada Milestone 1 mengacu pada PRD dan kontrak yang dikunci pada plan ini).
- **Key Decisions Agreed:**
  - **Backend Stack:** Python 3.12 + `FastAPI` + `uvicorn` (`uvloop`) + `google-genai` (Async Client) dipilih sebagai stack utama karena dukungan *first-party* paling matang untuk Gemini Multimodal Live API (`aio.live.connect`), kemudahan integrasi pipeline evaluasi rubrik berbasis *structured outputs* (`Pydantic`), dan *event loop* `asyncio` yang sangat ringan untuk relay biner.
  - **Frontend Stack:** Vite + TypeScript + React 18 (UI Layer) + Vanilla `Three.js` & `@pixiv/three-vrm` (3D Engine Layer) + Web Audio API (`AudioWorkletNode` & `AnalyserNode`).
  - **WebSocket Transport Framing:** Hybrid framing di mana chunk audio PCM dikirim sebagai **Binary WebSocket Frames** (untuk menghindari overhead ~33% Base64 di jaringan client-backend) dan sinyal kontrol/event dikirim sebagai **UTF-8 JSON Text Frames**.

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat rencana pengerjaan di `docs/plans/2026-10-26-comprehensive-prd-and-contracts.md`.
- [x] **Step 2:** Buat `docs/decisions/ADR-002-backend-tech-stack-and-session-protocol.md` untuk mengunci pilihan *tech stack* backend relay, manajemen session state, protokol framing WebSocket, dan database.
- [x] **Step 3:** Susun `/srv/projects/ai-interviewer/PRD.md` secara lengkap dan mendalam sesuai 9 bab spesifikasi.
- [x] **Step 4:** Buat kontrak teknis di `docs/contracts/websocket-protocol.md`, `docs/contracts/audio-pipeline-spec.md`, dan `docs/contracts/vrm-avatar-states.md`, serta perbarui `docs/contracts/README.md`.
- [x] **Step 5:** Jalankan pembaruan Knowledge Graph (`graphify`) agar seluruh node konsep dari `PRD.md`, `ADR-002`, dan `docs/contracts/` terintegrasi ke `graphify-out/graph.json` dan `graphify-out/GRAPH_REPORT.md`.
- [x] **Step 6:** Verifikasi kelengkapan dan perbarui `docs/STATE.md` serta bagian *Implementation Log* pada dokumen plan ini.

## 4. Verification Criteria
- `PRD.md` mencakup seluruh 9 bab dengan tabel spesifikasi REST/WebSocket, rumus pemetaan viseme/blendshape, anggaran latensi, serta diagram Mermaid (`sequenceDiagram`, `flowchart`, `stateDiagram-v2`) yang valid.
- Seluruh 3 file kontrak di `docs/contracts/` sinkron 100% dengan spesifikasi di `PRD.md` dan `ADR-002`.
- `graphify-out/graph.json` dan `graphify-out/GRAPH_REPORT.md` berhasil diperbarui dan dapat di-query melalui CLI `graphify`.

---

## 5. Implementation Log & Actual Changes

### Files Created / Modified
- `PRD.md`: Dokumen Product Requirements Document komprehensif (9 bab lengkap, arsitektur tech stack, algoritma formant lip-sync VRM, state machine, protokol WebSocket hybrid, 4 diagram workflow Mermaid, analisis edge-cases, anggaran latensi < 1.5s, dan roadmap 4 milestone).
- `docs/decisions/ADR-002-backend-tech-stack-and-session-protocol.md`: Mengunci keputusan Python 3.12 + FastAPI (`uvloop`) + `google-genai` Async SDK, Vite + TypeScript + Three.js, Hybrid WebSocket Framing (Binary PCM + JSON Control), dan PostgreSQL 16 (`asyncpg` + `JSONB`).
- `docs/contracts/websocket-protocol.md`: Kontrak protokol komunikasi WebSocket (handshake JWT, Binary PCM frames, JSON control events `client.ready`, `control.barge_in`, `avatar.state`, `transcript.delta`, `session.stage_change`, dan custom close codes).
- `docs/contracts/audio-pipeline-spec.md`: Kontrak pipeline audio (`getUserMedia` constraints, `AudioWorklet` 16kHz `PCM_S16LE` 40ms chunking, `PcmStreamPlayer` 24kHz gapless playback, instant flush < 50ms saat *barge-in*, dan konfigurasi `AnalyserNode`).
- `docs/contracts/vrm-avatar-states.md`: Kontrak state machine avatar 3D VRM (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `INTERRUPTED`), rumus *asymmetric exponential smoothing* viseme (`aa`, `ih`, `ou`, `ee`, `oh`), normalisasi bobot anti-clipping, dan animasi tulang prosedural.
- `docs/contracts/README.md`: Diperbarui dengan tautan ke ketiga kontrak yang telah dikunci (`v1.0.0`).
- `docs/plans/2026-10-26-comprehensive-prd-and-contracts.md`: Dokumen rencana dan log eksekusi ini.
- `docs/STATE.md`: Diperbarui untuk mencerminkan selesainya fase perancangan PRD dan kontrak sistem.
- `graphify-out/`: Diperbarui (`graph.json`, `GRAPH_REPORT.md`, `graph.html`, `obsidian/`).

### Knowledge Graph (`graphify`) Sync Status
- `graphify-out/graph.json` dan `graphify-out/GRAPH_REPORT.md` berhasil diperbarui dari 15 nodes / 20 edges menjadi **29 nodes, 48 edges, dan 5 communities**:
  1. *PRD Architecture, Persistence & Rubric Evaluation* (8 nodes)
  2. *Client-Side 3D VRM, Lip-Sync & Gemini Live Engine* (7 nodes)
  3. *Audio Capture & Backend WebSocket Relay* (5 nodes)
  4. *System Contracts, Barge-In & Frontend State Machine* (5 nodes)
  5. *Workspace Governance & Plan Tracking* (4 nodes)

### Deviations from Original Plan
- Tidak ada deviasi, seluruh tahapan dieksekusi sesuai rencana awal.

### Outcome & Follow-up
- Spesifikasi produk (`PRD.md`), keputusan arsitektur (`ADR-001`, `ADR-002`), dan kontrak teknis (`docs/contracts/`) telah terkunci (`Locked v1.0.0`). Proyek siap memasuki **Milestone 1: Core WebSocket Relay & Full-Duplex Voice Pipeline**.
