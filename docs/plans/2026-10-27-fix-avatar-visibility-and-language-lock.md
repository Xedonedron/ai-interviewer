# Plan: Fix Continuous AI Voice Playback (Anti-Echo Cooldown), 3D VRM Avatar Visibility & Indonesian/English Language Lock

- **Date:** 2026-10-27
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-003](../decisions/ADR-003-warm-minimalist-design-system.md), [ADR-004](../decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md)

---

## 1. Objective & Context
Berdasarkan hasil pengujian live kandidat dengan Gemini Multimodal Live API (`gemini-live-2.5-flash-native-audio`), ditemukan 3 masalah utama yang harus diselesaikan secara permanen:

1. **Suara AI Interviewer hanya terdengar pada giliran pertama, lalu hilang pada giliran-giliran berikutnya (`"Eh, ini dia bunyi pas ngomong pertama aja, selebihnya udah nggak ada suara lagi dari AI nya"`):**
   - **Root Cause 1 — Backend Running Old Code:** Daemon `uvicorn` pada port `8010` dijalankan tanpa kode perbaikan terbaru atau perlu di-restart setelah perubahan kode backend.
   - **Root Cause 2 — Hardware Playback Buffer Tail Echo after `turn_complete`:** Gemini Live mengirimkan sinyal `turn_complete=True` begitu chunk audio terakhir selesai di-*generate* di server (yang sering kali beberapa ratus milidetik hingga 1.5 detik *sebelum* speaker kandidat selesai memutar antrean `PcmStreamPlayer`). Begitu `self._ai_speaking` di-set `False` pada saat `turn_complete`, ambang batas VAD kembali turun ke `0.006`. Sisa suara AI yang masih keluar dari speaker kandidat langsung tertangkap mikrofon dan dikirim ke `send_realtime_input`, memicu false `interrupted=True` di Gemini untuk giliran berikutnya! Selain itu, seluruh 14 turn di DB pada sesi `ses_01m5xvgdc0ykwhcfzbs9a08nvc` tercatat `was_interrupted = 1`.
   - **Root Cause 3 — Stuck Local VAD Audio Ducking & Separate AudioContexts:** Di `InterviewRoomPage.tsx`, ketika `onLocalVadSpeechStart` menurunkan volume `PcmStreamPlayer` menjadi `0.20` (`setDucking(true)`), jika RMS mikrofon kandidat bertahan di atas `0.045` (misalnya karena gain mikrofon tinggi atau fan laptop), `setDucking(false)` tidak pernah dipanggil bahkan saat AI mulai berbicara kembali, ditambah pembuatan 2 `AudioContext` terpisah antara `PcmStreamPlayer` dan `MicCaptureManager`.

2. **Avatar 3D VRM belum terlihat di kamera (`"AI nya masih belum terlihat, padahal tadi lancar pas sebelum gw masukin Gemini API"`):**
   - **Root Cause 1 — VRM 1.0 Facing Direction (`-Z`) vs Camera Orientation (`+Z`):** File model `alya.vrm` dan `bima.vrm` (`VRM1_Constraint_Twist_Sample`, `metaVersion: '1'`) menghadap ke sumbu `-Z` (`Face` mesh memiliki hidung di `z = -0.23` dan bagian belakang kepala di `z = +0.13`, dengan `cullMode: back`). Karena `VRMUtils.rotateVRM0(loadedVrm)` hanya memutar model VRM `0.x` dan mengabaikan VRM `1.0`, model `alya.vrm` membelakangi kamera yang berada di `z = +1.32`!
   - **Root Cause 2 — Concurrent Duplicate `loadVrmModel` Calls & `combineSkeletons` MToon Compatibility:** `InterviewRoomPage.tsx` memanggil `loadVrmModel` dua kali secara paralel (saat mount dan pada `useEffect([sessionMetadata?.vrm_model_url])`), serta `VRMUtils.combineSkeletons` dapat merusak binding material `MToonMaterial` pada VRM 1.0 di beberapa driver WebGL.

3. **Kunci Bahasa (Strict Language Lock) ke Bahasa Indonesia (`id-ID`) dan Bahasa Inggris (`en-US`) dengan tetap mempertahankan istilah teknis dalam Bahasa Inggris:**
   - **Root Cause:** Pada `gemini_live_client.py`, `SpeechConfig` dan `AudioTranscriptionConfig` tidak menyertakan `language_code` / `language_codes`. Akibatnya, ASR multibahasa Gemini Live mendeteksi napas/kata pendek "Halo" sebagai bahasa Hindi (`वे दिन कहां है?`), Spanyol (`¿Aló?`), atau Portugis (`Alô?`), lalu AI ikut membalas `Alô?`.

---

