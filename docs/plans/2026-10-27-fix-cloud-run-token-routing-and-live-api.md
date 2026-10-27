# Implementation Plan: Fix Cloud Run Token Routing & Live Gemini API Connection

- **Date:** 2026-10-27
- **Author:** Antigravity Agent
- **Topic:** Fix Candidate Token Passthrough and Bypass of Mock Simulator for Live Vertex AI Gemini Audio in Cloud Run

---

## 1. Context & Problem Statement
Setelah implementasi Cloud Run selesai di deploy (`https://ai-interviewer-800933197735.asia-southeast2.run.app`), user mendapati bahwa saat membuka ruang wawancara, suara yang keluar adalah "suara default pertama kali" (suara robotik formant generator dari simulator Phase 2) dan bukan suara AI interaktif dari Vertex AI Live API (`gemini-live-2.5-flash-native-audio`).

### Root Cause Analysis:
1. **Recruiter Navigation Link Lacks Token:**
   Di `frontend/src/pages/RecruiterDashboardPage.tsx`, tombol tautan "Lobby" (`/interview/${item.session_id}/lobby`) dan "Ruang Wawancara" (`/interview/${item.session_id}/room`) tidak menyertakan query parameter `?token=...`.
2. **Missing Token Fallback to Simulator:**
   Ketika `InterviewRoomPage` dibuka tanpa parameter `?token=...`, variabel `token` mengambil default value `'sim_ws_token'`.
3. **Aggressive Mock Mode Trigger in `wsClient.ts`:**
   Di `frontend/src/services/wsClient.ts`:
   ```typescript
   this.useMock = forceMock ?? (isSimulatorModeEnabled() || (!resolved && token === 'sim_ws_token'));
   ```
   Karena `token === 'sim_ws_token'` dan token belum ada di cache, `this.useMock` mengevaluasi ke `true`. Akibatnya, `InterviewWsClient` sama sekali tidak pernah membuka koneksi WebSocket ke Backend Cloud Run (`/ws/interview/{sessionId}`), melainkan mengaktifkan `MockInterviewHarness` yang memutar synthesizer formant Web Audio statis. Log Nginx Cloud Run membuktikan bahwa tidak ada request `GET /ws/interview/...` sama sekali!
4. **Backend List Sessions & Metadata DTO Lacks Candidate Token:**
   Di `backend/app/schemas/api_schemas.py` dan `backend/app/api/v1/sessions.py`, `SessionListItemDto` dan `CandidateSessionMetadataResponse` belum menyediakan `candidate_token` atau `candidate_join_url` dengan token terpasang, sehingga frontend tidak dapat me-resolve token secara otomatis saat dikunjungi langsung.

---

## 2. Proposed Changes

### A. Backend (`backend/app/`):
1. **Update DTOs (`backend/app/schemas/api_schemas.py`):**
   - Tambahkan `candidate_join_url: str` dan `candidate_token: str | None = None` pada `SessionListItemDto`.
   - Tambahkan `candidate_token: str | None = None` pada `CandidateSessionMetadataResponse`.
2. **Update Sessions Controller (`backend/app/api/v1/sessions.py`):**
   - Pada `list_sessions`: Untuk setiap sesi, terbitkan token candidate valid menggunakan `create_ephemeral_session_token(session_id=s.id)` dan sertakan `candidate_join_url` (misal `/interview/{s.id}/lobby?token={token.token}`) serta `candidate_token`.
   - Pada `get_session_metadata`: Sertakan `candidate_token` valid sehingga jika kandidat membuka room/lobby langsung tanpa query parameter, metadata response memberikan token valid untuk koneksi WebSocket.

### B. Frontend (`frontend/src/`):
1. **Fix `InterviewWsClient` Mock Fallback (`frontend/src/services/wsClient.ts`):**
   - Hapus fallback ke simulator yang disebabkan semata-mata oleh `token === 'sim_ws_token'`.
   - Hanya gunakan Mock Simulator jika `isSimulatorModeEnabled()` bernilai `true` (misal lewat URL `?mock=true` atau `VITE_USE_MOCK_SIMULATOR=true`).
   - Jika dalam mode live, selalu coba sambungkan koneksi WebSocket live ke `/ws/interview/{sessionId}`.
