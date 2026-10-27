# ADR-003: Warm Minimalist Design System & Clean Candidate/Recruiter UX

- **Date:** 2026-10-27
- **Status:** `Accepted`
- **Deciders:** User & AI Agent

---

## 1. Context & Problem Statement
Implementasi awal Frontend pada Fase 2 menggunakan tema gelap (*dark slate/indigo*) yang dilengkapi banyak panel telemetri teknis (bar FFT viseme, indikator FPS/tier, *stage stepper* 5 tahap, dan panel *Simulator Control Overlay* untuk mengubah state/emosi secara manual). User telah menyusun referensi desain final di [`reference/real_time_ai_interviewer_platform.html`](file:///srv/projects/ai-interviewer/reference/real_time_ai_interviewer_platform.html) dan meminta agar seluruh aplikasi menerapkan estetika **Warm Minimalist** sebagaimana didokumentasikan di [`DESIGN.md`](file:///srv/projects/ai-interviewer/DESIGN.md), serta menghapus semua tombol dan informasi teknis yang tidak penting baik bagi kandidat maupun admin/rekruter.

## 2. Considered Options
1. **Option A: Mempertahankan Dark Mode + Menambahkan Toggle Tema**
   - (+) Tidak mengubah halaman yang sudah ada secara drastis.
   - (-) Tetap menyisakan kerumitan UI, tombol-tombol simulator/debug, dan tidak sesuai dengan visi desain *high-end Warm Minimalist* yang diminta user.
2. **Option B: Menerapkan Warm Minimalist Secara Menyeluruh Berdasarkan `DESIGN.md` & Mockup HTML (Chosen)**
   - (+) Menciptakan pengalaman yang tenang, bersih, dan fokus bagi kandidat (Pre-Interview Wizard 3 tahap, Resizable Split-Pane 3D Avatar + Transkrip, dan dock kontrol bergaya Zoom/Google Meet).
   - (+) Membersihkan halaman Admin/Recruiter dari seluruh jargon kode/protokol dan tombol simulator yang tidak relevan bagi pengguna akhir.
   - (+) Tetap mempertahankan seluruh mesin inti (`VrmAvatarEngine`, `MicCaptureManager`, `PcmStreamPlayer`, dan `InterviewWsClient`) di balik layar tanpa kompromi performa.

## 3. Decision Outcome
**Chosen Option:** **Option B — Menerapkan Warm Minimalist Secara Menyeluruh Berdasarkan [`DESIGN.md`](file:///srv/projects/ai-interviewer/DESIGN.md) & [`reference/real_time_ai_interviewer_platform.html`](file:///srv/projects/ai-interviewer/reference/real_time_ai_interviewer_platform.html)**

### Justification / Rationale
- Kandidat membutuhkan suasana wawancara yang menenangkan dan bebas intimidasi teknis. Mengganti checklist teknis (`WebGL2`, `AudioWorklet`) menjadi pemeriksaan kesiapan sederhana serta menyederhanakan kontrol panggilan menjadi 3 aksi utama (`Mikrofon`, `Sela AI`, `Akhiri`) meningkatkan fokus dan kenyamanan kandidat.
- Pembagian layar yang dapat diatur lebarnya (*Windows-style resizable split screen*) antara panggung 3D Avatar di kiri dan Transkrip Langsung di kanan memberikan fleksibilitas visual yang optimal.
- Pemisahan header antara rute Kandidat (`/interview/*`) dan rute Recruiter (`/recruiter/*`) mencegah kebocoran navigasi internal kepada kandidat.

## 4. Consequences & Trade-offs
- **Positive:** Antarmuka konsisten 100% dengan [`DESIGN.md`](file:///srv/projects/ai-interviewer/DESIGN.md), bebas dari kesan "AI generik", dan siap digunakan langsung di lingkungan produksi.
- **Negative / Risks:** Tombol manual untuk men-trigger simulator di UI dihapus dari tampilan utama; namun pengujian otomatis (`vitest` dan `pytest`) tetap menguji seluruh fungsi audio, *barge-in*, dan avatar secara langsung melalui API class/service.
- **Guardrails:**
  - Jangan pernah menampilkan tombol ubah emosi/state manual, metrik FFT/FPS, atau istilah teknis (`WebSocket`, `PCM`, `AudioWorklet`, `WebGL2`, `LIVE FEED`) di permukaan UI.
  - Seluruh komponen wajib menggunakan token warna `canvas`, `surface`, `subtle`, `charcoal`, `muted`, `stonehint`, `accent`, `accentsoft`, dan `warning` serta pasangan font `Newsreader` + `Plus Jakarta Sans`.
