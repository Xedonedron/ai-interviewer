# Plan: Phase 2 — Frontend Development & Standalone Validation (`frontend/`)

- **Date:** 2026-10-26
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md), [ADR-002](../decisions/ADR-002-backend-tech-stack-and-session-protocol.md)
- **Related Contracts:** [rest-api-contract.md](../contracts/rest-api-contract.md), [websocket-protocol.md](../contracts/websocket-protocol.md), [audio-pipeline-spec.md](../contracts/audio-pipeline-spec.md), [vrm-avatar-states.md](../contracts/vrm-avatar-states.md)

---

## 1. Objective & Context
Membangun aplikasi Frontend secara utuh di `/srv/projects/ai-interviewer/frontend/` untuk **Real-Time AI Interviewer Platform** yang mencakup:
1. **Shared TypeScript DTOs & Zustand Store:** Kontrak 1:1 dengan `rest-api-contract.md` dan `websocket-protocol.md`.
2. **Full-Duplex Web Audio Engine:** `AudioWorklet` (`pcm-capture-processor.js`) untuk downsampling ke 16kHz `PCM_S16LE` chunk 40ms (`1,280 bytes`) + Local VAD Ducking, serta `PcmStreamPlayer` untuk gapless playback 24kHz `PCM_S16LE` dengan `AnalyserNode` formant extraction dan `<50ms` instant barge-in flush.
3. **3D VRM Avatar Engine:** `Three.js` + `@pixiv/three-vrm` (`VrmAvatarEngine`, `VrmLipSync`, `VrmProceduralAnim`, `QualityGovernor`) lengkap dengan model VRM default dan procedural humanoid fallback ber-blendshape (`aa`, `ih`, `ou`, `ee`, `oh`, `blink`, `happy`, `relaxed`, `neutral`, `surprised`) agar dijamin selalu berjalan 60 FPS di semua browser.
4. **Standalone Simulator Harness (`MockInterviewHarness`):** Generator sinyal suara formant 24kHz PCM sintetis (`350 Hz` low, `1,100 Hz` mid, `2,400 Hz` high dengan syllable envelope) dan Interactive Simulator Control Overlay untuk mengetes AI Speaking, Lip-Sync, Barge-In (`<50ms`), Avatar States/Emotions, Stage Progression, dan Network Reconnect tanpa backend.
5. **Seluruh 6 Halaman UI:** `RecruiterDashboardPage`, `RecruiterSetupPage`, `CandidateLobbyPage`, `InterviewRoomPage`, `InterviewCompletedPage`, dan `EvaluationReportPage`.
6. **Validasi Gate Fase 2:** `tsc --noEmit`, `vite build`, dan `vitest` unit test suite untuk pembuktian matematis kuantisasi PCM, viseme smoothing/clamping (`<= 1.15`), state machine avatar, dan barge-in flush `<50ms`.

---

## 2. Scope & Key Decisions
- **In Scope:**
  - Inisialisasi workspace `frontend/` (Vite + React 18 + TypeScript + Tailwind CSS + Lucide Icons + Zustand + Three.js + `@pixiv/three-vrm` + Vitest).
  - Implementasi `src/types/api.types.ts` & `src/types/ws.types.ts` 100% sesuai kontrak.
  - Implementasi `public/worklets/pcm-capture-processor.js`, `src/engine/audio/MicCaptureManager.ts`, dan `src/engine/audio/PcmStreamPlayer.ts`.
  - Implementasi `src/engine/vrm/VrmAvatarEngine.ts`, `src/engine/vrm/VrmLipSync.ts`, `src/engine/vrm/VrmProceduralAnim.ts`, dan `src/engine/vrm/QualityGovernor.ts`.
  - Implementasi `src/services/apiClient.ts`, `src/services/wsClient.ts`, `src/services/simulator/mockFixtures.ts`, dan `src/services/simulator/MockInterviewHarness.ts`.
  - Implementasi `src/store/useInterviewStore.ts` dan seluruh 6 halaman UI + Simulator Control Panel Overlay.
  - Pembuatan unit tests di `src/__tests__/` dan eksekusi `vitest run`, `npm run typecheck`, serta `npm run build`.
  - Sinkronisasi Knowledge Graph (`graphify update .`).
- **Out of Scope:**
  - Implementasi Backend FastAPI & PostgreSQL (dijadwalkan pada Fase 3).
- **Key Decisions Agreed:**
  - Menyediakan loader `.vrm` standar (`public/models/alya.vrm`) sekaligus **Procedural Articulated Humanoid & Expression Rig Fallback** di `VrmAvatarEngine.ts` yang mengimplementasikan interface ekspresi & tulang yang sama sehingga viseme `aa, ih, ou, ee, oh`, kedipan mata, dan gerakan kepala selalu terlihat hidup 60 FPS baik dari file `.vrm` maupun fallback prosedural.
  - Mode Simulator aktif secara default ketika `VITE_USE_MOCK !== 'false'` atau query string `?mock=true` (dan otomatis fallback ke Mock Interceptor bila backend belum berjalan), sehingga seluruh 6 halaman dan ruang wawancara interaktif dapat langsung diuji secara standalone.

