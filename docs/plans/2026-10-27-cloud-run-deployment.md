# Plan: Unified Single-Container Google Cloud Run Deployment (`ADR-005`)

- **Tanggal Rencana:** 2026-10-27
- **Topik / Inisiatif:** Deploy sistem Real-Time AI Interviewer Platform ke Google Cloud Run dengan arsitektur Unified Single-Container (mengikuti pola Primecare).
- **Status:** Completed
- **Author:** AI Agent & Nixon Daniel

---

## 1. Problem Statement & Background Context
User meminta agar sistem AI Interviewer ini di-push dan dijalankan di **Google Cloud Run** dengan konfigurasi persis seperti proyek **Primecare** (`https://primecare-800933197735.asia-southeast2.run.app` pada GCP project `dev-nixon-daniel`, region `asia-southeast2` / Jakarta).

Sebelumnya di Phase 4, sistem dikontainerisasi dalam dua container terpisah (`backend/Dockerfile` dan `frontend/Dockerfile` yang dirangkai via `docker-compose.yml`). Untuk Cloud Run tanpa load balancer eksternal yang rumit, pendekatan dua service terpisah menimbulkan kompleksitas CORS, resolusi domain ganda, dan pengelolaan token session WebSocket.

Dengan arsitektur **Unified Single-Container** (seperti Primecare):
1. Satu URL publik tunggal (`https://ai-interviewer-800933197735.asia-southeast2.run.app`).
2. Nginx menyajikan static frontend SPA (React + Three.js + VRM 1.0 models) di port dinamis Cloud Run (`$PORT`).
3. Nginx melakukan reverse proxy lokal ke FastAPI Uvicorn (`127.0.0.1:8000`) untuk `/api/v1/...` dan `/ws/interview/...` (dengan WebSocket upgrade & timeout 3600 detik).
4. Zero CORS issue karena browser mengakses endpoint melalui domain yang sama.
5. Kredensial Vertex AI Gemini Multimodal Live API terisolasi penuh di backend menggunakan Google Cloud Application Default Credentials (ADC) dari Service Account Compute Cloud Run (`800933197735-compute@developer.gserviceaccount.com`).

---

## 2. Proposed Architecture & Scope of Work

### A. Root Multi-Stage Dockerfile
- **Stage 1 (Frontend Builder):** Node.js 20 Alpine, menjalankan `npm run build` untuk mengompilasi TypeScript, CSS Tailwind, dan menyalin aset VRM ke `/app/frontend/dist`.
- **Stage 2 (Runtime Container):** Python 3.12-slim dengan instalasi Nginx, gettext-base, curl, dan dependensi backend Python.
- Nginx mendengarkan port `${PORT:-8080}` dan me-reverse proxy traffic ke Uvicorn internal (`127.0.0.1:8000`).

### B. Nginx Dynamic Port Configuration (`nginx.conf.template`)
- Substitusi `$PORT` via `envsubst` saat container booting.
- Gzip compression untuk file bundle JS, CSS, JSON, dan model 3D `.vrm`.
- Proxy buffering disabled (`proxy_buffering off;`) dan proxy timeouts diatur ke `3600s` untuk koneksi WebSocket 16kHz/24kHz full-duplex.

### C. Entrypoint & Database Seeding (`scripts/docker-entrypoint.sh` & `scripts/seed_demo_session.py`)
- Substitusi `$PORT` ke Nginx conf.
- Menjalankan Uvicorn backend di background (`127.0.0.1:8000`).
- Healthcheck polling ke `http://127.0.0.1:8000/api/v1/health`.
- Otomatis membuat template sesi wawancara aktif (*Data Platform & AI Systems Engineer - Nixon Daniel*) ke SQLite (`/app/ai_interviewer.db`) jika DB baru diinisialisasi.
- Menjalankan Nginx di foreground.

### D. Deployment via Google Cloud SDK (`gcloud run deploy`)
- Project: `dev-nixon-daniel`
- Region: `asia-southeast2` (Jakarta)
- Service name: `ai-interviewer`
- Source: `.` (Cloud Build)
- Parameters: `--memory 2Gi --cpu 2 --timeout 3600 --concurrency 80 --max-instances 1 --allow-unauthenticated`
- Environment Variables:
  - `GOOGLE_GENAI_USE_VERTEXAI=true`
  - `GOOGLE_CLOUD_PROJECT=dev-nixon-daniel`
  - `GOOGLE_CLOUD_LOCATION=us-central1`
  - `GEMINI_LIVE_MODEL=gemini-live-2.5-flash-native-audio`
  - `GEMINI_EVALUATOR_MODEL=gemini-2.5-flash`
  - `LIVE_MAX_SESSION_DURATION_SEC=300`
  - `LIVE_VAD_RMS_THRESHOLD=0.006`
  - `DATABASE_URL=sqlite+aiosqlite:////app/ai_interviewer.db`

---

## 3. Action Items & Checklist
- [x] **Step 1:** Buat dokumen keputusan arsitektur [ADR-005](../decisions/ADR-005-unified-cloud-run-deployment.md).
- [x] **Step 2:** Buat script seeding sesi default `scripts/seed_demo_session.py`.
- [x] **Step 3:** Buat template konfigurasi Nginx `nginx.conf.template` dan entrypoint `scripts/docker-entrypoint.sh`.
- [x] **Step 4:** Buat root `Dockerfile` (multi-stage) dan `.gcloudignore`.
- [x] **Step 5:** Uji build Docker lokal untuk memverifikasi packaging dan startup.
- [x] **Step 6:** Jalankan `gcloud run deploy ai-interviewer` ke `asia-southeast2` di project `dev-nixon-daniel`.
- [x] **Step 7:** Verifikasi endpoint publik Cloud Run (`/api/v1/health`, web lobby, dan WebSocket).
- [x] **Step 8:** Jalankan `graphify update .`, perbarui checklist plan, dan update [docs/STATE.md](../STATE.md).

---

## 4. Implementation Log & Actual Changes
- **File Dibuat / Diperbarui:**
  - `docs/decisions/ADR-005-unified-cloud-run-deployment.md`: ADR arsitektur single-container Cloud Run.
  - `Dockerfile`: Multi-stage Dockerfile (Node 20 builder + Python 3.12/Nginx runtime).
  - `nginx.conf.template`: Template Nginx listening on `${PORT}`, proxying `/api/` & `/ws/interview/` (3600s timeout).
  - `scripts/docker-entrypoint.sh`: Orchestrator startup Uvicorn, health polling, seeding, dan Nginx.
  - `scripts/seed_demo_session.py`: Auto-seed sesi Nixon Daniel jika database baru diinisialisasi.
  - `.gcloudignore` & `.dockerignore`: Filter upload source agar Cloud Build upload cepat dan efisien.
- **Hasil Deployment Live:**
  - Service: `ai-interviewer`
  - Revision: `ai-interviewer-00001-mlh`
  - Region: `asia-southeast2`
  - Production URL: `https://ai-interviewer-800933197735.asia-southeast2.run.app`
  - Health check: `HTTP 200 OK` (`status: healthy`, `database_connected: true`, `gemini_configured: true`)
  - Initial Seeding: Sesi `ses_01m5y5ay5fjtaknnx9z3r5v6ax` aktif dan dapat langsung dibuka dari Dashboard.
  - Knowledge graph updated via `graphify update .` (1,304 nodes, 2,737 edges, 83 communities).
