# ADR-005: Unified Single-Container Google Cloud Run Deployment Architecture

- **Status:** Accepted
- **Date:** 2026-10-27
- **Deciders:** AI Agent & Nixon Daniel
- **Consulted:** AGENTS.md, REQUIREMENTS.md, PRD.md, Primecare Reference Architecture

---

## 1. Context and Problem Statement
Sistem AI Interviewer membutuhkan deployment ke **Google Cloud Run** di GCP project `dev-nixon-daniel`, region `asia-southeast2` (Jakarta), mengikuti kesuksesan arsitektur deployment platform Primecare (`https://primecare-800933197735.asia-southeast2.run.app`).

Tantangan teknis utama yang harus dipecahkan:
1. **Frontend + Backend Co-location:** Frontend adalah Single Page Application (SPA) berbasis Vite + React 19 + Three.js + VRM 1.0 models (~22MB), sedangkan Backend adalah Python 3.12 FastAPI yang menangani REST API dan koneksi streaming WebSocket. Jika dideploy sebagai 2 service Cloud Run terpisah, muncul masalah konfigurasi domain silang (CORS), pengelolaan SSL terpisah, dan overhead latensi routing antar-service.
2. **Koneksi Streaming Audio WebSocket:** Cloud Run membatasi request timeout default ke 300 detik kecuali dikonfigurasi secara eksplisit hingga 3600 detik (1 jam) untuk streaming WebSocket full-duplex.
3. **Isolasi API Key & Autentikasi Vertex AI:** Sesuai *Guardrail #2* di `AGENTS.md` dan `ADR-004`, kredensial Vertex AI tidak boleh diekspos ke klien dan harus memanfaatkan Google Cloud Application Default Credentials (ADC) dari Cloud Run Service Account secara transparan.

---

## 2. Considered Options

### Opsi 1: Two-Service Deployment (Frontend Cloud Run + Backend Cloud Run)
- Frontend dideploy ke Cloud Run service terpisah atau Cloud Storage / Firebase Hosting.
- Backend FastAPI dideploy ke Cloud Run backend service terpisah.
- *Kelemahan:* Membutuhkan custom domain dengan Cloud Load Balancer (atau CORS permissive), kompleksitas environment variable frontend untuk URL backend yang dinamis, dan biaya ganda untuk dua service Cloud Run.

### Opsi 2: Unified Single-Container Deployment dengan Nginx + Uvicorn (Pola Primecare) — **DIPILIH**
- Satu image container multi-stage:
  - Stage 1: Build bundle frontend statis (`dist`) menggunakan Node 20.
  - Stage 2: Runtime image Python 3.12-slim yang menginstal Uvicorn dan Nginx.
- Nginx mendengarkan port `${PORT}` yang diberikan oleh Cloud Run (default 8080).
- Nginx menyajikan file statis SPA & model VRM langsung dengan gzip & header caching.
- Nginx melakukan reverse proxy internal ke Uvicorn di `127.0.0.1:8000` untuk path `/api/` dan `/ws/interview/` (dengan `Upgrade: websocket` dan `proxy_read_timeout 3600s`).
- *Kelebihan:* Satu URL tunggal, nol konfigurasi CORS, latensi proxy lokal ultra-rendah (<1ms antar-proses), dan 100% kompatibel dengan model deployment Primecare.

---

## 3. Decision Outcome
Memilih **Opsi 2: Unified Single-Container Deployment**:

1. **Multi-Stage Dockerfile di Root Repository:**
   - Membangun frontend statis via Node.js 20 dan menyalin hasilnya ke `/usr/share/nginx/html`.
   - Menginstal backend Python dependencies dan Nginx di runtime container.
2. **Dynamic Port Nginx Template (`nginx.conf.template`):**
   - Menggunakan `envsubst` untuk memasukkan port dinamis Cloud Run (`$PORT`) ke direktif `listen`.
   - Menyetel `proxy_buffering off;` dan `proxy_read_timeout 3600s;` khusus untuk WebSocket endpoint `/ws/interview/`.
3. **Container Entrypoint (`scripts/docker-entrypoint.sh`):**
   - Mengorkestrasi startup: render konfigurasi Nginx -> spawn Uvicorn di background -> tunggu `/api/v1/health` siap -> seed database SQLite otomatis jika belum ada sesi -> spawn Nginx di foreground.
4. **Vertex AI ADC Integration:**
   - Backend dijalankan dengan `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT=dev-nixon-daniel`, dan `GOOGLE_CLOUD_LOCATION=us-central1`. Service account Cloud Run default otomatis menyediakan ADC token untuk Vertex AI Multimodal Live API.

---

## 4. Consequences
- **Positif:**
  - Satu URL publik yang langsung menyajikan UI, API, dan WebSocket tanpa konfigurasi DNS atau load balancer tambahan.
  - Sangat hemat biaya dan sumber daya: Cloud Run hanya menagih 1 instance terpadu dengan auto-scaling.
  - Model 3D VRM (`alya.vrm` & `bima.vrm`) disajikan super cepat langsung oleh Nginx static engine.
- **Negatif / Mitigasi:**
  - Database default menggunakan SQLite di `/app/ai_interviewer.db`, sehingga data sesi bersifat per-instance. Mitigasi: Cloud Run dikonfigurasi dengan `--max-instances 1` untuk PoC/demo agar konsisten, dan siap dialihkan ke Google Cloud SQL (PostgreSQL) kapan saja via environment variable `DATABASE_URL`.
