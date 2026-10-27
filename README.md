# Real-Time AI Interviewer Platform (3D WebGL VRM + Full-Duplex Audio + Evidence-Anchored Rubric Engine)

Platform wawancara teknis dan perilaku (*behavioral & technical interview*) real-time berbasis **3D WebGL VRM Avatar (`@pixiv/three-vrm`)**, **Streaming Audio Full-Duplex (`16kHz PCM_S16LE` Upstream / `24kHz PCM_S16LE` Downstream)** dengan **Barge-In Interruption `<50ms`**, serta **Mesin Evaluasi Rubrik Terstruktur (`Gemini 2.5 Pro` Structured JSON Output)** yang dilengkapi bukti kutipan transkrip verbatim (*evidence-anchored quotes*).

---

## Daftar Isi

1. [Arsitektur Sistem & Single Source of Truth (Contracts)](#1-arsitektur-sistem--single-source-of-truth-contracts)
2. [Fitur Utama & Guardrails Keamanan](#2-fitur-utama--guardrails-keamanan)
3. [Struktur Direktori](#3-struktur-direktori)
4. [Menjalankan Secara Lokal (Development & Dual-Mode Switch)](#4-menjalankan-secara-lokal-development--dual-mode-switch)
5. [Menjalankan Automated Test Suite & Verifikasi E2E](#5-menjalankan-automated-test-suite--verifikasi-e2e)
6. [Deployment dengan Docker Compose & Google Cloud Run](#6-deployment-dengan-docker-compose--google-cloud-run)

---

## 1. Arsitektur Sistem & Single Source of Truth (Contracts)

Platform ini menggunakan pola **Secure Backend Ephemeral Relay** di mana browser kandidat **tidak pernah** berkomunikasi langsung dengan Google Gemini API dan **tidak pernah** menyimpan `GEMINI_API_KEY`, rubrik penilaian, maupun teks CV mentah.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        BROWSER CLIENT (React 18 + Vite)                    │
│  ┌──────────────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ Three.js + @pixiv/vrm    │  │ Web Audio API     │  │ Zustand Session │  │
│  │ 60 FPS Viseme Lip-Sync   │  │ 16kHz Mic Capture │  │ & Transcript    │  │
│  │ Auto-Blink & Gaze Saccade│  │ 24kHz Ring Buffer │  │ Store           │  │
│  └────────────▲─────────────┘  └─────────▲─────────┘  └────────▲────────┘  │
└───────────────┼──────────────────────────┼─────────────────────┼───────────┘
                │ JSON Control (0x01)      │ Binary PCM (0x02)   │ REST JSON
                └──────────────────────────┼─────────────────────┘
                                           ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                   FASTAPI BACKEND ORCHESTRATOR (Python 3.12)               │
│  ┌──────────────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ Session Orchestrator     │  │ Gemini Live Relay │  │ Rubric Evaluator│  │
│  │ 5-Stage Machine &        │  │ Native Audio Bidi │  │ Gemini 2.5 Pro  │  │
│  │ <15ms Barge-In Relay     │  │ + Deterministic   │  │ Weighted Math & │  │
│  │ + Session Resumption     │  │ Offline Adapter   │  │ Verbatim Quotes │  │
│  └────────────▲─────────────┘  └─────────▲─────────┘  └────────▲────────┘  │
│               └──────────────────────────┼─────────────────────┘           │
│                                          ▼                                 │
│                        PostgreSQL 16 / Async SQLite                        │
└────────────────────────────────────────────────────────────────────────────┘
```

Seluruh modul frontend dan backend mematuhi **5 Dokumen Kontrak Formal** di [`docs/contracts/`](file:///srv/projects/ai-interviewer/docs/contracts/README.md):

1. [`1-rest-api-openapi.md`](file:///srv/projects/ai-interviewer/docs/contracts/1-rest-api-openapi.md) — Spesifikasi REST API v1 (`/api/v1/health`, `/api/v1/sessions`, `/complete`, `/report`).
2. [`2-websocket-protocol.md`](file:///srv/projects/ai-interviewer/docs/contracts/2-websocket-protocol.md) — Protokol Hybrid WebSocket (`/ws/interview/{session_id}?token=<jwt>`): Frame Biner `0x02` (`16kHz`/`24kHz` `PCM_S16LE`) & Frame Teks JSON `0x01`.
3. [`3-vrm-avatar-state-contract.md`](file:///srv/projects/ai-interviewer/docs/contracts/3-vrm-avatar-state-contract.md) — Kontrak State Machine 3D VRM Avatar, Viseme Energy (`aa, ih, uh, ee, oh`), Budget Blendshape `<= 1.15`, dan Governor FPS otomatis.
4. [`4-rubric-and-prompt-contract.md`](file:///srv/projects/ai-interviewer/docs/contracts/4-rubric-and-prompt-contract.md) — Skema Rubrik Kompetensi Berbobot (`sum(weights) == 100`), Sanitasi Anti-Prompt Injection CV, dan Kontrak Evaluasi Berbasis Bukti Kutipan.
5. [`5-database-erd-and-models.md`](file:///srv/projects/ai-interviewer/docs/contracts/5-database-erd-and-models.md) — Skema Database Relasional (`job_positions`, `candidates`, `interview_sessions`, `transcript_turns`, `evaluation_reports`) dengan ID berprefiks ULID (`job_`, `cnd_`, `ses_`, `trn_`, `rep_`).

---

## 2. Fitur Utama & Guardrails Keamanan

- **Zero API Key Leakage:** `GEMINI_API_KEY` hanya berada di environment server backend (`backend/app/config.py`). Bundle produksi `frontend/dist/` diaudit secara otomatis agar memiliki **0 kemunculan** `GEMINI_API_KEY`.
- **Zero Rubric & CV Leakage ke Kandidat:** Endpoint lobby kandidat (`GET /api/v1/sessions/{session_id}`) menyaring seluruh data sensitif (`rubric_config`, `cv_text`, `job_description`, `probing_guidance`).
- **Anti-Prompt Injection CV Sanitizer:** Teks CV kandidat disanitasi di sisi server (`backend/app/services/prompt_builder.py`) dari instruksi manipulatif (`IGNORE ALL PREVIOUS INSTRUCTIONS`, tag XML palsu, dsb.) dan diisolasi di dalam `<candidate_cv_untrusted_data read_only="true">`.
- **Sub-50ms Barge-In Interruption:** Deteksi suara kandidat saat AI berbicara langsung memicu `client.barge_in` -> `control.barge_in` (`<15ms` di backend relay + `<30ms` flush `AudioBufferSourceNode` di browser) dan transisi wajah avatar ke `INTERRUPTED` -> `LISTENING`.
- **Session Resumption (`resume_from_turn_seq`):** Pemutusan jaringan sementara dipulihkan secara otomatis oleh `interviewWsClient.ts` menggunakan *exponential backoff + jitter* tanpa mengulang pertanyaan dari awal.
- **Dual-Mode Execution (Live Backend + Standalone Simulator):** Mendukung mode **Live FastAPI Backend** secara default (`VITE_USE_MOCK_SIMULATOR=false`) sekaligus mode **Standalone Deterministic Simulator** (`?mock=true` atau `VITE_USE_MOCK_SIMULATOR=true`).

---

## 3. Struktur Direktori

```text
/srv/projects/ai-interviewer/
├── backend/                     # FastAPI + SQLAlchemy 2.0 Async + Gemini Live Relay
│   ├── app/
│   │   ├── api/v1/              # REST Endpoints (/health, /sessions, /complete, /report)
│   │   ├── db/                  # AsyncEngine, ORM Models (5 tabel), Repository Layer
│   │   ├── schemas/             # Pydantic v2 Schemas (REST, WS, Rubric)
│   │   ├── security/            # Ephemeral Session JWT (HS256)
│   │   ├── services/            # Prompt Builder (Anti-Injection) & Rubric Evaluator
│   │   └── ws/                  # Hybrid WebSocket Endpoint, Orchestrator, Gemini Adapter
│   ├── tests/                   # Automated Pytest Suite (Unit, Integration, E2E Lifecycle)
│   └── Dockerfile               # Production Python 3.12-slim Container
├── frontend/                    # React 18 + TypeScript + Vite + Tailwind + Three.js VRM
│   ├── src/
│   │   ├── components/          # 3D VRM Canvas, Audio Visualizer, Transcript, Stage Progress
│   │   ├── pages/               # Recruiter Setup, Lobby, Live Interview Room, Completed, Report
│   │   ├── services/            # REST API Client, Hybrid WS Client, Audio PCM Engine, VRM Controller
│   │   └── store/               # Zustand State Store
│   ├── nginx.conf               # Production Nginx Reverse Proxy (/api + /ws Upgrade + SPA)
│   └── Dockerfile               # Multi-stage Node 20 Build -> Nginx 1.27 Alpine
├── docs/
│   ├── contracts/               # 5 Dokumen Kontrak Single Source of Truth
│   ├── plans/                   # Implementation Plans (Fase 1 s/d Fase 4)
│   ├── ARCHITECTURE_AND_WORKFLOW.md
│   └── STATE.md
├── scripts/
│   └── verify_e2e.sh            # Skrip Otomasi Verifikasi End-to-End & Audit Keamanan
└── docker-compose.yml           # Orkestrasi PostgreSQL 16 + Backend FastAPI + Frontend Nginx
```

---

## 4. Menjalankan Secara Lokal (Development & Dual-Mode Switch)

### A. Menjalankan Backend (`http://127.0.0.1:8000`)

```bash
cd /srv/projects/ai-interviewer/backend
cp .env.example .env
# Opsional: isi GEMINI_API_KEY di .env untuk koneksi ke Google Gemini Live API.
# Jika GEMINI_API_KEY kosong, backend otomatis menggunakan Deterministic Live Adapter
# yang menghasilkan gelombang suara 24kHz PCM & evaluasi berbasis bukti secara deterministik.

./.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

### B. Menjalankan Frontend (`http://127.0.0.1:5173`)

```bash
cd /srv/projects/ai-interviewer/frontend
cp .env.example .env
npm run dev
```

Vite dev server (`frontend/vite.config.ts`) secara otomatis mem-proxy:
- `/api/*` -> `http://127.0.0.1:8000`
- `/ws/*` -> `ws://127.0.0.1:8000` (WebSocket upgrade)

### C. Beralih ke Mode Standalone Simulator (Tanpa Backend)

- Tambahkan query parameter `?mock=true` pada URL browser (contoh: `http://localhost:5173/interview/ses_01jc9x8k2m4n6p8q0r2s4t6v8w/room?mock=true`), **atau**
- Klik tombol **"Simulasi Respons AI (24kHz)"** di dalam ruang wawancara, **atau**
- Set `VITE_USE_MOCK_SIMULATOR=true` pada `frontend/.env`.

---

## 5. Menjalankan Automated Test Suite & Verifikasi E2E

Jalankan seluruh verifikasi E2E (Backend Pytest + Frontend Vitest + Production Build + Security Audit + Live Server Smoke Test) dengan satu perintah:

```bash
bash /srv/projects/ai-interviewer/scripts/verify_e2e.sh
```

Atau jalankan masing-masing test suite secara terpisah:

```bash
# Backend Pytest Suite (10 test cases termasuk E2E Lifecycle)
cd /srv/projects/ai-interviewer/backend
./.venv/bin/pytest -v

# Frontend Vitest Suite (10 unit & SLA tests)
cd /srv/projects/ai-interviewer/frontend
npm test -- --run
```

---

## 6. Deployment dengan Docker Compose & Google Cloud Run

### A. Menjalankan Stack Penuh dengan Docker Compose (`PostgreSQL 16 + Backend + Frontend`)

```bash
cd /srv/projects/ai-interviewer
cp .env.example .env
docker compose up --build -d
```

- **Aplikasi Web & Proxy API/WS:** `http://localhost:8080`
- **Healthcheck Backend Langsung:** `http://localhost:8000/api/v1/health`

### B. Deployment ke Google Cloud Run

1. **Pastikan Session Affinity & Timeout WebSocket Aktif untuk Layanan Backend:**
   ```bash
   gcloud run deploy ai-interviewer-backend \
     --source ./backend \
     --region asia-southeast2 \
     --timeout=3600 \
     --session-affinity \
     --min-instances=1 \
     --set-env-vars="APP_ENV=production,CORS_ORIGINS=https://interviewer.example.com" \
     --set-secrets="GEMINI_API_KEY=GEMINI_API_KEY:latest,JWT_SECRET_KEY=JWT_SECRET_KEY:latest,DATABASE_URL=DATABASE_URL:latest"
   ```
2. **Deploy Frontend Container (atau Cloud CDN + Load Balancer):**
   ```bash
   gcloud run deploy ai-interviewer-frontend \
     --source ./frontend \
     --region asia-southeast2 \
     --allow-unauthenticated
   ```
