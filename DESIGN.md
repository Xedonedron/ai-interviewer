# DESIGN.md — Warm Minimalist Design System & Frontend UI Specification

- **Version:** `1.0.0`
- **Reference Mockup:** [`reference/real_time_ai_interviewer_platform.html`](file:///srv/projects/ai-interviewer/reference/real_time_ai_interviewer_platform.html)
- **Status:** `Locked`

---

## 1. Visi Estetika & Filosofi Desain (Warm Minimalist)
Platform AI Interviewer mengusung estetika **Warm Minimalist Editorial**:
- **Anti-"AI Slop":** Menghindari sepenuhnya latar belakang dark mode hitam pekat, gradien neon ungu/biru generik, serta teks jargon teknis yang membingungkan kandidat maupun rekruter.
- **Ketenangan & Fokus (Calm & Precision):** Menggunakan latar belakang terang bernuansa *warm ivory* dan *warm stone*, tipografi editorial yang tajam, serta elemen antarmuka yang bersih layaknya produk panggilan video kelas atas.
- **Zero Debug Clutter:** Tidak ada tombol pengubah emosi manual, tombol *cycle state*, metrik FFT/Viseme bar, atau jargon seperti `WebGL2`, `AudioWorklet`, `PCM_S16LE`, `LIVE FEED`, maupun `Disinkronkan secara real-time via WebSocket`.

---

## 2. Palet Warna (Color Tokens)
Seluruh komponen UI menggunakan token warna berikut di Tailwind CSS:

| Token Name | Hex Code | Peruntukan Utama |
| :--- | :--- | :--- |
| `canvas` | `#FAF9F5` | Latar belakang utama halaman (*Warm ivory base*) |
| `surface` | `#F4F2EC` | Latar belakang kartu, panel 3D avatar, dan elemen sekunder (*Warm stone*) |
| `subtle` | `#EAE7DF` | Garis batas halus (*Hairline border*) dan divider |
| `charcoal` | `#1C1B18` | Warna teks utama, tombol primer, dan aksen aktif (*Primary deep graphite*) |
| `muted` | `#636059` | Teks sekunder dan deskripsi (*Editorial taupe*) |
| `stonehint` | `#938F85` | Petunjuk pasif, stempel waktu, dan label langkah (*Passive cues*) |
| `accent` | `#2B3830` | Indikator siap/aktif dan aksen *sage/forest green* |
| `accentsoft` | `#EAF0EB` | Latar belakang badge status sukses/siap |
| `warning` | `#8A5D3B` | Pesan peringatan atau perhatian (*Warm amber/earth*) |
| `danger` | `#B94A48` | Tombol akhiri panggilan / status mikrofon dibisukan |

---

## 3. Tipografi (Typography)
- **Editorial Serif (`font-serif`):** [`Newsreader`](https://fonts.google.com/specimen/Newsreader) — digunakan untuk judul halaman utama (`h1`, `h2`), sapaan, dan penekanan editorial.
- **Precision Sans (`font-sans`):** [`Plus Jakarta Sans`](https://fonts.google.com/specimen/Plus+Jakarta+Sans) — digunakan untuk teks antarmuka, tombol, transkrip percakapan, tabel, dan formulir.
- **Monospace (`font-mono`):** Digunakan secara terbatas hanya untuk penunjuk waktu (timer `MM:SS` dan timestamp transkrip).

---

## 4. Navigasi Header & Pemisahan Peran (Role-Separated Header)
1. **Mode Kandidat (`/interview/*`):**
   - **Kiri:** Hanya menampilkan logo lingkaran `A` dan teks **Alya Interview** (tanpa nama kandidat/role di pojok kiri atas dan tanpa link ke halaman Admin/Recruiter).
   - **Tengah:** Indikator waktu mundur (`MM:SS`) dengan titik hijau `accent`, **hanya tampil saat berada di dalam Ruang Wawancara aktif**.
   - **Kanan:** Tombol minimalis **Panduan**.
2. **Mode Recruiter / Admin (`/recruiter/*`):**
   - **Kiri:** Brand **Alya Interview** dengan penanda konsol rekruter.
   - **Kanan:** Navigasi bersih antar halaman **Daftar Sesi** dan **Buat Sesi Baru** tanpa badge status teknis.

---

## 5. Spesifikasi Halaman Kandidat (Candidate Experience)

### A. Lobby Persiapan — Wizard 3-Tahap ([`CandidateLobbyPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/CandidateLobbyPage.tsx))
Tidak menampilkan preview 3D di Lobby agar fokus dan ringan (model `.vrm` tetap dapat di-*preload* di latar belakang).
- **Tahap 1 dari 3 — Pengecekan Perangkat:**
  - Sapaan personal di deskripsi utama: *"Halo **{nama_kandidat}**, selamat datang di sesi wawancara untuk posisi **{judul_posisi}**. Mari kita pastikan browser dan perangkat Anda siap sebelum memulai."*
  - 3 Kartu status sederhana (tanpa jargon teknis WebGL2/AudioWorklet/WSS):
    1. **Kemampuan Browser** — *"Browser Anda mendukung tampilan interaktif dengan lancar"* (`Siap`)
    2. **Dukungan Perangkat Suara** — *"Sistem audio siap untuk percakapan dua arah"* (`Siap`)
    3. **Koneksi Jaringan** — *"Koneksi internet stabil untuk sesi wawancara"* (`Stabil`)
- **Tahap 2 dari 3 — Kalibrasi Suara:**
  - Pilihan perangkat mikrofon input.
  - Indikator level suara real-time (*"Uji Suara Anda (Bicaralah sekarang)"*).
  - Pengujian output suara speaker (*"Putar Sampel"*).
- **Tahap 3 dari 3 — Persetujuan Wawancara:**
  - Panduan singkat 3 poin (estimasi durasi, kebebasan menyela pembicaraan secara alami, pencatatan otomatis untuk evaluasi).
  - Checkbox persetujuan perekaman suara & pembuatan transkrip dengan validasi sebelum tombol **Mulai Wawancara** dapat menavigasi ke ruang wawancara.

### B. Ruang Wawancara Utama — Resizable Split-Pane ([`InterviewRoomPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewRoomPage.tsx))
Layar terbagi menjadi 2 panel berdampingan (default 50% kiri : 50% kanan pada layar desktop `lg`) yang **dapat digeser lebarnya (resizable split screen ala Windows)** dengan rentang aman 28% hingga 72%.
- **Panel Kiri — Panggung 3D Avatar & Kontrol Panggilan:**
  - **Status Pill di Pojok Kiri Atas:** Menampilkan titik indikator dan teks halus: *"Alya sedang mendengarkan"*, *"Alya memproses jawaban..."*, atau *"Alya sedang berbicara..."*, ditambah badge *"Menyela pembicaraan"* saat kandidat menyela (barge-in). Tanpa kata `LIVE FEED`, tanpa stepper `Stage 2 of 5`, dan tanpa badge FPS/Viseme.
  - **Kanvas 3D (`VrmAvatarEngine`):** Berlatar belakang *warm stone* (`#F4F2EC`) dengan pencahayaan *studio portrait* hangat, bernapas alami, berkedip, mengangguk saat mendengarkan, dan menggerakkan bibir (*viseme lip-sync*) saat berbicara.
  - **Floating Control Dock (Gaya Zoom / Google Meet):**
    1. **Mikrofon / Dibisukan** (Toggle *mute/unmute* mikrofon kandidat).
    2. **Sela AI** (Ikon tangan untuk memotong pembicaraan AI secara instan / *barge-in*).
    3. **Akhiri** (Tombol merah lembut `#B94A48` dengan ikon tutup telepon yang membuka modal konfirmasi *"Akhiri Sesi Wawancara?"*).
- **Divider Tengah (`#split-divider`):**
  - Handle vertikal yang dapat di-*drag* (`col-resize`) untuk mengatur proporsi lebar panel kiri dan kanan, otomatis menyesuaikan ukuran *viewport* kanvas Three.js secara *real-time*.
- **Panel Kanan — Transkrip Langsung:**
  - Header bersih hanya bertuliskan **Transkrip Langsung** (tanpa keterangan WebSocket, tanpa indikator scroll otomatis, dan tanpa tombol salin catatan).
  - Gelembung percakapan rapi dengan stempel waktu `MM:SS`.
  - Label pembicara AI: **`Alya (AI Interviewer)`**.
  - Label pembicara Kandidat: **`{nama_kandidat} (Kandidat)`** (contoh: `Budi Santoso (Kandidat)`).
  - Mendukung tampilan teks yang sedang diketik/diucapkan secara langsung (*streaming transcript delta*) dengan *silent auto-scroll* ke bawah.

### C. Ringkasan Selesai Wawancara ([`InterviewCompletedPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/InterviewCompletedPage.tsx))
- Ikon centang di dalam lingkaran `accentsoft`, judul serif **"Wawancara Telah Selesai"**, dan pesan ucapan terima kasih personal kepada kandidat.
- Kartu ringkasan berisi 3 baris informasi: **Durasi Percakapan**, **Posisi Terdaftar**, dan **Status Evaluasi Asesmen**.
- Rating kepuasan kandidat berupa **5 bintang CSAT interaktif** (*"Bagaimana pengalaman interaksi Anda dengan AI?"*) tanpa kolom komentar tambahan dan tanpa tautan menuju halaman Recruiter.
- Tombol **Kembali ke Halaman Awal**.

---

## 6. Spesifikasi Halaman Recruiter / Admin (Clean Business UI)
Seluruh halaman Recruiter menggunakan palet **Warm Minimalist** dan bahasa bisnis yang bersih tanpa eksposur istilah protokol/kode:
1. **Dashboard Sesi ([`RecruiterDashboardPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterDashboardPage.tsx)):**
   - Ringkasan jumlah sesi dan skor rata-rata kandidat dalam kartu *warm stone*.
   - Filter status sesi yang bersih dan tabel daftar kandidat (Nama, Posisi, Status, Durasi, Skor & Rekomendasi, serta tautan ke Lobby, Ruang Wawancara, atau Laporan).
   - Tanpa tombol *"Launch 3D VRM Simulator"* atau jargon teknis PCM/WebSocket.
2. **Buat Sesi Wawancara ([`RecruiterSetupPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/RecruiterSetupPage.tsx)):**
   - Formulir bersih untuk mengisi Profil Kandidat & CV, Informasi Lowongan, Kriteria Penilaian (total bobot 100%), serta Pengaturan Pewawancara (Nama Persona, Suara, Bahasa, Durasi) tanpa menampilkan nama properti kode seperti `candidate.full_name` atau `POST /api/v1/sessions`.
3. **Laporan Evaluasi ([`EvaluationReportPage.tsx`](file:///srv/projects/ai-interviewer/frontend/src/pages/EvaluationReportPage.tsx)):**
   - Menampilkan ringkasan eksekutif, skor keseluruhan, rekomendasi rekrutmen, poin kekuatan, area pengembangan, rincian penilaian per kompetensi beserta kutipan jawaban kandidat, dan transkrip lengkap dalam tata letak *Warm Minimalist*.
