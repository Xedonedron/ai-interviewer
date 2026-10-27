# AGENTS.md — AI Interviewer Platform Workspace Rules

Dokumen ini berisi aturan wajib (*always-on rules*) bagi setiap AI Agent yang bekerja di dalam repository `/srv/projects/ai-interviewer`. Seluruh diskusi, perencanaan, penulisan kode, dan dokumentasi wajib mematuhi aturan di bawah ini.

---

## 1. Sumber Kebenaran & Konteks Proyek (Single Source of Truth)
Sebelum memulai analisis atau menulis kode di sesi baru, Agent **WAJIB** memeriksa:
1. `docs/STATE.md` — Status terkini proyek, milestone yang sedang berjalan, implementasi terakhir, dan *next steps*.
2. `REQUIREMENTS.md` & `PRD.md` (jika sudah dibuat) — Spesifikasi kebutuhan fungsional dan non-fungsional.
3. `docs/decisions/` — Daftar keputusan arsitektur (*Architecture Decision Records* / ADR) yang sudah dikunci.
4. `docs/plans/` — Rencana implementasi aktif dan riwayat perubahan yang telah dieksekusi.
5. `docs/contracts/` — Spesifikasi kontrak protokol WebSocket, skema payload JSON/binary audio, dan state avatar.
6. `graphify-out/` — Knowledge graph arsitektur & codebase (`GRAPH_REPORT.md`, `graph.json`, `wiki/index.md`).

---

## 2. Protokol Wajib: Plan -> Implement -> Track Changes & Update Graph
Setiap kali ada diskusi desain, penambahan fitur, perubahan arsitektur, atau bug fixing yang kompleks, Agent **WAJIB** menggunakan skill `plan-and-track` (`.agents/skills/plan-and-track/SKILL.md`) dan `graphify` (`.agents/skills/graphify/SKILL.md`) dengan alur berikut:

### A. Tahap Perencanaan & Reconnaissance (Before Implementation)
1. **Cek Knowledge Graph (`graphify`):** Jika `graphify-out/graph.json` sudah tersedia, jalankan query/explain/affected pada graph sebelum melakukan eksplorasi buta atau mengubah kode.
2. **Simpan Plan ke File:** Setelah berdiskusi dan menyusun rencana, simpan plan ke dalam `docs/plans/YYYY-MM-DD-<slug-topik>.md` sebelum mengeksekusi perubahan besar.
3. **Catat Keputusan (ADR):** Jika dalam diskusi terdapat pemilihan teknologi, pola desain, atau *trade-off* penting, buat atau perbarui dokumen di `docs/decisions/ADR-XXX-<slug-keputusan>.md`.

### B. Tahap Implementasi (During Implementation)
1. Fokuskan pengerjaan mengacu pada checklist di file `docs/plans/YYYY-MM-DD-<slug-topik>.md`.
2. Jika ada perubahan spesifikasi pesan WebSocket atau format audio antara Frontend dan Backend, perbarui `docs/contracts/` terlebih dahulu sebelum mengubah kode.

### C. Tahap Pencatatan, Sinkronisasi Graph & Penutupan (After Implementation / Definition of Done)
Sebuah task **BELUM dianggap selesai** sampai Agent melakukan hal berikut:
1. **Update Knowledge Graph (`graphify`):**
   - Setelah menambah, mengubah, atau menghapus file kode (`frontend/`, `backend/`, `scripts/`), **WAJIB** jalankan:
     ```bash
     graphify update .
     ```
   - Jika ada penambahan dokumen arsitektur/PRD besar dan perlu ekstraksi semantik penuh, jalankan workflow `/graphify` (`.agents/skills/graphify/SKILL.md`).
2. **Update Plan File:** Mengubah checklist `[ ]` menjadi `[x]` pada file `docs/plans/...` yang terkait, serta mengisi bagian **Implementation Log & Actual Changes** (mencatat file apa saja yang dibuat/diubah dan deviasi dari rencana awal jika ada).
3. **Update ADR (Jika Ada Perubahan Keputusan):** Mencatat alasan teknis apabila saat implementasi ditemukan kendala yang mengharuskan perubahan keputusan.
4. **Update `docs/STATE.md`:** Memperbarui ringkasan status proyek terkini dan riwayat perubahan (*changelog* singkat) agar sesi berikutnya selalu sinkron.

---

## 3. MANDATORY RULE: Knowledge Graph Navigation (Graphify)
Setiap developer atau AI Agent yang berinteraksi dengan repositori ini **WAJIB** memanfaatkan knowledge graph Graphify di `graphify-out/` untuk menjaga akurasi konteks dan relasi antar-modul.

