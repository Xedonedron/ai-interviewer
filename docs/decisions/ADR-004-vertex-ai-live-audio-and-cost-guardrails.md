# ADR-004: Vertex AI Gemini Multimodal Live API (`gemini-live-2.5-flash-native-audio`) via ADC & Billing Guardrails

- **Date:** 2026-10-27
- **Status:** `Accepted`
- **Deciders:** User & AI Agent

---

## 1. Context & Problem Statement
Pada Fase 3 dan 4, `GoogleGenAIGeminiLiveSession` di [gemini_live_client.py](../../backend/app/ws/gemini_live_client.py) masih mendelegasikan pemanggilan ke `DeterministicGeminiLiveSession` (`_fallback`) untuk keperluan validasi standalone, dan `InterviewRoomPage.tsx` belum menyalakan mikrofon secara otomatis saat kandidat memasuki ruang wawancara.
Selain itu, user memiliki project GCP aktif (`dev-nixon-daniel`) dengan Application Default Credentials (ADC) dan meminta pengaktifan **Opsi C**: koneksi langsung ke **Gemini Multimodal Live API Native Audio** menggunakan autentikasi GCP/ADC dengan pengaman ketat (*billing guardrails*) agar tagihan streaming audio tidak membengkak.

## 2. Considered Options
1. **Option A: Google AI Studio API Key (`generativelanguage.googleapis.com`)**
   - (+) Mudah dikonfigurasi dengan string API Key.
   - (-) Membutuhkan pembuatan key manual di luar IAM/ADC yang sudah login, serta model ID berbeda dengan Vertex AI publisher models.
2. **Option B: Browser Web Speech API (STT/TTS) + Text Gemini Flash**
   - (+) Biaya paling rendah.
   - (-) Kualitas intonasi suara robotik tergantung OS/browser kandidat dan latensi turn-taking tidak sealami native multimodal audio.
3. **Option C: Vertex AI Gemini Live Native Audio (`gemini-live-2.5-flash-native-audio`) via GCP ADC + Cost Guardrails**
   - (+) Memanfaatkan autentikasi IAM/ADC (`gcloud auth application-default login`) pada project `dev-nixon-daniel` tanpa perlu mengekspos static API key.
   - (+) Suara natural 24kHz PCM langsung dari model `gemini-live-2.5-flash-native-audio` lengkap dengan `input_audio_transcription` dan `output_audio_transcription` real-time.
   - (+) Dilengkapi 3 pengaman biaya (*Cost Guardrails*):
     1. **Silence Gate (VAD Filtering):** Hanya meneruskan paket audio 16kHz ke Vertex AI ketika kandidat berbicara atau dalam *speech hangover window* (mencegah tagihan token audio saat keheningan panjang).
     2. **Hard Session Duration Cutoff (Default 300s / 5 Menit):** Memutus sesi upstream secara otomatis ketika batas durasi sesi tercapai.
     3. **Cost-Efficient Rubric Evaluator (`gemini-2.5-flash`):** Menggunakan `gemini-2.5-flash` pada Vertex AI untuk evaluasi pasca-wawancara yang 10x lebih hemat dibandingkan model Pro.

## 3. Decision Outcome
**Chosen Option:** **Option C — Vertex AI Gemini Live Native Audio (`gemini-live-2.5-flash-native-audio`) via GCP ADC + Cost Guardrails**

### Justification / Rationale
- Terverifikasi langsung bahwa `genai.Client(vertexai=True, project="dev-nixon-daniel", location="us-central1")` dengan model `gemini-live-2.5-flash-native-audio` berhasil menghasilkan streaming 24kHz PCM audio dan transkrip dua arah dengan latensi rendah.
- Kombinasi *Silence Gate* dan *Hard Duration Cutoff* memastikan sesi dev/testing tidak akan pernah mengalami kebocoran tagihan (*runaway billing*) jika tab browser lupa ditutup.

## 4. Consequences & Trade-offs
- **Positive:**
  - Kandidat langsung mendengar suara AI Interviewer (Alya) saat memasuki ruangan dan ucapan mikrofon kandidat langsung ditranskripsi serta dijawab secara *real-time*.
  - Tetap mempertahankan mode `DeterministicGeminiLiveSession` saat `pytest` berjalan atau ketika baik `GOOGLE_GENAI_USE_VERTEXAI` maupun `GEMINI_API_KEY` dinonaktifkan.
- **Negative / Risks:**
  - Membutuhkan kredensial ADC yang aktif di server/mesin host (`~/.config/gcloud/application_default_credentials.json`). Jika sesi ADC kedaluwarsa, sistem akan mencatat log peringatan dan jatuh kembali (*graceful fallback*) ke adapter deterministik agar aplikasi tidak crash.
- **Guardrails:**
  - Seluruh kredensial GCP/Vertex AI wajib tetap berada di sisi backend (`app/config.py` & `app/ws/gemini_live_client.py`).
  - Batas waktu keras (`LIVE_MAX_SESSION_DURATION_SEC=300`) wajib ditegakkan pada background task sesi live.
