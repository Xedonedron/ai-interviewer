# Requirements: Real-Time AI Interviewer Platform

## 1. Executive Summary & Objective
Membangun platform AI Interviewer berbasis web interaktif secara real-time. Sistem mewawancarai kandidat kerja menggunakan suara dua arah (full duplex / low latency voice) dan avatar 3D yang memiliki animasi ekspresi wajah serta sinkronisasi bibir (lip-sync). Target deployment adalah infrastruktur cloud (GCP: Compute Engine / GKE / Cloud Run) yang efisien biaya, scalable menangani banyak kandidat secara simultan, tanpa ketergantungan pada server GPU berat.

---

## 2. Core Architectural Decisions

### 2.1 3D VRM (Client-Side Rendering) vs Live2D / VTube Studio
- **VTube Studio (Ditolak):** Memerlukan host Windows/macOS dengan GUI dan GPU, tidak scalable di server Linux/headless cloud, dan boros bandwidth karena harus streaming video WebRTC server-side per kandidat.
- **Live2D Web SDK (Ditolak):** Lisensi komersial Cubism SDK berbayar dan restriktif, biaya rigging 2D tinggi.
- **3D VRM (Dipilih):**
  - Berbasis standar terbuka glTF (3D format universal).
  - Open-source, bebas biaya lisensi runtime.
  - Model avatar mudah dibuat/diexport menggunakan VRoid Studio.
  - Blendshapes standar untuk ekspresi wajah dan viseme vokal (`aa`, `ih`, `ou`, `ee`, `oh`) tersedia out-of-the-box.
  - Rendering dieksekusi penuh di sisi browser kandidat (`<canvas>` via Three.js + `@pixiv/three-vrm`). Server nol beban render video.

### 2.2 LLM & Voice Engine: Gemini Multimodal Live API
- Menggunakan Gemini Multimodal Live API (WebSocket over WSS) untuk interaksi suara langsung (voice-to-voice end-to-end).
- Mendukung interupsi suara alami (barge-in / natural interruption).
- Audio format: Raw PCM 16kHz / 24kHz.

### 2.3 Backend Proxy / Relay
- Browser tidak boleh mengakses API key Gemini secara langsung.
- Backend bertindak sebagai lightweight WebSocket relay:
  - Menyembunyikan dan mengelola credential/API Key.
  - Menyuntikkan system instructions (persona interviewer, job description, rubrik penilaian, batasan wawancara).
  - Meneruskan audio stream dua arah antara kandidat dan Gemini.
  - Menyimpan transkripsi obrolan dan log evaluasi kandidat.

---

## 3. Scope & System Components

### 3.1 Client / Frontend (Web Browser)
- **Tech Stack:** HTML5, Modern JavaScript/TypeScript, Three.js, `@pixiv/three-vrm`.
- **Input Audio:** Browser `AudioWorklet` untuk capture mikrofon kandidat secara kontinu (PCM 16kHz mono).
- **Output Audio & Lip-sync:**
  - Pemutaran buffer audio dari respons Gemini.
  - `AudioContext` + `AnalyserNode` untuk ekstraksi amplitude/frekuensi audio output.
  - Mapping real-time amplitude ke blendshape mulut VRM (`mouthOpen` / viseme `A`) untuk efek lip-sync instan.
- **Interaksi UI:**
  - Status koneksi (connecting, ready, speaking, listening).
  - Tombol mulai/selesai interview.
  - Pengaturan audio (mic selection, volume).

### 3.2 Backend Service (Relay / Gateway)
- **Tech Stack:** Python (FastAPI + WebSockets) atau Node.js (Fastify/ws).
- **Fungsi:**
  - WebSocket Server untuk koneksi client.
  - Client WebSocket ke endpoint Gemini Multimodal Live API.
  - Session manager per kandidat.
  - Sanitasi prompt dan injeksi context lowongan/CV kandidat.
  - Ekspor hasil wawancara (transkrip & ringkasan analisis performa kandidat).

### 3.3 Infrastructure & Deployment
- Containerized via standard `Dockerfile`.
- Target: Google Cloud Platform (Cloud Run, Compute Engine, atau GKE).
- Resource profile: Low CPU & RAM (tidak memerlukan GPU server).
- Dukungan concurrency tinggi (1 pod kecil dapat melayani puluhan koneksi relay simultan).

---

## 4. Non-Functional Requirements
1. **Latensi Suara:** End-to-end audio latency di bawah 1.5 - 2 detik untuk percakapan alami.
2. **Skalabilitas:** Arsitektur stateless / low-memory relay memungkinkan horizontal autoscaling di Kubernetes/Cloud Run.
3. **Kompatibilitas Browser:** Berjalan lancar di Chrome, Edge, Safari, dan Firefox modern tanpa instalasi plugin.
4. **Keamanan:** API credentials terisolasi di backend environment variables; enkripsi WSS end-to-end.

---

## 5. Next Steps for Upcoming Sessions
File ini menjadi acuan utama untuk fase perancangan selanjutnya:
1. Penyusunan **PRD.md** (Product Requirements Document detail: user stories, edge cases, rubrik penilaian, flow wawancara).
2. Penyusunan **ARCHITECTURE.md** (Sequence diagram WebSocket, message payload spec, data flow).
3. Pembuatan scaffold repo (backend relay + frontend Three.js VRM player minimal).
