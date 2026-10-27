# Contract 1: WebSocket Relay Protocol Specification (`websocket-protocol.md`)

- **Version:** `1.0.0`
- **Status:** `Locked`
- **Related Documents:** [PRD.md](../../PRD.md), [ADR-002](../decisions/ADR-002-backend-tech-stack-and-session-protocol.md), [audio-pipeline-spec.md](./audio-pipeline-spec.md), [vrm-avatar-states.md](./vrm-avatar-states.md)

---

## 1. Connection & Handshake Specification

- **Endpoint Template:**
  ```text
  wss://<backend-host>/ws/interview/{session_id}?token={ephemeral_jwt_token}
  ```
- **Authentication:**
  - `token` adalah *short-lived JWT* (`HS256` / `EdDSA`) yang diterbitkan oleh `POST /api/v1/sessions`.
  - Klaim wajib: `sub` (`session_id`), `role` (`candidate`), `exp` (Unix timestamp), `jti` (unique token ID).
  - Jika token tidak valid atau kedaluwarsa, server menolak handshake atau menutup koneksi dengan WebSocket Close Code `4001` (`Unauthorized`).
- **Framing Mode (Hybrid Protocol):**
  - **Binary Frames (`opcode = 0x02`):** Digunakan **hanya** untuk payload Raw Audio PCM (tanpa wrapper JSON dan tanpa Base64).
  - **Text Frames (`opcode = 0x01`):** Digunakan untuk seluruh sinyal kontrol, status sesi, sinkronisasi avatar, dan transkrip dalam format UTF-8 JSON.

---

## 2. Client -> Backend Relay Messages

### 2.1 Binary Audio Frame (Upstream Microphone Stream)
- **WebSocket Opcode:** `0x02` (Binary)
- **Format:** Raw PCM, **16,000 Hz**, **16-bit Signed Integer Little-Endian (`PCM_S16LE`)**, **Mono (1 Channel)**.
- **Ukuran Frame Standar:** `1,280 bytes` (640 sampel = 40ms audio). Rentang yang diizinkan: `640 bytes` (20ms) hingga `3,200 bytes` (100ms).

### 2.2 JSON Control Frames (Client -> Backend)

#### A. `client.ready`
Dikirim tepat setelah koneksi WebSocket terbuka (`onopen`) dan `AudioContext` siap.
```json
{
  "type": "client.ready",
  "client_version": "1.0.0",
  "audio_config": {
    "input_sample_rate": 16000,
    "channels": 1,
    "sample_format": "PCM_S16LE",
    "chunk_ms": 40
  },
  "resume_from_turn_seq": 0
}
```
- Jika `resume_from_turn_seq > 0`, backend menjalankan alur *Session Resumption* (menyuntikkan ringkasan transkrip terakhir ke koneksi Gemini Live baru).

#### B. `client.barge_in`
Dikirim secara opsional oleh client ketika *Local Client VAD* mendeteksi suara kandidat yang kuat saat avatar sedang dalam state `SPEAKING`.
```json
{
  "type": "client.barge_in",
  "interrupted_turn_id": "turn_004",
  "client_timestamp_ms": 1761509400100
}
```

#### C. `client.mic_state`
Dikirim ketika kandidat menekan tombol Mute/Unmute atau perangkat mikrofon berubah status.
```json
{
  "type": "client.mic_state",
  "muted": true,
  "reason": "user_toggle"
}
```
- Nilai `reason`: `"user_toggle"` | `"device_disconnected"` | `"device_restored"`.

#### D. `client.ping`
Dikirim setiap 15 detik untuk menjaga koneksi melalui Cloud Run / Load Balancer dan mengukur *Round-Trip Time* (RTT).
```json
{
  "type": "client.ping",
  "t": 1761509400000
}
```

#### E. `client.end_session`
Dikirim saat kandidat menekan tombol konfirmasi `"End Interview"`.
```json
{
  "type": "client.end_session",
  "reason": "candidate_finished"
}
```

---

## 3. Backend Relay -> Client Messages

### 3.1 Binary Audio Frame (Downstream AI Voice Stream)
- **WebSocket Opcode:** `0x02` (Binary)
- **Format:** Raw PCM, **24,000 Hz**, **16-bit Signed Integer Little-Endian (`PCM_S16LE`)**, **Mono (1 Channel)**.
- **Perilaku Client:** Dimasukkan ke dalam antrean `PcmStreamPlayer` (24kHz) dan dialirkan melalui `AnalyserNode` untuk menggerakkan *viseme lip-sync* VRM. Apabila frame biner diterima setelah event `control.barge_in` untuk turn yang telah dibatalkan, frame tersebut diabaikan.