### Artifacts Graphify:
- **Ringkasan Arsitektur & Klaster:** `graphify-out/GRAPH_REPORT.md`
- **Data Graph:** `graphify-out/graph.json`
- **Visualisasi Interaktif:** `graphify-out/graph.html`
- **Index Wiki Modul (Jika Digenerate):** `graphify-out/wiki/index.md`

### 4 Aturan Alur Kerja Koding dengan Graphify:
1. **SEBELUM KODING (Reconnaissance & Blast Radius):**
   - Cari node atau alur fitur relevan: `graphify query "<kata kunci>"`
   - Pahami detail simbol dan koneksinya: `graphify explain "<NamaSimbol>"`
   - Cek jalur relasi antar dua komponen: `graphify path "<SimbolAsal>" "<SimbolTujuan>"`
   - Analisis dampak perubahan (*blast radius*): `graphify affected "<path/ke/file atau Simbol>"`
2. **SAAT KODING (Contextual Accuracy):**
   - Pastikan konvensi penamaan, kontrak WebSocket, dan struktur modul konsisten dengan `docs/contracts/` dan `graphify-out/`.
3. **SETELAH KODING (Post-Edit Synchronization):**
   - Setiap selesai memodifikasi kode, **WAJIB** jalankan `graphify update .` (ekstraksi AST lokal yang cepat tanpa biaya token LLM) agar `graph.json` dan `GRAPH_REPORT.md` selalu *up-to-date*.
4. **VERIFIKASI:**
   - Pastikan build/test dan `graphify update .` berjalan bersih tanpa error sebelum menutup task.

---

## 4. Architecture Guardrails (Pantangan Teknis Mutlak)
Seluruh implementasi harus mematuhi batasan arsitektur inti dari `REQUIREMENTS.md`:
1. **Client-Side 3D VRM Rendering Only:**
   - Seluruh proses rendering avatar 3D (`.vrm` via Three.js + `@pixiv/three-vrm`) dan ekstraksi frekuensi lip-sync (`AudioContext` + `AnalyserNode`) **wajib** berjalan di browser kandidat.
   - **DILARANG** menambahkan beban rendering video/3D di sisi server atau menggunakan solusi yang membutuhkan GPU server (seperti VTube Studio / server-side WebRTC video rendering).
2. **Strict API Key Isolation (Keamanan):**
   - Kredensial / API Key Gemini **DILARANG KERAS** diekspos ke kode frontend/browser.
   - Seluruh koneksi ke Gemini Multimodal Live API wajib melalui Backend WebSocket Relay.
3. **Low-Latency & Non-Blocking Audio Pipeline:**
   - Target latensi suara *end-to-end* adalah **< 1.5 - 2 detik**.
   - Jalur relay WebSocket untuk chunk audio PCM (16kHz input dari `AudioWorklet` / 24kHz output dari Gemini) harus bersifat *asynchronous* dan bebas dari operasi *blocking I/O* berat.
4. **Stateless / Lightweight Relay untuk Cloud Scalability:**
   - Backend harus dirancang hemat CPU dan RAM agar satu container/pod kecil di GCP (Cloud Run / GKE / Compute Engine) mampu menangani puluhan sesi wawancara simultan.

---

## 5. Struktur Direktori Dokumentasi Proyek
Jaga kerapihan struktur direktori berikut setiap saat:
```text
/srv/projects/ai-interviewer/
├── AGENTS.md                        # Aturan wajib workspace (file ini)
├── REQUIREMENTS.md                  # Dokumen requirement awal
├── PRD.md                           # Product Requirements Document komprehensif
├── graphify-out/                    # Output Knowledge Graph (graph.json, GRAPH_REPORT.md, graph.html)
├── .agents/
│   └── skills/
│       ├── plan-and-track/          # Skill SOP perencanaan, ADR, dan tracking perubahan
│       └── graphify/                # Skill ekstraksi & pembaruan Knowledge Graph
└── docs/
    ├── STATE.md                     # Ringkasan status proyek saat ini & changelog
    ├── plans/                       # Semua dokumen rencana & log implementasi
    ├── decisions/                   # Architecture Decision Records (ADR)
    └── contracts/                   # Kontrak protokol WebSocket, audio spec, & API schema
```

---

## 6. Gaya Komunikasi & Bahasa
- Gunakan Bahasa Indonesia yang jelas, ringkas, dan mudah dipahami saat berdiskusi dengan user, namun pertahankan istilah teknis standar dalam Bahasa Inggris (misal: *blendshape*, *viseme*, *WebSocket relay*, *barge-in*, *PCM chunk*).
- Selalu sertakan tautan file yang dapat diklik (format Markdown `file:///...`) saat merujuk pada file, rencana, atau simbol kode.
