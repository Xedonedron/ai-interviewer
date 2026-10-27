---
name: plan-and-track
description: >-
  Standard operating procedure for creating implementation plans, recording
  Architecture Decision Records (ADRs), logging implementation changes,
  synchronizing the Graphify knowledge graph, and updating project state in
  docs/. Activate this skill whenever discussing a new feature/architecture,
  creating a plan before execution, making technical decisions, or completing an
  implementation task.
---

# Plan, Decision, Implementation & Graph Tracking Skill

Gunakan skill ini untuk memastikan seluruh hasil diskusi, rencana kerja (*plans*), keputusan teknis (*decisions*), riwayat perubahan (*implementation changes*), dan *Knowledge Graph* (`graphify-out/`) tercatat serta tersinkronisasi secara sistematis.

---

## Kapan Menggunakan Skill Ini?
1. **Setelah Diskusi / Sebelum Implementasi:** Saat user menyetujui sebuah ide, rencana fitur, pembuatan dokumen besar (seperti `PRD.md` atau `ARCHITECTURE.md`), atau *refactoring*.
2. **Saat Mengambil Keputusan Teknis:** Saat memilih *tech stack*, *library*, protokol komunikasi, atau arsitektur.
3. **Selama & Setelah Implementasi:** Saat menyelesaikan *task* untuk mencatat file apa saja yang berubah, meng-update *knowledge graph* (`graphify`), mencatat deviasi dari rencana awal, dan memperbarui status proyek.

---

## Prosedur Langkah demi Langkah (Workflow)

### Langkah 1: Cek Konteks Terkini & Knowledge Graph
Sebelum membuat rencana baru, periksa:
- [STATE.md](../../../docs/STATE.md) untuk melihat status terakhir dan penomoran plan/ADR terakhir.
- File relevan di `docs/plans/` atau `docs/decisions/`.
- Jika `graphify-out/graph.json` sudah ada dan tugas menyentuh kode/modul eksisting, jalankan `graphify query "<topik>"` atau `graphify affected "<file/simbol>"` untuk memahami *blast radius*.

### Langkah 2: Buat / Update Dokumen Plan (`docs/plans/`)
Setiap rencana kerja harus disimpan ke `docs/plans/YYYY-MM-DD-<slug-topik>.md` menggunakan struktur dari [plan-template.md](./resources/plan-template.md).
- Pastikan memiliki daftar **Action Items / Checklist** yang spesifik (termasuk langkah update `graphify`).
- Sediakan bagian **Implementation Log & Actual Changes** yang akan diisi setelah pengerjaan selesai.

### Langkah 3: Catat Keputusan di ADR (`docs/decisions/`)
Jika diskusi menghasilkan keputusan arsitektur atau *tech stack* baru (atau mengubah keputusan lama):
- Buat file baru `docs/decisions/ADR-XXX-<slug-keputusan>.md` (increment nomor `XXX` dari ADR terakhir) menggunakan template [adr-template.md](./resources/adr-template.md).
- Jika membatalkan ADR lama, ubah status ADR lama menjadi `Superseded by ADR-YYY`.

### Langkah 4: Update Kontrak Sistem (`docs/contracts/`) — *Jika Relevan*
Jika perubahan menyangkut komunikasi antara Frontend (Browser), Backend Relay, atau Gemini Live API:
- Dokumentasikan perubahan schema JSON, event WebSocket, atau parameter audio PCM di dalam `docs/contracts/`.

### Langkah 5: Sinkronisasi Graphify & Finalisasi Log Perubahan (Wajib Saat Task Selesai)
Setelah implementasi selesai diverifikasi:
1. **Update Knowledge Graph (`graphify`):**
   - Jika ada perubahan pada file kode (`frontend/`, `backend/`, `scripts/`), jalankan:
     ```bash
     graphify update .
     ```
   - Jika perubahan berupa penambahan dokumen desain/arsitektur baru atau belum ada `graphify-out/graph.json`, jalankan pipeline ekstraksi menggunakan skill [graphify](../graphify/SKILL.md) agar seluruh node konsep dan kode terhubung di `graphify-out/`.
2. **Update Plan File (`docs/plans/YYYY-MM-DD-<slug-topik>.md`):**
   - Tandai item yang selesai dengan `[x]`.
   - Isi bagian **Implementation Log & Actual Changes** dengan daftar file yang dibuat/diubah, status update `graphify`, dan deviasi dari plan awal (jika ada).
   - Ubah status plan menjadi `Completed` (atau `In Progress` jika baru sebagian).
3. **Perbarui [STATE.md](../../../docs/STATE.md):**
   - Perbarui bagian **Current Phase / Focus**.
   - Tambahkan entri baru di bagian **Changelog / Recent Implementation History**.
   - Perbarui tabel **Plans & Implementation Tracker** dan **Architecture Decisions Log**.
   - Perbarui **Next Immediate Steps**.