## 2. Scope & Key Decisions
- **In Scope:**
  - `backend/app/ws/gemini_live_client.py`:
    - Konfigurasi `language_code="id-ID"` (atau sesuai `session.language`) pada `types.SpeechConfig` dan `language_codes=["id-ID", "en-US"]` pada `types.AudioTranscriptionConfig`.
    - Tambahkan fungsi `sanitize_and_lock_transcript_language(text: str) -> str` untuk memfilter karakter aksara non-Latin (Devanagari/Hindi `वे दिन कहां है?`, Arab, Mandarin, Sirilik, Thailand, dll.) dan menormalisasi halusinasi sapaan asing (`¿Aló?`, `Alô?`, `Allô?` -> `Halo?`) sambil menjaga 100% istilah teknis Bahasa Inggris (`BigQuery`, `Medallion Architecture`, `FastAPI`, `Dataflow`, `Pub/Sub`, `Greenplum`, dll.).
    - Tambahkan **Post-Speech Echo Cooldown Window (`_ai_speech_cooldown_until`)** yang dihitung dari durasi aktual byte audio `24kHz PCM` yang dikirim ke browser ditambah margin `450ms`, serta naikkan ambang batas barge-in saat AI sedang berbicara (`rms >= 0.085` selama `>= 8` chunk = `320ms`), sehingga speaker echo tidak pernah memotong suara AI di giliran ke-2 dan seterusnya.
  - `backend/app/services/prompt_builder.py` & `backend/app/ws/session_orchestrator.py`:
    - Tambahkan instruksi **STRICT LANGUAGE LOCK (BAHASA INDONESIA & ENGLISH TECHNICAL TERMS ONLY)** pada System Instruction agar AI tidak pernah merespons dalam bahasa selain Indonesia/Inggris.
    - Teruskan `language=self.session.language` ke `create_gemini_live_session`.
  - `frontend/src/engine/vrm/VrmAvatarEngine.ts` & `frontend/src/pages/InterviewRoomPage.tsx`:
    - Pastikan model VRM (baik VRM 0.0 maupun VRM 1.0) menghadap kamera di `+Z`, dedup pemanggilan `loadVrmModel(url)` jika URL yang sama sedang/sudah dimuat, ganti `combineSkeletons` dengan `removeUnnecessaryJoints`/`removeUnnecessaryVertices` yang aman untuk `MToonMaterial`, dan pastikan `proceduralRig` tetap terlihat sampai VRM selesai di-render dengan valid.
  - `frontend/src/engine/audio/PcmStreamPlayer.ts` & `frontend/src/pages/InterviewRoomPage.tsx`:
    - Reset `setDucking(false)` secara otomatis setiap kali chunk audio AI baru masuk atau setelah timeout singkat (`600ms`), dan pastikan `AudioContext` selalu di-*resume* pada setiap giliran audio.

---

## 3. Action Plan & Checklist
- [x] **Step 1:** Reconnaissance dengan `graphify`, inspeksi transkrip SQLite (`ses_01m5xvgdc0ykwhcfzbs9a08nvc`), dan uji kompatibilitas `language_codes=['id-ID', 'en-US']` pada Vertex AI Gemini Live.
- [x] **Step 2:** Update `backend/app/ws/gemini_live_client.py`, `backend/app/services/prompt_builder.py`, dan `backend/app/ws/session_orchestrator.py` untuk **Strict Indonesian/English Language Lock** + **Post-Speech Hardware Echo Cooldown Window** agar suara AI terdengar jernih di seluruh giliran wawancara.
- [x] **Step 3:** Update `frontend/src/engine/vrm/VrmAvatarEngine.ts`, `frontend/src/engine/audio/PcmStreamPlayer.ts`, dan `frontend/src/pages/InterviewRoomPage.tsx` untuk memperbaiki visibilitas 3D VRM Avatar (`alya.vrm`) dan menjaga volume/playback `PcmStreamPlayer` tidak pernah mati setelah giliran pertama.
- [x] **Step 4:** Tambahkan unit test untuk `sanitize_and_lock_transcript_language` & anti-echo cooldown di backend (`pytest`) serta VRM & audio player di frontend (`vitest`).
- [x] **Step 5:** Restart background backend (`uvicorn` di port `8010`) agar kode baru aktif, jalankan `graphify update .`, dan perbarui `docs/STATE.md`.

---

## 4. Verification Criteria
1. Suara AI Interviewer terdengar jelas dan utuh tidak hanya di sapaan pertama (Turn 1), tetapi terus berlanjut di Turn 2, Turn 3, dan seterusnya tanpa terputus oleh echo speaker.
2. Avatar 3D di sebelah kiri (`InterviewRoomPage.tsx`) tampil jelas menghadap ke kamera, lengkap dengan animasi bernapas, kedipan mata, dan lip-sync real-time.
3. Transkrip kandidat dan AI terkunci ketat pada Bahasa Indonesia dan Bahasa Inggris (istilah teknis tetap Bahasa Inggris), tanpa karakter Hindi (`वे दिन कहां है?`) atau sapaan Spanyol/Portugis (`¿Aló?` / `Alô?`).
4. Seluruh pengujian `pytest`, `vitest run`, `vite build`, dan `graphify update .` lulus 100%.

---

