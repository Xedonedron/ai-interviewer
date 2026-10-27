# Plan: Fix AI Interviewer Audio Playback Cutoffs (Echo Barge-In Loop) & Smooth 3D VRM Animation

- **Date:** 2026-10-27
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-004](../decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md)

---

## 1. Objective & Context
Setelah mikrofon kandidat berhasil aktif dan mengirimkan audio serta menghasilkan transkrip, ditemukan 2 masalah utama saat pengujian live:
1. **Suara AI Interviewer hilang / terputus segera setelah mulai bicara:**
   - Dari inspeksi database SQLite (`interview_transcripts` pada sesi `ses_01m5xsr4nmn0zqjexzp0w790hn`), seluruh giliran bicara AI memiliki `was_interrupted = 1` dan terdapat transkrip pecahan suara bocor (speaker echo / noise ruangan).
   - Penyebab 1 (Echo & Self-Interruption): Ketika AI mulai berbicara (`ai_speaking = True`), backend tetap meneruskan semua frame `16kHz PCM` dengan `rms >= 0.006` (`LIVE_VAD_RMS_THRESHOLD`) langsung ke Gemini Live API (`send_realtime_input`). Di Gemini Multimodal Live API, sekecil apa pun frame audio yang dikirim ke `send_realtime_input` saat model sedang mengeluarkan output audio akan langsung memicu server-side `interrupted = True` (memotong suara AI di awal kalimat). Selain itu, di frontend (`InterviewRoomPage.tsx`), `onLocalVadSpeechStart` (`rms > 0.045` selama 200ms) langsung mengirim `sendBargeIn()` yang mem-flush `PcmStreamPlayer` apabila speaker kandidat bocor ke mikrofon.
   - Penyebab 2 (Web Audio Autoplay Unlock): Saat berpindah dari `CandidateLobbyPage` ke `InterviewRoomPage`, `PcmStreamPlayer` dibuat baru di `useEffect` tanpa *user gesture* langsung pada halaman Room, dan `MicCaptureManager` membuat `AudioContext` kedua yang terpisah.
2. **Animasi 3D VRM terasa kaku / patah-patah ("pose setengah detik 10x tanpa jeda"):**
   - Penyebab 1 (Zustand Re-render Flood di `InterviewRoomPage.tsx`): `VrmAvatarEngine` memanggil callback `onTelemetry` **setiap frame (`60x per detik`)**, dan `InterviewRoomPage.tsx` memanggil `setAvatarTelemetry(telemetry.fps, telemetry.tier, telemetry.visemes)` ke Zustand store pada setiap frame! Karena `visemes` adalah objek baru setiap frame dan `InterviewRoomPage` men-subscribe ke `useInterviewStore()`, seluruh pohon komponen React `InterviewRoomPage` melakukan full re-render 60 kali per detik ditambah 25 kali per detik dari `setMicRmsLevel(rms)` (total ~85 full React re-renders per detik di main thread), yang membuat `requestAnimationFrame` Three.js tersendat-sendat parah (stuttering/jank).
   - Penyebab 2 (State Machine Spam & Snap): Backend mengirim `AvatarStateFrame(SPEAKING)` pada **setiap chunk PCM** (`20x per detik`), dan saat terjadi false barge-in beruntun, state melompat-lompat `SPEAKING -> INTERRUPTED -> LISTENING -> SPEAKING` puluhan kali disertai snap instan pada rotasi kepala (`headRotation` tidak di-lerp).
   - Penyebab 3 (SpringBone Physics Spike saat Frame Drop): Ketika `deltaTimeSec` melonjak saat loading/GC, `this.vrm.update(deltaTimeSec)` meneruskan `dt` besar ke `springBoneManager` (57 joints) sehingga rambut/pakaian VRM terpental kaku.

---

