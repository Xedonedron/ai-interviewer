# Plan: Vertex AI Gemini Live Audio Integration, Auto-Mic Capture & Billing Guardrails

- **Date:** 2026-10-27
- **Status:** `Completed`
- **Related ADRs:** [ADR-004](../decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md)

---

## 1. Objective & Context
Mengaktifkan pengalaman wawancara suara *real-time* penuh menggunakan **Vertex AI Gemini Multimodal Live API (`gemini-live-2.5-flash-native-audio`)** melalui GCP Application Default Credentials (`dev-nixon-daniel`), memperbaiki masalah mikrofon yang belum otomatis aktif saat masuk ke `InterviewRoomPage.tsx`, menghilangkan *race condition* WebSocket akibat React `<StrictMode>`, serta memasang pengaman biaya (*Cost & Billing Guardrails*).

## 2. Scope & Key Decisions
- **In Scope:**
  1. **Backend Config (`backend/app/config.py` & `backend/.env`):** Menambahkan dukungan `GOOGLE_GENAI_USE_VERTEXAI`, `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, serta konfigurasi pengaman biaya (`LIVE_MAX_SESSION_DURATION_SEC=300`, `LIVE_VAD_RMS_THRESHOLD=0.006`, `LIVE_VAD_HANGOVER_CHUNKS=20`, dan evaluator `gemini-2.5-flash`).
  2. **Real Gemini Live Session (`backend/app/ws/gemini_live_client.py`):** Mengimplementasikan `GoogleGenAIGeminiLiveSession` menggunakan `google-genai` Async Live API (`client.aio.live.connect`) dengan `input_audio_transcription`, `output_audio_transcription`, *Silence Gate*, *Hard Session Cutoff*, dan *graceful fallback* ke `DeterministicGeminiLiveSession` untuk `pytest` / offline mode.
  3. **Vertex AI Rubric Evaluator (`backend/app/services/evaluator_service.py`):** Mendukung inisialisasi `genai.Client(vertexai=True, ...)` untuk evaluasi akhir menggunakan `gemini-2.5-flash`.
  4. **Frontend Audio & StrictMode Fix (`frontend/src/pages/InterviewRoomPage.tsx`, `frontend/src/pages/CandidateLobbyPage.tsx`, `frontend/src/services/wsClient.ts`):**
     - Meminta izin mikrofon pada Step 2 di `CandidateLobbyPage.tsx` dan otomatis menyalakan `MicCaptureManager` saat memasuki `InterviewRoomPage.tsx`.
     - Menangani *reconnect* cepat pada kode `4002 SESSION_ALREADY_ACTIVE` di `wsClient.ts` akibat *double-mount* React `<StrictMode>`.
- **Out of Scope:**
  - Perubahan skema database PostgreSQL.
- **Key Decisions Agreed:**
  - Mengikuti **Opsi C** yang disetujui user di [ADR-004](../decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md).

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat dokumen keputusan arsitektur [ADR-004](../decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md) dan dokumen rencana kerja ini.
- [x] **Step 2:** Perbarui `backend/app/config.py`, `backend/.env`, dan `backend/.env.example` dengan parameter Vertex AI ADC dan *billing guardrails*.
- [x] **Step 3:** Implementasikan `GoogleGenAIGeminiLiveSession` di `backend/app/ws/gemini_live_client.py` dan dukung Vertex AI di `backend/app/services/evaluator_service.py`.
- [x] **Step 4:** Perbaiki auto-start mikrofon, *AudioContext unlock*, dan koneksi WebSocket di `frontend/src/pages/InterviewRoomPage.tsx`, `frontend/src/pages/CandidateLobbyPage.tsx`, & `frontend/src/services/wsClient.ts`.
- [x] **Step 5:** Jalankan test suite (`pytest` & `npm run build`), restart server backend & frontend, dan jalankan `graphify update .`.
- [x] **Step 6:** Update dokumentasi (`STATE.md` & log implementasi pada plan ini).

## 4. Verification Criteria
- Koneksi `GoogleGenAIGeminiLiveSession` ke Vertex AI `gemini-live-2.5-flash-native-audio` berhasil mengirimkan audio 24kHz PCM (42 chunks / ~452 KB pada sapaan pembuka) dan transkrip pembuka saat sesi dimulai.
- Saat kandidat berbicara di mikrofon, suara dikirimkan ke backend, ditranskripsi sebagai turn `CANDIDATE`, dan dijawab oleh AI dengan suara + lip-sync VRM.
- Seluruh automated test (`pytest` 10/10 dan `vitest` 10/10 / `vite build` 0 errors) lulus 100%.

---

## 5. Implementation Log & Actual Changes

### Files Created / Modified
- [ADR-004-vertex-ai-live-audio-and-cost-guardrails.md](../decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md): Dokumen keputusan arsitektur untuk penggunaan Vertex AI `gemini-live-2.5-flash-native-audio` via ADC + 3 Cost Guardrails.
- [config.py](../../backend/app/config.py), [backend/.env](../../backend/.env), [backend/.env.example](../../backend/.env.example): Menambahkan dukungan `GOOGLE_GENAI_USE_VERTEXAI=true`, `GOOGLE_CLOUD_PROJECT="dev-nixon-daniel"`, `GOOGLE_CLOUD_LOCATION="us-central1"`, `LIVE_MAX_SESSION_DURATION_SEC=300`, `LIVE_VAD_RMS_THRESHOLD=0.006`, dan `LIVE_VAD_HANGOVER_CHUNKS=20`.
- [gemini_live_client.py](../../backend/app/ws/gemini_live_client.py): Mengimplementasikan `GoogleGenAIGeminiLiveSession` penuh menggunakan `client.aio.live.connect` dengan `input_audio_transcription`, `output_audio_transcription`, *Silence Gate*, dan *Hard Duration Watchdog*.
- [evaluator_service.py](../../backend/app/services/evaluator_service.py): Menambahkan dukungan Vertex AI (`genai.Client(vertexai=True, ...)`) untuk evaluasi akhir menggunakan `gemini-2.5-flash`.
- [InterviewRoomPage.tsx](../../frontend/src/pages/InterviewRoomPage.tsx), [CandidateLobbyPage.tsx](../../frontend/src/pages/CandidateLobbyPage.tsx), [wsClient.ts](../../frontend/src/services/wsClient.ts): Menambahkan auto-start `MicCaptureManager` saat memasuki ruangan, unlock `AudioContext`, permintaan izin mic di Lobby Step 2, dan penanganan reconnect `4002` untuk React StrictMode.

### Knowledge Graph (`graphify`) Sync Status
- `graphify update .` berhasil dijalankan: **1,220 nodes, 2,568 edges, 83 communities** (`graphify-out/graph.json`).

### Deviations from Original Plan
- Tidak ada deviasi, sesuai rencana awal.

### Outcome & Follow-up
- Terverifikasi secara langsung terhadap endpoint Vertex AI `us-central1` pada project `dev-nixon-daniel` dan seluruh test suite hijau.
