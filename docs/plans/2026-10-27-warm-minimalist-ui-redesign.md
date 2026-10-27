# Plan: Warm Minimalist UI Redesign & DESIGN.md Implementation

- **Date:** 2026-10-27
- **Status:** `Completed`
- **Related ADRs:** [ADR-003](../decisions/ADR-003-warm-minimalist-design-system.md), [ADR-001](../decisions/ADR-001-core-architecture.md)

---

## 1. Objective & Context
Menerapkan desain **Warm Minimalist** secara menyeluruh pada aplikasi Frontend (`frontend/`) berdasarkan referensi mockup [`reference/real_time_ai_interviewer_platform.html`](file:///srv/projects/ai-interviewer/reference/real_time_ai_interviewer_platform.html) dan mendokumentasikan standar desain tersebut ke dalam [`DESIGN.md`](file:///srv/projects/ai-interviewer/DESIGN.md). Seluruh tombol tidak penting (seperti tombol ubah emosi, cycle state, simulator overlay, salin catatan, indikator scroll otomatis, stage stepper `Stage 2 of 5`, tulisan `LIVE FEED`, dan jargon teknis `WebGL2`/`AudioWorklet`/`WebSocket`) dihapus agar antarmuka bersih, tenang, dan fokus.

## 2. Scope & Key Decisions
- **In Scope:**
  - Pembuatan [`DESIGN.md`](file:///srv/projects/ai-interviewer/DESIGN.md) sebagai acuan sistem desain tunggal.
  - Konfigurasi tipografi (`Newsreader` & `Plus Jakarta Sans`) dan palet warna Warm Minimalist (`canvas`, `surface`, `subtle`, `charcoal`, `muted`, `stonehint`, `accent`, `accentsoft`, `warning`, `danger`) di [`frontend/index.html`](file:///srv/projects/ai-interviewer/frontend/index.html), [`frontend/tailwind.config.js`](file:///srv/projects/ai-interviewer/frontend/tailwind.config.js), dan [`frontend/src/index.css`](file:///srv/projects/ai-interviewer/frontend/src/index.css).
  - Pemisahan Header di [`frontend/src/App.tsx`](file:///srv/projects/ai-interviewer/frontend/src/App.tsx): header minimalis khusus Kandidat di `/interview/*` (logo `Alya Interview`, timer aktif di tengah saat berada di Room, dan tombol `Panduan`) vs header Recruiter di `/recruiter/*`.
  - Perombakan [`CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx) menjadi Pre-Interview Step Wizard 3-Tahap yang bersih (sapaan nama & posisi di Tahap 1, pemeriksaan kemampuan browser/suara/jaringan yang sederhana, kalibrasi mikrofon & tes speaker di Tahap 2, serta panduan singkat & persetujuan di Tahap 3).
  - Perombakan [`InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx) menjadi **Resizable Split-Pane Layout** (lebar kiri-kanan dapat digeser ala Windows split screen) dengan panggung 3D `VrmAvatarEngine` + dock kontrol bergaya Zoom/Google Meet (`Mikrofon`, `Sela AI`, `Akhiri` + modal konfirmasi) di sisi kiri, serta panel **Transkrip Langsung** bersih dengan label `{nama} (Kandidat)` di sisi kanan.
  - Penyesuaian pencahayaan studio dan latar belakang [`VrmAvatarEngine.ts`](file:///srv/projects/ai-interviewer/frontend/src/engine/vrm/VrmAvatarEngine.ts) agar menyatu dengan estetika Warm Stone (`#F4F2EC`).
  - Perombakan [`InterviewCompletedPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewCompletedPage.tsx) sesuai View 3 pada mockup referensi (ringkasan durasi, posisi, status evaluasi, dan rating bintang CSAT 1–5 tanpa kolom komentar atau tautan ke halaman Recruiter).
  - Penyederhanaan dan penerapan tema Warm Minimalist pada halaman Admin/Recruiter ([`RecruiterDashboardPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterDashboardPage.tsx), [`RecruiterSetupPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterSetupPage.tsx), [`EvaluationReportPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/EvaluationReportPage.tsx)) dengan menghapus seluruh jargon teknis dan tombol simulator.
- **Out of Scope:**
  - Perubahan skema database atau endpoint kontrak backend.
- **Key Decisions Agreed:**
  - Terapkan Warm Minimalist di seluruh halaman (Kandidat + Recruiter).
  - Pisahkan navigasi header antara Kandidat dan Recruiter.
  - Tetap gunakan `VrmAvatarEngine` yang mendukung pemuatan file `.vrm` di `frontend/public/models/alya.vrm`.
  - Halaman selesai wawancara dan halaman Recruiter dibersihkan dari seluruh elemen yang tidak perlu.

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat [`DESIGN.md`](file:///srv/projects/ai-interviewer/DESIGN.md) dan [`ADR-003`](file:///srv/projects/ai-interviewer/docs/decisions/ADR-003-warm-minimalist-design-system.md).
- [x] **Step 2:** Perbarui [`frontend/index.html`](file:///srv/projects/ai-interviewer/frontend/index.html), [`frontend/tailwind.config.js`](file:///srv/projects/ai-interviewer/frontend/tailwind.config.js), dan [`frontend/src/index.css`](file:///srv/projects/ai-interviewer/frontend/src/index.css) dengan font `Newsreader` & `Plus Jakarta Sans` serta palet warna Warm Minimalist.
- [x] **Step 3:** Sesuaikan pencahayaan dan warna rig fallback di [`frontend/src/engine/vrm/VrmAvatarEngine.ts`](file:///srv/projects/ai-interviewer/frontend/src/engine/vrm/VrmAvatarEngine.ts) agar selaras dengan panggung Warm Stone (`#F4F2EC`).
- [x] **Step 4:** Perbarui [`frontend/src/App.tsx`](file:///srv/projects/ai-interviewer/frontend/src/App.tsx) untuk menerapkan header terpisah (Kandidat vs Recruiter) beserta timer di tengah header saat berada di ruang wawancara.
- [x] **Step 5:** Implementasikan ulang [`CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx), [`InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx), dan [`InterviewCompletedPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewCompletedPage.tsx) sesuai revisi dan mockup referensi.
- [x] **Step 6:** Implementasikan ulang [`RecruiterDashboardPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterDashboardPage.tsx), [`RecruiterSetupPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterSetupPage.tsx), dan [`EvaluationReportPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/EvaluationReportPage.tsx) dengan gaya Warm Minimalist yang bersih tanpa jargon teknis.
- [x] **Step 7:** Jalankan verifikasi build & test (`tsc --noEmit`, `vitest run`, `vite build`) serta sinkronisasi Knowledge Graph (`graphify update .`).
- [x] **Step 8:** Perbarui [`docs/STATE.md`](file:///srv/projects/ai-interviewer/docs/STATE.md) dan log implementasi pada dokumen plan ini.

## 4. Verification Criteria
- `npm run build` (`tsc --noEmit` & `vite build`) di `frontend/` sukses dengan 0 error.
- `npx vitest run` di `frontend/` lulus 100% (10/10 passed).
- Seluruh poin revisi user pada halaman Lobby, Interview Room (resizable split-pane, dock Zoom/Meet, transkrip bersih dengan `{nama} (Kandidat)`), Completed Page, dan Recruiter Pages terpenuhi.
- `graphify update .` berjalan bersih tanpa error.

---

## 5. Implementation Log & Actual Changes
- **Created Files:**
  - [`DESIGN.md`](file:///srv/projects/ai-interviewer/DESIGN.md): Spesifikasi lengkap sistem desain Warm Minimalist, palet warna, tipografi, tata letak Windows-style resizable split-pane, dan aturan kebersihan antarmuka.
  - [`docs/decisions/ADR-003-warm-minimalist-design-system.md`](file:///srv/projects/ai-interviewer/docs/decisions/ADR-003-warm-minimalist-design-system.md): Catatan keputusan arsitektur frontend mengenai adopsi estetika Warm Minimalist dan penghapusan kontrol debug/simulator dari UI utama.
  - [`docs/plans/2026-10-27-warm-minimalist-ui-redesign.md`](file:///srv/projects/ai-interviewer/docs/plans/2026-10-27-warm-minimalist-ui-redesign.md): Dokumen rencana dan pelacakan implementasi ini.
- **Modified Files:**
  - [`frontend/index.html`](file:///srv/projects/ai-interviewer/frontend/index.html): Menambahkan Google Fonts `Newsreader` & `Plus Jakarta Sans` dan menerapkan kelas dasar `bg-canvas text-charcoal`.
  - [`frontend/tailwind.config.js`](file:///srv/projects/ai-interviewer/frontend/tailwind.config.js): Mendaftarkan token warna Warm Minimalist (`canvas`, `surface`, `subtle`, `charcoal`, `muted`, `stonehint`, `accent`, `accentsoft`, `warning`, `danger`) dan konfigurasi `fontFamily`.
  - [`frontend/src/index.css`](file:///srv/projects/ai-interviewer/frontend/src/index.css): Menerapkan variabel CSS `--left-pane-width`, animasi `.animate-aura`, scrollbar halus, dan utilitas `.resizing`.
  - [`frontend/src/engine/vrm/VrmAvatarEngine.ts`](file:///srv/projects/ai-interviewer/frontend/src/engine/vrm/VrmAvatarEngine.ts): Menyesuaikan pencahayaan studio portrait dan material rig fallback prosedural dengan estetika Warm Stone (`#F4F2EC`).
  - [`frontend/src/App.tsx`](file:///srv/projects/ai-interviewer/frontend/src/App.tsx): Memisahkan TopNavigationBar antara rute Kandidat (minimalis tanpa nama/role di pojok kiri atas, timer di tengah saat di Room, tombol Panduan di kanan) dan rute Rekruter (`Daftar Sesi`, `Buat Sesi Baru`).
  - [`frontend/src/pages/CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx): Mengimplementasikan Pre-Interview Wizard 3-Tahap dengan sapaan nama & posisi di Tahap 1 dan pemeriksaan perangkat ramah pengguna tanpa jargon teknis (`WebGL2`/`AudioWorklet`).
  - [`frontend/src/pages/InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx): Mengimplementasikan Windows-style Resizable Split-Pane (`#split-divider`, 28%–72%), panggung 3D VRM tanpa badge `LIVE FEED` atau stage stepper, dock kontrol bawah ala Zoom/Google Meet (`Mikrofon`, `Sela AI`, `Akhiri`), serta panel `Transkrip Langsung` bersih dengan label `{nama} (Kandidat)`.
  - [`frontend/src/pages/InterviewCompletedPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewCompletedPage.tsx): Mengimplementasikan halaman selesai wawancara sesuai View 3 mockup referensi (durasi, posisi terdaftar, status evaluasi, rating bintang 1–5 tanpa kolom komentar dan tanpa tautan ke halaman rekruter).
  - [`frontend/src/pages/RecruiterDashboardPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterDashboardPage.tsx), [`frontend/src/pages/RecruiterSetupPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterSetupPage.tsx), [`frontend/src/pages/EvaluationReportPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/EvaluationReportPage.tsx): Menerapkan tema Warm Minimalist di seluruh halaman rekruter serta menghapus tombol simulator dan nama variabel kode.
- **Deviations from Plan:** Tidak ada deviasi.
