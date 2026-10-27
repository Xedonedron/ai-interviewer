# ADR-001: Core Architecture — Client-Side 3D VRM, Gemini Multimodal Live API & Lightweight Backend Relay

- **Date:** 2026-10-26
- **Status:** `Accepted`
- **Deciders:** User & AI Agent (Berdasarkan `REQUIREMENTS.md`)

---

## 1. Context & Problem Statement
Kita perlu membangun platform web **Real-Time AI Interviewer** interaktif yang mampu mewawancarai banyak kandidat secara simultan dengan:
1. Interaksi suara dua arah (*full-duplex*) berlatensi rendah (< 1.5 - 2 detik) dan mendukung interupsi alami (*barge-in*).
2. Avatar visual interaktif dengan ekspresi wajah dan sinkronisasi gerak bibir (*lip-sync*).
3. Biaya infrastruktur cloud (GCP) yang efisien dan *scalable* tanpa ketergantungan pada server GPU berat untuk merender video per sesi kandidat.

## 2. Considered Options

### A. Avatar Rendering Engine
1. **VTube Studio + Server-Side Streaming (Ditolak):**
   - (-) Membutuhkan host Windows/macOS dengan GUI dan GPU per sesi.
   - (-) Tidak *scalable* di container Linux headless (Cloud Run / GKE) dan boros bandwidth WebRTC video.
2. **Live2D Web SDK (Ditolak):**
   - (-) Lisensi komersial Cubism SDK berbayar & restriktif, serta biaya rigging model 2D tinggi.
3. **3D VRM Client-Side Rendering via Three.js & `@pixiv/three-vrm` (Dipilih):**
   - (+) Standar terbuka berbasis glTF, open-source, bebas lisensi runtime.
   - (+) Model mudah dibuat dengan VRoid Studio dan sudah memiliki blendshape ekspresi serta viseme (`aa`, `ih`, `ou`, `ee`, `oh`) standar.
   - (+) 100% dirender di browser kandidat (`<canvas>`), sehingga beban GPU/video di server adalah **nol**.

### B. Voice & Intelligence Engine
1. **Chained Pipeline Tradisional: STT -> Text LLM -> TTS (Ditolak):**
   - (-) Akumulasi latensi tinggi di setiap hop (seringkali > 3-4 detik).
   - (-) Penanganan *barge-in* dan intonasi emosi kurang alami.
2. **Gemini Multimodal Live API via WebSocket/WSS (Dipilih):**
   - (+) *Native end-to-end voice-to-voice* dengan latensi sangat rendah.
   - (+) Mendukung *natural interruption* (*barge-in*) secara bawaan.
   - (+) Streaming audio Raw PCM (16kHz input, 24kHz output) yang mudah diintegrasikan dengan Web Audio API (`AudioWorklet` & `AnalyserNode`).

### C. Connection & Security Topology
1. **Direct Browser-to-Gemini Connection (Ditolak):**
   - (-) Mengekspos API Key Gemini dan System Prompt/Rubrik Penilaian di sisi client.
2. **Lightweight Backend WebSocket Relay (Dipilih):**
   - (+) Mengisolasi API Key Gemini dan menyuntikkan System Instructions (JD, CV, rubrik penilaian) secara aman di server.
   - (+) Memungkinkan pencatatan transkrip dan hasil evaluasi ke database tanpa membebani CPU/RAM server.

## 3. Decision Outcome
**Chosen Option:** Kombinasi **Client-Side 3D VRM (`Three.js` + `@pixiv/three-vrm`)**, **Gemini Multimodal Live API**, dan **Lightweight Backend WebSocket Relay** (Python FastAPI atau Node.js Fastify).

## 4. Consequences & Trade-offs
- **Positive:**
  - Server sangat ringan (CPU/RAM rendah, tanpa GPU), mudah di-*autoscale* secara horizontal di GCP (Cloud Run / GKE).
  - Latensi audio dan lip-sync sangat responsif karena lip-sync dihitung langsung di browser menggunakan `AnalyserNode` pada stream audio output.
- **Negative / Risks:**
  - Beban rendering 3D berada di perangkat kandidat (perlu optimasi poligon VRM dan pengaturan FPS untuk perangkat low-end).
  - Membutuhkan manajemen state koneksi WebSocket dua arah (Client <-> Backend <-> Gemini) yang tangguh terhadap putus-nyambung jaringan.
- **Guardrails:**
  - Jangan pernah menaruh API Key di frontend.
  - Jangan menambahkan proses pemrosesan sinyal/grafis berat di backend relay.
