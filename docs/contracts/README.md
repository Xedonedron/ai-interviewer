# System Contracts & Protocol Specifications (`docs/contracts/`)

Folder ini menyimpan **Single Source of Truth (SSOT)** untuk seluruh kontrak data, skema database, REST API, protokol WebSocket, pipeline audio, dan state machine 3D VRM antara **Frontend (Browser)**, **Backend WebSocket Relay & REST Service**, **PostgreSQL 16**, dan **Gemini Multimodal Live API**.

Sesuai dengan [AGENTS.md](../../AGENTS.md) dan [ARCHITECTURE_AND_WORKFLOW.md](../ARCHITECTURE_AND_WORKFLOW.md), tidak ada perubahan skema JSON, tabel database, parameter PCM, atau state avatar yang boleh diimplementasikan pada kode sebelum diperbarui dan divalidasi di dalam folder ini.

---

## Daftar Kontrak Aktif (`v1.0.0` — Locked & Cross-Validated)

| No | Dokumen Kontrak | Versi | Status | Cakupan Spesifikasi Utama |
| :---: | :--- | :---: | :---: | :--- |
| **1** | [websocket-protocol.md](./websocket-protocol.md) | `1.0.0` | `Locked` | Skema pesan Hybrid WebSocket (`0x02` Binary Raw PCM 16kHz/24kHz & `0x01` JSON Control Frames), handshake Ephemeral JWT, *barge-in* signal, *session resumption*, dan custom close codes (`1000`, `4001`, `4002`, `4003`, `4009`). |
| **2** | [audio-pipeline-spec.md](./audio-pipeline-spec.md) | `1.0.0` | `Locked` | Spesifikasi `AudioWorklet` input capture (16,000 Hz `PCM_S16LE` Mono, 40ms / `1,280 bytes` chunk), `PcmStreamPlayer` 24,000 Hz gapless playback queue, aturan *barge-in flush* `< 50ms`, dan ekstraksi pita frekuensi formant `AnalyserNode`. |
| **3** | [vrm-avatar-states.md](./vrm-avatar-states.md) | `1.0.0` | `Locked` | Definisi state machine avatar 3D VRM (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `INTERRUPTED`), ekspresi emosi (`neutral`, `happy`, `serious`, `relaxed`, `surprised`), rumus *asymmetric exponential smoothing* viseme (`aa`, `ih`, `ou`, `ee`, `oh`), normalisasi anti-clipping (`<= 1.15`), dan animasi tulang prosedural. |
| **4** | [database-schema.md](./database-schema.md) | `1.0.0` | `Locked` | Diagram ERD (`erDiagram`), spesifikasi 5 tabel PostgreSQL 16 (`job_positions`, `candidates`, `interview_sessions`, `interview_transcripts`, `evaluation_reports`), tipe `ENUM`, indeks, DDL referensi, dan JSON Schema eksak untuk kolom `JSONB` (`rubric_config`, `cv_structured_summary`, `competency_scores`). |
| **5** | [rest-api-contract.md](./rest-api-contract.md) | `1.0.0` | `Locked` | Spesifikasi lengkap 6 endpoint REST (`/api/v1/sessions`, `/api/v1/sessions/{id}`, `/api/v1/sessions/{id}/complete`, `/api/v1/sessions/{id}/report`, `/api/v1/health`), standar Error Response JSON, matriks HTTP status codes, dan pemetaan 1:1 antara TypeScript Interfaces (Frontend) & Pydantic v2 Models (Backend). |

---

## Matriks Audit Konsistensi Atribut Lintas Kontrak (Cross-Contract Field Parity)

| Konsep / Entitas | Database Column (`database-schema.md`) | REST API DTO (`rest-api-contract.md`) | WebSocket JSON Frame (`websocket-protocol.md`) | Tipe / Format Nilai |
| :--- | :--- | :--- | :--- | :--- |
| **ID Sesi Wawancara** | `interview_sessions.id` / `session_id` | `session_id` | `session_id` | `string` (`ses_<26_char_ulid>`) |
| **Status Sesi** | `interview_sessions.status` | `status` | — | `'READY' \| 'IN_PROGRESS' \| 'RECONNECTING' \| 'EVALUATING' \| 'COMPLETED' \| 'FAILED' \| 'EXPIRED'` |
| **Tahap Wawancara** | `current_stage` / `stage_id` | `current_stage` / `stage_id` | `current_stage` (`session.ready`) / `stage` (`stage_change`, `transcript.delta`) | `'STAGE_1_INTRO' \| 'STAGE_2_CV_PROBE' \| 'STAGE_3_TECHNICAL' \| 'STAGE_4_QNA' \| 'STAGE_5_CLOSING'` |
| **Nomor Urut Giliran** | `interview_transcripts.turn_seq` / `last_turn_seq` | `turn_seq` / `last_turn_seq` | `turn_seq` (`transcript.delta`) / `resume_from_turn_seq` (`client.ready`) | `integer` (`>= 0` / `>= 1`) |
| **ID Giliran Bicara** | `interview_transcripts.turn_id` | `turn_id` | `turn_id` (`avatar.state`, `transcript.delta`) / `interrupted_turn_id` (`barge_in`) | `string` (`turn_001`, `turn_002`, ...) |
| **Pembicara Transkrip** | `interview_transcripts.speaker` | `speaker` | `speaker` (`transcript.delta`) | `'AI' \| 'CANDIDATE'` |
| **State Visual Avatar** | — *(Ephemeral Runtime)* | `AvatarStateId` | `state` (`avatar.state`) | `'IDLE' \| 'LISTENING' \| 'THINKING' \| 'SPEAKING' \| 'INTERRUPTED'` |
| **Emosi Visual Avatar** | — *(Ephemeral Runtime)* | `AvatarEmotion` | `emotion` (`avatar.state`) | `'neutral' \| 'happy' \| 'serious' \| 'relaxed' \| 'surprised'` |
| **Rekomendasi Akhir** | `evaluation_reports.hiring_recommendation` | `hiring_recommendation` | — | `'STRONG_HIRE' \| 'HIRE' \| 'HOLD' \| 'NO_HIRE'` |