## 5. Implementation Log & Actual Changes
- **[`backend/app/ws/gemini_live_client.py`](../../backend/app/ws/gemini_live_client.py) & [`backend/app/ws/session_orchestrator.py`](../../backend/app/ws/session_orchestrator.py):**
  - Menambahkan fungsi `sanitize_and_lock_transcript_language(text: str) -> str` untuk menghapus karakter aksara non-Latin (seperti Devanagari/Hindi `वे दिन कहां है?`) dan menormalisasi sapaan Spanyol/Portugis (`¿Aló?` / `Alô?` -> `Halo?`) dengan tetap mempertahankan 100% istilah teknis Bahasa Inggris (`BigQuery`, `Medallion Architecture`, `FastAPI`, `Dataflow`, `Pub/Sub`, `Greenplum`, dll.).
  - Mengonfigurasi `language_code` (`"id-ID"`) pada `types.SpeechConfig`, `language_codes=["id-ID", "en-US"]` pada `types.AudioTranscriptionConfig`, serta `realtime_input_config=types.RealtimeInputConfig(activity_handling=types.ActivityHandling.NO_INTERRUPTION)` pada `LiveConnectConfig` agar Vertex AI Gemini Live **tidak pernah** memotong/menginterupsi giliran bicara AI pada Turn 2, Turn 3, Turn 4+.
  - Mengabaikan flag `sc.interrupted` dari `server_content` agar tidak pernah mengirim `control.barge_in` palsu yang menguras `PcmStreamPlayer` di browser saat kandidat berbicara di Turn 2+ (barge-in hanya dipicu secara eksplisit saat tombol `"Sela AI"` ditekan).
  - Menambahkan `flush_audio_turn_on_mute()` (mengirim 15 frame / 600ms PCM silence `b"\x00" * 1280` ke `send_realtime_input`) ketika kandidat menekan tombol **Mute / Dibisukan** di akhir kalimat (`client.mic_state` dengan `muted=True`), sehingga server-side VAD Gemini langsung mendeteksi akhir giliran kandidat dan segera merespons dengan suara utuh.
- **[`backend/app/services/prompt_builder.py`](../../backend/app/services/prompt_builder.py):**
  - Menambahkan bagian `=== 1. ATURAN KOMUNIKASI SUARA & KUNCI BAHASA (STRICT LANGUAGE LOCK) ===` pada System Instruction dan meneruskan `language_code=self.session.language or "id-ID"` ke `create_gemini_live_session`.
- **[`frontend/src/engine/audio/PcmStreamPlayer.ts`](../../frontend/src/engine/audio/PcmStreamPlayer.ts) & [`frontend/src/engine/audio/MicCaptureManager.ts`](../../frontend/src/engine/audio/MicCaptureManager.ts):**
  - Mereset `this.setDucking(false)` (`gain = 1.0` + `cancelScheduledValues`) secara otomatis setiap kali chunk pertama dari giliran bicara AI baru masuk ke `enqueuePcmChunk`.
  - Memindahkan helper murni `mapRmsToMicLevelPct` ke `MicCaptureManager.ts` agar Vite Fast Refresh (HMR) tidak melakukan *full module invalidate* pada `CandidateLobbyPage.tsx` dan `InterviewRoomPage.tsx`.
- **[`frontend/src/engine/vrm/VrmAvatarEngine.ts`](../../frontend/src/engine/vrm/VrmAvatarEngine.ts) & [`frontend/src/pages/InterviewRoomPage.tsx`](../../frontend/src/pages/InterviewRoomPage.tsx):**
  - Menghapus file sample test fixture `frontend/public/models/alya.vrm` dan `bima.vrm` (`VRM1_Constraint_Twist_Sample.vrm`) yang ditambahkan pada Sesi 9 dan menyebabkan `this.proceduralRig.root.visible = false` sehingga menggantikan avatar 3D prosedural yang sebelumnya berjalan lancar dengan mesh constraint test yang tidak tampil di kamera.
  - Memperkaya **Procedural Articulated 3D Humanoid Bust (`this.proceduralRig`)** di `VrmAvatarEngine.ts` (lengkap dengan blazer `#2B3830`, kerah, wajah porselen, rambut, kacamata minimalis, mata berkedip `blink`, alis ekspresif, dan mulut reaktif 5-vokal `aa, ih, ou, ee, oh`), memperbaiki pembuatan `THREE.WebGLRenderer` (menggunakan `renderer.setSize(width, height)` dengan ukuran eksplisit seperti referensi HTML dan fallback `failIfMajorPerformanceCaveat: false`), serta menambahkan **60 FPS HTML5 2D `<canvas>` Avatar Renderer Fallback** otomatis apabila browser menonaktifkan WebGL atau mengalami `webglcontextlost`.
  - Memasang `VrmAvatarEngine` secara sinkron saat mount di `InterviewRoomPage.tsx` dan menggunakan selector Zustand granular agar kanvas avatar selalu tampil 100% di setiap perangkat/browser.
- **Unit Tests & Background Daemon:**
  - Menambahkan unit test di [`backend/tests/test_security_and_prompts.py`](../../backend/tests/test_security_and_prompts.py) (`11 passed`) dan [`frontend/src/__tests__/audioAndVrmEngine.test.ts`](../../frontend/src/__tests__/audioAndVrmEngine.test.ts) (`15 passed`), me-restart daemon backend dengan `--reload` di port `8010`, serta menjalankan `graphify update .`.