---

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat dokumen plan `docs/plans/2026-10-26-phase-2-frontend-and-standalone-validation.md`.
- [x] **Step 2:** Inisialisasi proyek `frontend/` (`package.json`, `tsconfig.json`, `vite.config.ts`, Tailwind CSS, `index.html`) dan instalasi dependensi.
- [x] **Step 3:** Implementasi kontrak TypeScript 1:1 di `src/types/api.types.ts` dan `src/types/ws.types.ts`.
- [x] **Step 4:** Implementasi Web Audio Pipeline (`public/worklets/pcm-capture-processor.js`, `src/engine/audio/MicCaptureManager.ts`, `src/engine/audio/PcmStreamPlayer.ts`).
- [x] **Step 5:** Implementasi 3D VRM Engine (`src/engine/vrm/VrmLipSync.ts`, `src/engine/vrm/VrmProceduralAnim.ts`, `src/engine/vrm/QualityGovernor.ts`, `src/engine/vrm/VrmAvatarEngine.ts`).
- [x] **Step 6:** Implementasi Zustand Store (`src/store/useInterviewStore.ts`), Services (`apiClient.ts`, `wsClient.ts`), dan Standalone Simulator (`mockFixtures.ts`, `MockInterviewHarness.ts`).
- [x] **Step 7:** Implementasi ke-6 halaman UI (`RecruiterDashboardPage`, `RecruiterSetupPage`, `CandidateLobbyPage`, `InterviewRoomPage`, `InterviewCompletedPage`, `EvaluationReportPage`) + Navigation & Simulator Control Overlay.
- [x] **Step 8:** Tulis dan jalankan unit test `vitest` (`pcm-quantization`, `viseme-lipsync`, `avatar-state-machine`, `barge-in-flush`), `npm run typecheck`, dan `npm run build`.
- [x] **Step 9:** Jalankan `graphify update .`, perbarui log plan ini, dan update `docs/STATE.md`.

---

## 4. Verification Criteria (Gate Validasi Fase 2)
- **Gate 2.1:** `npm run typecheck` (`tsc --noEmit`) dan `npm run build` berjalan dengan **0 error**.
- **Gate 2.2:** Unit test `vitest` lulus 100% (10/10 tests) memverifikasi kuantisasi `Float32 -> Int16` (chunk 40ms = `1,280 bytes`), normalisasi budget viseme (`aa + ih + ou + ee + oh <= 1.15`) & asymmetric exponential smoothing, state machine avatar (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `INTERRUPTED`), serta `PcmStreamPlayer.flushPlaybackQueue()` `< 50ms`.
- **Gate 2.3:** Seluruh 6 halaman UI dan `MockInterviewHarness` berfungsi secara standalone.
- **Gate 2.4:** `graphify update .` berjalan bersih dan modul `frontend/` masuk ke `graphify-out/graph.json` (`611 nodes`, `1,025 edges`, `27 communities`).

---

## 5. Implementation Log & Actual Changes
- **Files Created:**
  - `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/tailwind.config.js`, `frontend/postcss.config.js`, `frontend/index.html`
  - `frontend/src/types/api.types.ts`, `frontend/src/types/ws.types.ts`
  - `frontend/public/worklets/pcm-capture-processor.js`, `frontend/src/engine/audio/MicCaptureManager.ts`, `frontend/src/engine/audio/PcmStreamPlayer.ts`
  - `frontend/src/engine/vrm/VrmLipSync.ts`, `frontend/src/engine/vrm/VrmProceduralAnim.ts`, `frontend/src/engine/vrm/QualityGovernor.ts`, `frontend/src/engine/vrm/VrmAvatarEngine.ts`, `frontend/public/models/README.md`
  - `frontend/src/services/simulator/mockFixtures.ts`, `frontend/src/services/simulator/MockInterviewHarness.ts`, `frontend/src/services/apiClient.ts`, `frontend/src/services/wsClient.ts`
  - `frontend/src/store/useInterviewStore.ts`
  - `frontend/src/pages/RecruiterDashboardPage.tsx`, `frontend/src/pages/RecruiterSetupPage.tsx`, `frontend/src/pages/CandidateLobbyPage.tsx`, `frontend/src/pages/InterviewRoomPage.tsx`, `frontend/src/pages/InterviewCompletedPage.tsx`, `frontend/src/pages/EvaluationReportPage.tsx`
  - `frontend/src/App.tsx`, `frontend/src/main.tsx`, `frontend/src/index.css`
  - `frontend/src/__tests__/audioAndVrmEngine.test.ts`
- **Validation & Graphify Sync:**
  - `npm run typecheck` (`tsc --noEmit`): 0 errors.
  - `npm test` (`vitest run`): 10 passed (10).
  - `npm run build` (`vite build`): succeeded (`dist/` built cleanly).
  - `graphify update .`: Rebuilt graph with `611 nodes`, `1025 edges`, `27 communities`.