## 2. Scope & Key Decisions
- **In Scope:**
  - `frontend/src/pages/InterviewRoomPage.tsx`:
    - Hapus pemanggilan `setAvatarTelemetry` dari hot-loop 60 FPS (atau throttle menjadi 1x per detik dan jangan subscribe `InterviewRoomPage` ke state yang tidak ditampilkan di UI) serta throttle update `setMicRmsLevel` agar React tidak re-render puluhan kali per detik.
    - Bagikan (`share`) satu instance `AudioContext` antara `PcmStreamPlayer` dan `MicCaptureManager` (atau pastikan `PcmStreamPlayer.getAudioContext().resume()` selalu dipanggil saat klik di Lobby dan Room), serta tambahkan tombol/banner auto-unlock jika browser men-suspend audio output.
    - Jangan kirim `wsClient.sendBargeIn()` otomatis dari `onLocalVadSpeechStart` kecuali kandidat benar-benar berbicara kuat (`rms > 0.085` selama `>= 320ms`) atau menekan tombol **"Sela AI"**, sehingga bocoran suara speaker tidak mematikan suara AI sendiri.
  - `backend/app/ws/session_orchestrator.py` & `backend/app/ws/gemini_live_client.py`:
    - Hanya kirim `AvatarStateFrame(SPEAKING)` **satu kali** saat transisi masuk ke `SPEAKING` (bukan setiap chunk audio 24kHz).
    - Saat `ai_speaking == True`, naikkan ambang batas VAD (`barge_in_rms_threshold = max(0.035, self.vad_rms_threshold * 5)`) dan butuhkan beberapa chunk berturut-turut sebelum meneruskan audio ke Gemini Live API, sehingga pantulan suara speaker (echo) atau napas kecil tidak memicu false `interrupted` di Vertex AI Gemini Live.
  - `frontend/src/engine/vrm/VrmProceduralAnim.ts` & `frontend/src/engine/vrm/VrmAvatarEngine.ts`:
    - Gunakan exponential smoothing (`lerp`) pada seluruh target rotasi bone (`headRotation.x/y/z`, `chestRotation.x/y/z`) dan gerakan bernapas/bicara multi-frekuensi (natural perlin-like sine blend) agar transisi antar-state (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `INTERRUPTED`) selalu mengalir halus tanpa *pose snapping*.
    - Clamp `deltaTimeSec` yang dikirim ke `this.vrm.update(Math.min(deltaTimeSec, 1 / 30))` agar fisika `VRMC_springBone` tidak meledak saat ada frame drop.

---

## 3. Action Plan & Checklist
- [x] **Step 1:** Analisis akar masalah dari database transkrip sesi live (`interview_transcripts`), `InterviewRoomPage.tsx`, `session_orchestrator.py`, dan `VrmAvatarEngine.ts`.
- [x] **Step 2:** Perbaiki backend (`session_orchestrator.py` & `gemini_live_client.py`) agar tidak membanjiri frame `avatar.state` dan mencegah echo/noise memotong suara AI (`ai_speaking` anti-echo gate).
- [x] **Step 3:** Perbaiki `PcmStreamPlayer.ts` & `InterviewRoomPage.tsx` agar playback suara AI 24kHz selalu terdengar jernih (anti-false barge-in + native/unlocked `AudioContext`) dan hentikan 60 FPS Zustand re-render flood.
- [x] **Step 4:** Perbaiki `VrmProceduralAnim.ts` & `VrmAvatarEngine.ts` dengan full bone rotation damping/smoothing, clamp `vrm.update` timestep, dan natural idle/speaking motion.
- [x] **Step 5:** Jalankan unit test (`pytest` di backend, `vitest` & `vite build` di frontend) dan jalankan `graphify update .`.
- [x] **Step 6:** Update plan file ini dan `docs/STATE.md`.

---

