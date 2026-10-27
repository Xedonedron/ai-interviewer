# Plan: Frontend Audio Capture, Lobby Mic Meter & 3D VRM 1.0 Rendering Fixes

- **Date:** 2026-10-27
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-003](../decisions/ADR-003-warm-minimalist-design-system.md), [ADR-004](../decisions/ADR-004-vertex-ai-live-audio-and-cost-guardrails.md)

---

## 1. Objective & Context
Setelah integrasi backend Vertex AI (`gemini-live-2.5-flash-native-audio`) berjalan sukses dan mampu mengirim audio 24kHz PCM + transkrip ke frontend, ditemukan 3 bug kritis di sisi frontend (`frontend/`):
1. **"Uji Suara Anda" di `CandidateLobbyPage.tsx` masih 100% dummy (`Math.random()`)**: Stream mikrofon langsung di-stop saat enumerasi perangkat dan level meter digerakkan oleh timer acak `25 + Math.random() * 45`, sehingga kandidat tidak mengetahui apakah mikrofon mereka benar-benar aktif atau diblokir.
2. **Mikrofon Kandidat di `MicCaptureManager.ts` & `InterviewRoomPage.tsx` tidak mengirim audio ke Backend**:
   - `AudioWorkletNode` (`this.workletNode`) tidak dihubungkan ke `this.audioContext.destination` (melalui silent `GainNode` dengan `gain.value = 0`), sehingga di Chromium audio thread men-suspend pemanggilan `process(inputs)`.
   - Pemaksaan `new AudioContext({ sampleRate: 16000 })` menyebabkan `createMediaStreamSource` gagal pada beberapa browser/OS ketika hardware mic berjalan di 48000 Hz, padahal `pcm-capture-processor.js` sudah memiliki logika downsampling otomatis ke 16000 Hz.
   - Tidak ada indikator visual level suara (`micRmsLevel`) pada tombol `#dock-btn-mic` di `InterviewRoomPage.tsx`, dan kegagalan `startCapture()` ditelan diam-diam (`catch {}`).
3. **Avatar 3D VRM menghilang di `InterviewRoomPage.tsx` / `VrmAvatarEngine.ts` + duplikasi WebSocket akibat React StrictMode**:
   - File `alya.vrm` dan `bima.vrm` adalah model **VRM 1.0** (`VRMC_vrm`, `VRMC_springBone`). Di `VrmAvatarEngine.ts`, pemanggilan `VRMUtils.removeUnnecessaryJoints` sudah deprecated, rotasi lengan T-pose untuk VRM 1.0 terbalik (`+1.15` mengangkat tangan ke atas kepala), dan `loadVrmModel()` adalah async tanpa pengecekan flag `this.disposed` ketika React `<StrictMode>` melakukan `mount -> dispose -> mount`.
   - `#three-canvas-container` tidak memiliki kelas dimensi eksplisit (`w-full h-full min-h-[320px]`) dan kanvas Three.js perlu diposisikan `position: absolute; inset: 0` agar `ResizeObserver` selalu mendapatkan ukuran container yang akurat.
   - `useEffect` di `InterviewRoomPage.tsx` langsung membuka WebSocket pada mount pertama React StrictMode yang langsung di-unmount enkele milidetik kemudian, memicu 2 koneksi WebSocket simultan untuk 1 sesi.

---

