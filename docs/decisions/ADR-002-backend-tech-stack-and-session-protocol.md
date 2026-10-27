# ADR-002: Backend Tech Stack, Hybrid WebSocket Framing & Session State Architecture

- **Date:** 2026-10-26
- **Status:** `Accepted`
- **Deciders:** Principal Product Manager & Lead System Architect (User & AI Agent)

---

## 1. Context & Problem Statement
Berdasarkan [ADR-001](./ADR-001-core-architecture.md) dan [REQUIREMENTS.md](../../REQUIREMENTS.md), sistem menggunakan arsitektur **Lightweight Backend WebSocket Relay** yang menghubungkan browser kandidat dengan **Gemini Multimodal Live API**. Sebelum memasuki tahap penulisan kode dan penyusunan kontrak protokol di [PRD.md](../../PRD.md), kita harus mengunci empat keputusan teknis spesifik:
1. Pilihan bahasa dan framework untuk **Backend Relay Service** (Python `FastAPI` vs Node.js `Fastify`).
2. Pilihan bundler/framework **Frontend Browser Client** untuk merender 3D VRM dan menjalankan `AudioWorklet`.
3. Format framing pengiriman data audio PCM dan sinyal kontrol melalui koneksi WebSocket antara Browser dan Backend Relay (**Binary PCM + JSON Text** vs **Pure JSON Base64**).
4. Arsitektur manajemen *session state*, *reconnection context*, dan penyimpanan data persisten (JD, CV, Transkrip, Laporan Evaluasi).

## 2. Considered Options

### A. Backend Relay Framework
1. **Option A1: Python 3.12+ dengan `FastAPI` + `uvicorn` (`uvloop`) + `google-genai` Async SDK (Dipilih)**
   - (+) SDK resmi `google-genai` di Python memiliki dukungan paling matang dan *first-class* untuk `client.aio.live.connect()` (Gemini Multimodal Live API) serta validasi skema evaluasi berbasis `Pydantic` (*Structured Outputs*).
   - (+) Dengan `uvloop` dan `asyncio.TaskGroup`, dua loop paralel (`client_to_gemini_loop` dan `gemini_to_client_loop`) berjalan secara *non-blocking* dengan overhead memori per sesi sangat kecil (~3–5 MB RAM per sesi aktif).
   - (+) Ekosistem pemrosesan dokumen (ekstraksi teks PDF/DOCX CV kandidat) dan *prompt templating* sangat kaya di Python.
2. **Option A2: Node.js (TypeScript) dengan `Fastify` + `ws` + `@google/genai`**
   - (+) Performa I/O V8 sangat cepat dan berbagi bahasa TypeScript dengan frontend.
   - (-) Dukungan fitur *Live API* pada SDK JS terkadang rilis sedikit di belakang SDK Python, dan ekosistem ekstraksi dokumen PDF/CV serta *data science/evaluation tooling* lebih kuat di Python.

### B. WebSocket Transport Framing (Client <-> Backend Relay)
1. **Option B1: Hybrid Framing — Binary WebSocket Frames untuk PCM Audio + JSON Text Frames untuk Control Events (Dipilih)**
   - (+) **Nol overhead Base64** pada jaringan antara browser dan backend (menghemat ~33% bandwidth dan menghilangkan beban CPU encode/decode Base64 pada thread utama browser).
   - (+) `AudioWorklet` di browser menghasilkan `ArrayBuffer` (`Int16Array`) yang bisa langsung dikirim via `ws.send(pcmBuffer)`.
   - (+) Event kontrol seperti `barge_in`, `avatar_state`, `transcript_delta`, dan `stage_change` tetap bersih dan terstruktur menggunakan JSON Text Frame.
2. **Option B2: Pure JSON Frames dengan Audio Base64**
   - (+) Satu jenis parser untuk semua pesan.
   - (-) Menambah ukuran payload audio sebesar ~33% dan meningkatkan beban *garbage collection* string di browser maupun backend setiap 20–40ms.