## 4. Verification Criteria
1. Suara AI Interviewer terdengar utuh dari awal hingga akhir kalimat tanpa terputus oleh pantulan suara speaker atau noise ruangan.
2. Animasi 3D VRM (`alya.vrm` / `bima.vrm`) berjalan mulus 60 FPS tanpa *stuttering* React re-render dan tanpa patahan pose (*pose snapping*).
3. Seluruh unit test backend (`pytest`) dan frontend (`vitest` + `vite build`) lulus 100%.

---

## 5. Implementation Log & Actual Changes
- **Files Modified:**
  - `backend/app/ws/gemini_live_client.py`: Menambahkan state `self._ai_speaking` dan `self._barge_in_consecutive_chunks` pada `GoogleGenAIGeminiLiveSession`. Saat AI sedang berbicara (`_ai_speaking == True`), mengaktifkan **Anti-Echo Self-Interruption Gate** yang membutuhkan energi suara kandidat `rms >= max(0.045, vad_rms_threshold * 6.0)` selama minimal `6` chunk berturut-turut (`240ms`) sebelum dikirim ke `send_realtime_input`, sehingga suara bocoran speaker atau noise ruangan tidak memicu false `interrupted=True` di Vertex AI Gemini Live.
  - `backend/app/ws/session_orchestrator.py`: Mengubah pengiriman `AvatarStateFrame(AvatarStateId.SPEAKING)` agar hanya dikirim **satu kali** saat transisi masuk ke `SPEAKING` (`if not self.ai_speaking:`), bukan pada setiap chunk audio 24kHz.
  - `frontend/src/engine/audio/PcmStreamPlayer.ts`: Menggunakan native `AudioContext` (tanpa memaksa `sampleRate: 48000` yang dapat bentrok dengan `MicCaptureManager`) dan memastikan `ctx.resume()` selalu dipanggil saat `ctx.state !== 'running'`.
  - `frontend/src/pages/InterviewRoomPage.tsx`:
    - Menghapus pemanggilan `setAvatarTelemetry` 60 FPS dari callback `VrmAvatarEngine` dan melakukan *throttling* pada `setMicRmsLevel` (maksimal setiap `90ms` saat perubahan `> 0.003`), menghentikan ~85 full-page React re-renders per detik yang sebelumnya membuat animasi 3D tersendat.
    - Menghapus pemanggilan otomatis `wsClientRef.current?.sendBargeIn(...)` di dalam `onLocalVadSpeechStart` (cukup *local audio ducking* `setDucking(true)`), sehingga bocoran suara speaker tidak lagi mem-flush antrean `PcmStreamPlayer`.
  - `frontend/src/engine/vrm/VrmProceduralAnim.ts`: Menambahkan *exponential damping* (`boneLerp = 1 - Math.exp(-10.0 * dt)`) pada seluruh rotasi `currentHeadX/Y/Z` dan `currentChestX/Y/Z`, menghaluskan irama kepala multi-frekuensi saat bicara (`smoothedSpeechRms`), serta membiarkan siklus anggukan kepala (`isNodding`, `420ms`) selesai hingga tuntas tanpa terputus mendadak di tengah jalan.
  - `frontend/src/engine/vrm/VrmAvatarEngine.ts`: Meng-clamp `vrmDt = Math.max(0.001, Math.min(deltaTimeSec, 1 / 30))` sebelum `this.vrm.update(vrmDt)` agar fisika `VRMC_springBone` VRM 1.0 tidak meledak saat ada lonjakan frame, dan men-throttle `onTelemetry` ke 2 Hz (`500ms`).
  - `frontend/src/__tests__/audioAndVrmEngine.test.ts`: Menambahkan unit test untuk memverifikasi transisi rotasi bone yang halus antar-state (`< 0.015 rad` per frame 60 FPS).
- **Verification Results:**
  - `backend`: `.venv/bin/pytest -q` -> **10 passed**.
  - `frontend`: `npm test -- --run` -> **14 passed (14)**; `npm run build` -> **0 errors**.
  - `graphify update .` -> **1,250 nodes, 2,646 edges, 75 communities**.