## 2. Scope & Key Decisions
- **In Scope:**
  - `frontend/src/pages/CandidateLobbyPage.tsx`: Implementasi Web Audio API (`AudioContext` + `MediaStreamAudioSourceNode` + `AnalyserNode`) untuk real-time mic meter (`micLevelPct` 0% saat diam, naik responsif hingga 100% saat berbicara) di `wizardStep === 2`, deteksi Secure Context / izin mikrofon ditolak dengan pesan peringatan jelas di UI, serta cleanup stream saat keluar dari Step 2 atau pindah halaman.
  - `frontend/src/engine/audio/MicCaptureManager.ts`: Gunakan native `new AudioContext()` (dengan fallback aman) agar tidak bentrok dengan sample rate hardware 48kHz, tambahkan `silentGainNode` (`gain.value = 0`) yang menghubungkan `sourceNode -> workletNode -> silentGainNode -> audioContext.destination`, dan pastikan `pcm-capture-processor.js` terus memproses frame 16kHz `PCM_S16LE`.
  - `frontend/src/engine/vrm/VrmAvatarEngine.ts`: Tambahkan guard `disposed` setelah `await loader.loadAsync(url)`, ganti `removeUnnecessaryJoints` dengan `combineSkeletons`, perbaiki arah rotasi lengan rileks untuk VRM 1.0 vs VRM 0.0, pastikan kamera ter-frame presisi pada bagian wajah/bust (`head` + `leftEye`), pastikan kanvas menggunakan `position: absolute; inset: 0`, dan pertahankan `auraRing` subtle di belakang model.
  - `frontend/src/pages/InterviewRoomPage.tsx`: Cegah duplikasi koneksi WebSocket & `MicCaptureManager` pada React `<StrictMode>` double-mount, tambahkan `w-full h-full min-h-[320px]` pada `#three-canvas-container`, tampilkan indikator visual level suara (`micRmsLevel`) pada tombol `#dock-btn-mic`, serta tampilkan banner/toast peringatan jika mikrofon gagal diakses.
  - `frontend/src/__tests__/audioAndVrmEngine.test.ts`: Tambahkan unit test untuk memverifikasi koneksi `silentGainNode` di `MicCaptureManager`, siklus `dispose()` saat async `loadVrmModel` di `VrmAvatarEngine`, dan kalkulasi level suara.
- **Out of Scope:**
  - Perubahan skema database atau endpoint REST backend.

---

## 3. Action Plan & Checklist
- [x] **Step 1:** Reconnaissance dengan `graphify query` & `graphify affected` serta inspeksi file model VRM 1.0 (`alya.vrm`, `bima.vrm`).
- [x] **Step 2:** Perbaiki Masalah 1 di `frontend/src/pages/CandidateLobbyPage.tsx` (real-time Web Audio `AnalyserNode` mic level meter di Step 2, error/warning banner untuk izin mic / non-Secure Context, dan stream cleanup).
- [x] **Step 3:** Perbaiki Masalah 2 di `frontend/src/engine/audio/MicCaptureManager.ts` (native `AudioContext` + `silentGainNode` `gain=0` terhubung ke `destination`) dan `frontend/src/pages/InterviewRoomPage.tsx` (visual RMS meter/ring pada `#dock-btn-mic` + error toast/alert mikrofon).
- [x] **Step 4:** Perbaiki Masalah 3 di `frontend/src/engine/vrm/VrmAvatarEngine.ts` (VRM 1.0 `combineSkeletons`, `disposed` guard setelah `loadAsync`, koreksi rotasi lengan VRM 1.0, camera framing wajah, `position: absolute; inset: 0`) dan `frontend/src/pages/InterviewRoomPage.tsx` (`#three-canvas-container` `w-full h-full min-h-[320px]`, guard anti-duplikasi WebSocket & AudioWorklet saat React StrictMode).
- [x] **Step 5:** Tambahkan dan jalankan unit test (`npm test` & `npm run build` di `frontend/`).
- [x] **Step 6:** Jalankan `graphify update .` dan perbarui dokumentasi (`docs/STATE.md` & plan log ini).

---

## 4. Verification Criteria
1. Di `CandidateLobbyPage.tsx` Step 2 ("Kalibrasi Suara"), `micLevelPct` bernilai `0%` saat hening dan bergerak secara real-time mengikuti RMS input mikrofon asli dari `AnalyserNode` (tanpa `Math.random()`), serta menampilkan pesan error yang jelas bila mikrofon ditolak atau diakses dari non-Secure Context (`!window.isSecureContext` / `!navigator.mediaDevices`).
2. Di `MicCaptureManager.ts`, `workletNode` terhubung ke `silentGainNode` (`gain.value = 0`) lalu ke `audioContext.destination`, menggunakan native `AudioContext` tanpa error sampleRate mismatch, dan mengirim paket `PCM_S16LE` 16kHz (1,280 bytes) ke WebSocket.
3. Di `InterviewRoomPage.tsx`, tombol `#dock-btn-mic` menampilkan indikator level suara secara real-time saat kandidat berbicara, dan menampilkan peringatan jika mikrofon gagal dibuka.
4. Di `VrmAvatarEngine.ts` & `InterviewRoomPage.tsx`, model VRM 1.0 (`alya.vrm` / `bima.vrm`) maupun fallback `proceduralRig` tampil stabil di tengah `#three-canvas-container`, tidak hilang saat React StrictMode double-mount, dan lip-sync bergerak mengikuti suara AI.
5. `npm test` (Vitest) dan `npm run build` (TypeScript + Vite build) di `frontend/` lulus 100% tanpa error, serta `graphify update .` berjalan bersih.