### C. Frontend Client Stack
1. **Option C1: Vite + TypeScript + React (UI Overlay) + Vanilla Three.js & `@pixiv/three-vrm` Service Layer (Dipilih)**
   - (+) Memisahkan *high-frequency 60 FPS render & audio loop* (dikelola oleh class TypeScript murni `VrmAvatarEngine` dan `AudioStreamManager` di luar siklus re-render React) dari *low-frequency UI state* (Lobby, Device Check, Transcript Panel, Recruiter Dashboard yang dikelola React + Zustand).
   - (+) Build statis ringan yang dapat disajikan langsung dari CDN/Cloud Storage atau Nginx container.

### D. Session State & Data Persistence
1. **Option D1: PostgreSQL (Cloud SQL / Supabase) untuk Data Relasional & JSONB + In-Memory Ephemeral Session State dengan Periodic Snapshot (Dipilih)**
   - (+) Konfigurasi lowongan (JD, rubrik), data kandidat, transkrip lengkap, dan laporan evaluasi JSON disimpan secara ACID di PostgreSQL (menggunakan kolom `JSONB` untuk skema rubrik dan hasil evaluasi).
   - (+) Selama wawancara berlangsung, buffer transkrip berjalan di memori pod/container dengan *asynchronous flush* ke database setiap giliran bicara (*turn complete*), sehingga **tidak pernah memblokir jalur audio relay**.
   - (+) Mendukung *Session Resumption*: jika WebSocket kandidat terputus dan tersambung kembali ke instance apa pun, backend dapat memuat ringkasan transkrip dari database dan menginisialisasi ulang koneksi Gemini Live dengan konteks percakapan sebelumnya.

## 3. Decision Outcome
**Chosen Options:**
1. **Backend:** Python 3.12 + `FastAPI` + `uvicorn[standard]` (`uvloop`) + `google-genai` Async SDK + `SQLAlchemy 2.0 (asyncpg)` / `Pydantic v2`.
2. **Frontend:** Vite + TypeScript + React 18 (UI Layer) + `Three.js` + `@pixiv/three-vrm` (3D Engine Layer) + Web Audio API (`AudioWorkletNode` + `AnalyserNode`).
3. **WebSocket Protocol:** Hybrid Framing (Binary Frames untuk Raw PCM 16-bit Little-Endian; JSON Text Frames untuk Control & Telemetry).
4. **Persistence & Deployment:** PostgreSQL (`JSONB` enabled) + Google Cloud Storage / CDN (untuk file `.vrm` & CV PDF) + Docker Multi-Stage pada Google Cloud Run (Session Affinity aktif, timeout 3600 detik).

### Justification / Rationale
Kombinasi ini memenuhi seluruh batasan di `AGENTS.md`: latensi suara *end-to-end* < 1.5–2.0 detik, isolasi penuh API Key Gemini di backend, nol beban GPU di server, serta efisiensi memori dan jaringan maksimal berkat pengiriman frame audio biner murni antara browser dan relay.

## 4. Consequences & Trade-offs
- **Positive:**
  - *Throughput* audio real-time sangat stabil karena jalur biner dipisahkan dari jalur kontrol JSON.
  - Pemisahan *Three.js render loop* dari state UI React mencegah *frame drop* pada animasi lip-sync avatar.
  - *Structured Output* menggunakan Pydantic v2 + Gemini API menjamin laporan akhir penilaian selalu sesuai dengan skema JSON rubrik yang diminta recruiter.
- **Negative / Risks:**
  - Membutuhkan *binary frame header* atau disiplin protokol yang jelas di WebSocket handler untuk membedakan `bytes` (audio) dan `str` (JSON control). Hal ini dimitigasi dengan mendokumentasikan spesifikasi secara ketat di [docs/contracts/websocket-protocol.md](../contracts/websocket-protocol.md).
- **Guardrails:**
  - Di dalam loop relay audio (`client_to_gemini_loop` dan `gemini_to_client_loop`), **DILARANG** melakukan query database sinkron atau operasi CPU-bound. Penulisan transkrip ke database wajib didelegasikan ke background task (`asyncio.create_task`).