2. **Update Recruiter Dashboard Links (`frontend/src/pages/RecruiterDashboardPage.tsx`):**
   - Gunakan `item.candidate_join_url` (atau tambahkan `?token=${encodeURIComponent(item.candidate_token)}`) pada tombol Lobby dan Ruang Wawancara.
3. **Auto-cache & Propagate Token di Lobby & Room (`CandidateLobbyPage.tsx` & `InterviewRoomPage.tsx`):**
   - Simpan token ke `cacheSessionToken(sessionId, token)` begitu metadata sesi didapatkan.
   - Teruskan token valid ke Room saat berpindah dari Lobby.
   - Di `InterviewRoomPage.tsx`, resolve token dari `searchParams` atau `resolveSessionToken(sessionId)`.

### C. Build, Verification & Cloud Run Deploy:
1. Jalankan `npm run build` di frontend untuk memvalidasi TypeScript compilation.
2. Jalankan `pytest` di backend untuk memastikan API contracts tetap hijau.
3. Deploy build baru ke Cloud Run via `gcloud run deploy ai-interviewer`.
4. Verifikasi live di browser dan amati Cloud Run logs untuk konfirmasi WebSocket handshake `101 Switching Protocols` dan Vertex AI Gemini Live API.

---

## 3. Implementation Checklist
- [x] Update `backend/app/schemas/api_schemas.py` (`candidate_join_url` and `candidate_token` in `SessionListItemDto` & `CandidateSessionMetadataResponse`)
- [x] Update `backend/app/api/v1/sessions.py` (issue tokens with matched `jti=session.ephemeral_token_jti`)
- [x] Update `frontend/src/types/api.types.ts`
- [x] Update `frontend/src/services/wsClient.ts` (disable false mock trigger on `sim_ws_token`, use active resolved token)
- [x] Update `frontend/src/pages/RecruiterDashboardPage.tsx` (append candidate token to Lobby and Room links)
- [x] Update `frontend/src/pages/CandidateLobbyPage.tsx` (cache and pass resolved token to Room)
- [x] Update `frontend/src/pages/InterviewRoomPage.tsx` (auto-fetch candidate token on initial metadata fetch, pass to WebSocket)
- [x] Fix container startup: ensure `/app/data` exists for SQLite in `Dockerfile`, `docker-entrypoint.sh`, and `backend/app/db/session.py`
- [x] Verifikasi build lokal (`npm run build` & `pytest` 11/11 passed, `vitest` 15/15 passed)
- [x] Deploy ke Google Cloud Run (`revision ai-interviewer-00004-6wx` active, 100% traffic)
- [x] Live verification & logs inspection (verified binary 24kHz PCM 11,114 bytes + `SPEAKING` state from Vertex AI Live API)
- [x] Run `graphify update .` & update `docs/STATE.md`

---

## 4. Verification Results & Implementation Log
- **Date & Revision:** 2026-10-27 | Cloud Run Revision `ai-interviewer-00004-6wx`
- **Healthcheck:** `GET /api/v1/health` -> `200 OK` (`database_connected: true`, `gemini_configured: true`).
- **Sessions Endpoint:** `GET /api/v1/sessions` returns session `ses_01m5y6rb6egfhmj7jdkcx9w8y0` with signed `candidate_join_url` and valid `candidate_token`.
- **WebSocket Verification:**
  - Handshake: `wss://ai-interviewer-800933197735.asia-southeast2.run.app/ws/interview/{sessionId}?token={token}`
  - Frame sequence: `client.ready` -> `session.ready` -> `avatar.state: IDLE` -> `transcript.delta` -> `avatar.state: SPEAKING` -> **Binary PCM 24kHz audio frames: 11,114 bytes** delivered directly from Vertex AI Multimodal Live API (`gemini-live-2.5-flash-native-audio`).