---

## 5. Implementation Log & Actual Changes
- **Files Created / Modified:**
  - `frontend/src/pages/CandidateLobbyPage.tsx` — Menambahkan fungsi `mapRmsToMicLevelPct(rms)` dan mengganti timer dummy `Math.random()` pada Step 2 (`wizardStep === 2`) dengan pipeline Web Audio API asli (`getUserMedia` -> `AudioContext` -> `MediaStreamAudioSourceNode` -> `AnalyserNode` -> `silentGainNode (gain=0)` -> `audioContext.destination`) yang menghitung RMS secara real-time setiap 50ms (`computeFrameRms`), menampilkan `#mic-error-banner` jika mikrofon diblokir atau diakses dari non-Secure Context (`window.isSecureContext === false`), serta membersihkan seluruh track dan `AudioContext` saat berpindah step atau keluar dari Lobby.
  - `frontend/src/engine/audio/MicCaptureManager.ts` — Mengganti `new AudioContext({ sampleRate: 16000 })` menjadi native `new AudioContext()` (dengan fallback otomatis) agar tidak gagal saat `createMediaStreamSource` di perangkat 48kHz, menambahkan `silentGainNode` (`gain.value = 0`), dan menghubungkan `sourceNode -> workletNode -> silentGainNode -> audioContext.destination` agar `AudioWorkletNode.process(inputs)` tidak pernah di-suspend oleh Chromium.
  - `frontend/src/engine/vrm/VrmAvatarEngine.ts` — Menambahkan flag `disposed` dan method `isDisposed()`, memeriksa `this.disposed` sebelum dan sesudah `await loader.loadAsync(url)` (serta memanggil `VRMUtils.deepDispose(loadedVrm.scene)` bila instance sudah di-dispose oleh React StrictMode), mengganti `VRMUtils.removeUnnecessaryJoints` yang deprecated dengan `VRMUtils.combineSkeletons`, memperbaiki arah rotasi lengan rileks untuk VRM 1.0 (`-armRelaxAngle` pada `leftUpperArm` dan `+armRelaxAngle` pada `rightUpperArm`), memanggil `loadedVrm.update(0)` sebelum membaca posisi world bone `head`/`leftEye` untuk framing kamera, dan mengatur kanvas Three.js dengan `position: absolute; inset: 0`.
  - `frontend/src/pages/InterviewRoomPage.tsx` — Menambahkan kelas `w-full h-full min-h-[320px]` pada `#three-canvas-container`, menunda pembukaan koneksi WebSocket (`wsClient.connect()`) dan `startMicAutomatically()` selama `25ms` dengan `clearTimeout` pada cleanup `useEffect` untuk mencegah duplikasi koneksi akibat React 18 `<StrictMode>` double-mount, menampilkan alert `#room-mic-alert` jika mikrofon gagal diakses, serta menambahkan indikator visual level suara (`#dock-mic-level-meter` + dynamic border ring) pada tombol `#dock-btn-mic`.
  - `frontend/src/__tests__/audioAndVrmEngine.test.ts` — Menambahkan 3 unit test baru untuk memverifikasi `mapRmsToMicLevelPct`, topologi koneksi `MicCaptureManager` (`MediaStreamAudioSourceNode -> AudioWorkletNode -> SilentGainNode (gain=0) -> AudioContext.destination`), dan siklus `VrmAvatarEngine.dispose()`.
- **Deviations from Plan:** Tidak ada deviasi dari rencana.
- **Verification Results:**
  - `cd /srv/projects/ai-interviewer/frontend && npm test -- --run`: **13 passed (13)** dalam 1 test suite.
  - `cd /srv/projects/ai-interviewer/frontend && npm run build`: **TypeScript `tsc --noEmit` & Vite production build sukses (0 errors)**.
  - `graphify update .`: **Rebuilt 1,243 nodes, 2,617 edges, 76 communities**.