### 3.2 JSON Control Frames (Backend -> Client)

#### A. `session.ready`
Dikirim setelah backend berhasil membuka sesi `aio.live.connect` ke Gemini Multimodal Live API.
```json
{
  "type": "session.ready",
  "session_id": "ses_01jc9x8k2m",
  "current_stage": "STAGE_1_INTRO",
  "stage_label": "Introduction & Ice-Breaking",
  "remaining_seconds": 1800,
  "resumed": false
}
```

#### B. `avatar.state`
Menginstruksikan state machine avatar 3D VRM di frontend untuk berpindah state atau ekspresi emosi.
```json
{
  "type": "avatar.state",
  "state": "SPEAKING",
  "emotion": "happy",
  "turn_id": "turn_004",
  "timestamp_ms": 1761509400050
}
```
- Nilai `state`: `"IDLE"` | `"LISTENING"` | `"THINKING"` | `"SPEAKING"` | `"INTERRUPTED"`.
- Nilai `emotion`: `"neutral"` | `"happy"` | `"serious"` | `"relaxed"` | `"surprised"`.

#### C. `control.barge_in` (High-Priority Audio Flush Signal)
Dikirim seketika saat Gemini Multimodal Live API mengirimkan `server_content.interrupted == True`.
```json
{
  "type": "control.barge_in",
  "interrupted_turn_id": "turn_004",
  "reason": "candidate_speech_detected",
  "timestamp_ms": 1761509400123
}
```
- **Kewajiban Frontend:** Wajib menghentikan seluruh `AudioBufferSourceNode` yang sedang berjalan/terjadwal dalam **< 50ms**, mengatur ulang `nextPlayTime = 0`, dan mengembalikan ekspresi bibir VRM ke `0.0` (state `LISTENING`).

#### D. `transcript.delta`
Mengirimkan pembaruan teks transkrip ucapan kandidat maupun AI secara *real-time*. Saat `is_final: true`, baris ini disimpan ke tabel `interview_transcripts` (dengan pemetaan `text` -> `text_content` dan `stage` -> `stage_id`).
```json
{
  "type": "transcript.delta",
  "turn_id": "turn_004",
  "turn_seq": 4,
  "speaker": "AI",
  "text": "Halo Budi, senang bertemu dengan Anda hari ini.",
  "is_final": true,
  "stage": "STAGE_1_INTRO",
  "timestamp_ms": 1761509402500
}
```

#### E. `session.stage_change`
Dikirim ketika `StageAndTimekeeperLoop` memindahkan tahapan wawancara.
```json
{
  "type": "session.stage_change",
  "previous_stage": "STAGE_1_INTRO",
  "stage": "STAGE_2_CV_PROBE",
  "stage_label": "Experience & CV Deep-Dive",
  "remaining_seconds": 1620
}
```

#### F. `server.pong`
Balasan langsung atas pesan `client.ping`.
```json
{
  "type": "server.pong",
  "t": 1761509400000,
  "server_t": 1761509400018
}
```

#### G. `session.completed` & `session.error`
```json
{
  "type": "session.completed",
  "session_id": "ses_01jc9x8k2m",
  "reason": "interview_finished",
  "redirect_url": "/interview/ses_01jc9x8k2m/completed"
}
```
```json
{
  "type": "session.error",
  "code": "GEMINI_UPSTREAM_TIMEOUT",
  "message": "Koneksi ke layanan suara AI sedang dipulihkan...",
  "recoverable": true
}
```

---

## 4. Custom WebSocket Close Codes

| Close Code | Nama Konstanta | Arti & Perilaku Client |
| :---: | :--- | :--- |
| `1000` | `NORMAL_CLOSURE` | Wawancara selesai normal; jangan reconnect, arahkan ke layar selesai. |
| `4001` | `AUTH_INVALID_OR_EXPIRED` | Token sesi tidak valid atau kedaluwarsa; tampilkan pesan error autentikasi. |
| `4002` | `SESSION_ALREADY_ACTIVE` | Sesi sedang dibuka di tab/perangkat lain; tampilkan opsi ambil alih atau tutup. |
| `4003` | `SESSION_ALREADY_COMPLETED` | Sesi wawancara ini sudah selesai sebelumnya; arahkan ke layar selesai. |
| `4009` | `UPSTREAM_GEMINI_RESET` | Koneksi ke Gemini Live di-reset; client **wajib** langsung melakukan *auto-reconnect* dengan `resume_from_turn_seq`. |
