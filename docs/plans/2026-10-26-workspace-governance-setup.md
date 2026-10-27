# Plan: Workspace Preparation, Documentation Governance & Graphify Setup

- **Date:** 2026-10-26
- **Status:** `Completed`
- **Related ADRs:** [ADR-001](../decisions/ADR-001-core-architecture.md)

---

## 1. Objective & Context
Menyiapkan fondasi *governance*, aturan kerja otomatis, dan *Knowledge Graph* (`graphify`) untuk AI Agent di dalam workspace `/srv/projects/ai-interviewer` agar setiap diskusi, rencana (*plan*), keputusan arsitektur (*decision*), perubahan implementasi (*changes*), dan relasi kode/dokumen selalu terdokumentasi serta tersinkronisasi antar sesi.

## 2. Scope & Key Decisions
- **In Scope:**
  - Pembuatan `AGENTS.md` sebagai *always-on workspace rules* dengan kewajiban `plan-and-track` dan `graphify`.
  - Pembuatan skill `plan-and-track` beserta template standar untuk Plan dan ADR.
  - Instalasi skill `graphify` (`.agents/skills/graphify/SKILL.md`), konfigurasi CLI `graphify`, dan inisialisasi graph awal di `graphify-out/`.
  - Inisialisasi struktur direktori `docs/` (`STATE.md`, `plans/`, `decisions/`, `contracts/`).
  - Pencatatan keputusan arsitektur awal dari `REQUIREMENTS.md` ke dalam `ADR-001`.
- **Out of Scope:**
  - Penulisan kode aplikasi frontend/backend (akan dilakukan setelah penyusunan `PRD.md` dan `ARCHITECTURE.md`).
- **Key Decisions Agreed:**
  - Menggunakan kombinasi `AGENTS.md` (untuk aturan wajib selalu aktif), `.agents/skills/plan-and-track/` (untuk SOP dan template pencatatan), dan `.agents/skills/graphify/` (untuk manajemen knowledge graph).
  - Setiap selesai implementasi kode/dokumen, Agent wajib menjalankan `graphify update .` (atau rebuild graph) sebelum task ditutup.

## 3. Action Plan & Checklist
- [x] **Step 1:** Buat file `/srv/projects/ai-interviewer/AGENTS.md` dengan aturan Single Source of Truth, Protokol Plan-Implement-Track, Mandatory Rule Graphify, dan Architecture Guardrails.
- [x] **Step 2:** Buat skill `.agents/skills/plan-and-track/SKILL.md` beserta template di `resources/plan-template.md` dan `resources/adr-template.md`.
- [x] **Step 3:** Pasang skill `.agents/skills/graphify/SKILL.md`, siapkan CLI `graphify` & `graphify-python`, serta bangun graph awal di `graphify-out/`.
- [x] **Step 4:** Buat `docs/decisions/ADR-001-core-architecture.md` berdasarkan keputusan di `REQUIREMENTS.md`.
- [x] **Step 5:** Buat `docs/contracts/README.md` sebagai placeholder kontrak protokol WebSocket & Audio.
- [x] **Step 6:** Buat `docs/STATE.md` dan perbarui `README.md` agar mencerminkan struktur proyek terbaru.

## 4. Verification Criteria
- Struktur folder `.agents/skills/plan-and-track/`, `.agents/skills/graphify/`, `docs/`, dan `graphify-out/` tersedia lengkap.
- Perintah CLI `graphify explain` dan `graphify path` dapat dieksekusi dengan lancar terhadap `graphify-out/graph.json`.

---

## 5. Implementation Log & Actual Changes

### Files Created / Modified
- `AGENTS.md`: Dibuat aturan wajib workspace, *mandatory rule* `graphify` (sebelum, saat, dan setelah koding), serta *architecture guardrails*.
- `.agents/skills/plan-and-track/SKILL.md`: Dibuat SOP pembuatan plan, ADR, sinkronisasi `graphify`, dan update state.
- `.agents/skills/plan-and-track/resources/plan-template.md`: Template standar dokumen plan & log implementasi (termasuk status sync `graphify`).
- `.agents/skills/plan-and-track/resources/adr-template.md`: Template standar Architecture Decision Record.
- `.agents/skills/graphify/SKILL.md`: Skill ekstraksi dan manajemen *knowledge graph* Graphify.
- `graphify-out/`: Dihasilkan `graph.json`, `GRAPH_REPORT.md`, `graph.html`, dan `obsidian/` vault awal.
- `docs/decisions/ADR-001-core-architecture.md`: Merangkum keputusan 3D VRM, Gemini Live API, dan Backend Relay.
- `docs/plans/2026-10-26-workspace-governance-setup.md`: Mencatat plan dan implementasi setup workspace ini.
- `docs/contracts/README.md`: Struktur awal dokumentasi kontrak protokol.
- `docs/STATE.md`: Dashboard status terkini proyek.
- `README.md`: Diperbarui dengan daftar struktur dokumen, aturan proyek, dan `graphify-out/`.

### Knowledge Graph (`graphify`) Sync Status
- Graph awal berhasil diinisialisasi di `graphify-out/graph.json` (**15 nodes, 20 edges, 3 communities**: *Real-Time Voice Relay & Gemini API*, *3D VRM Avatar & Lip-Sync Pipeline*, dan *Workspace Governance & Tracking*).

### Deviations from Original Plan
- Ditambahkan integrasi penuh `graphify` sesuai permintaan user serta perbaikan wrapper CLI `~/.local/bin/graphify` agar menunjuk ke environment Python 3.12 di `/srv/hermes-data/...` yang valid.

### Outcome & Follow-up
- Workspace dan *knowledge graph* siap digunakan. Langkah selanjutnya adalah menyusun `PRD.md` dan `ARCHITECTURE.md`.
