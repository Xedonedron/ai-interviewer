# Contract 3: 3D VRM Avatar States, Blendshapes & Procedural Animation (`vrm-avatar-states.md`)

- **Version:** `1.0.0`
- **Status:** `Locked`
- **Related Documents:** [PRD.md](../../PRD.md), [websocket-protocol.md](./websocket-protocol.md), [audio-pipeline-spec.md](./audio-pipeline-spec.md)

---

## 1. Compatibility & Standard Expression Names (`@pixiv/three-vrm`)

Sistem mendukung model **VRM 1.0** (dan **VRM 0.x** melalui normalisasi otomatis `@pixiv/three-vrm`). Seluruh manipulasi wajah wajib menggunakan API `vrm.expressionManager.setValue(expressionName, weight)` dengan rentang nilai `[0.0, 1.0]`.

### Daftar Expression / Blendshape Standar yang Digunakan:
1. **Viseme (Lip-Sync Mulut):**
   - `aa` — Vokal terbuka lebar (*"a"*)
   - `ih` — Vokal melebar tipis (*"i"*)
   - `ou` — Vokal mengerucut (*"u"*)
   - `ee` — Vokal setengah terbuka melebar (*"e"*)
   - `oh` — Vokal bulat (*"o"*)
2. **Kedipan Mata (*Gaze & Blink*):**
   - `blink` — Kedua mata berkedip bersamaan
   - `blinkLeft`, `blinkRight` — Opsional untuk variasi alami
3. **Emosi & Non-Verbal (*Emotion Presets*):**
   - `neutral` — Ekspresi dasar profesional
   - `happy` — Senyum ramah / menyemangati (dibatasi maksimal `0.35` saat berbicara agar tidak mengunci mesh mulut atau mata tertutup berlebihan)
   - `relaxed` — Ekspresi tenang saat mendengarkan
   - `angry` / `sad` / `surprised` — Digunakan secara sangat halus (`0.10 - 0.25`) hanya untuk penekanan mikro.

---

## 2. Avatar State Machine Definitions

| State ID | Pemicu Masuk (*Entry Trigger*) | Viseme Active? | Target Emosi Default | Procedural Bone Animation (Neck, Head, Spine, Chest) |
| :--- | :--- | :---: | :--- | :--- |
| **`IDLE`** | Inisialisasi selesai / menunggu sesi dimulai | `No` (Semua `0.0`) | `neutral: 1.0`, `relaxed: 0.15` | - **Breathing:** `chest.rotation.x = Math.sin(t * 1.6) * 0.015`<br>- **Micro Sway:** `head.rotation.y = Math.sin(t * 0.7) * 0.02`, `head.rotation.z = Math.cos(t * 0.5) * 0.015` |
| **`LISTENING`** | Event `avatar.state: LISTENING` atau kandidat sedang berbicara | `No` (Semua `0.0`) | `relaxed: 0.35`, `happy: 0.15` | - Breathing & Micro Sway tetap aktif.<br>- **Active Listening Nod:** Setiap `3.2 - 5.5` detik selama suara kandidat terdeteksi, tambahkan kurva anggukan kepala `head.rotation.x += Math.sin(nodPhase * Math.PI) * 0.065` (durasi 420ms). |
| **`THINKING`** | Kandidat berhenti bicara, menunggu chunk audio pertama AI | `No` (Semua `0.0`) | `neutral: 0.85` | - **Thoughtful Tilt:** `head.rotation.z` lerp ke `+0.045` rad, tatapan mata (`lookAt`) bergeser sedikit ke atas-samping selama 350ms sebelum kembali ke kamera. |
| **`SPEAKING`** | Chunk PCM 24kHz sedang diputar di `PcmStreamPlayer` | **`Yes` (Real-Time dari `AnalyserNode`)** | Sesuai field `emotion` (`neutral` atau `happy: 0.30`) | - **Speech Rhythm Head Motion:** Tambahkan modulasi amplitudo suara pada kepala: `head.rotation.x += rms * 0.05 * Math.sin(t * 6.0)`. |
| **`INTERRUPTED`** | Event `control.barge_in` diterima | **Fast Reset (`< 80ms` ke `0.0`)** | `surprised: 0.20` (selama 150ms) -> `LISTENING` | - **Micro Recoil:** `head.rotation.x -= 0.025` selama 120ms lalu transisi mulus ke `LISTENING`. |

---

## 3. Mathematical Formula for Viseme Smoothing & Clamping

Pada setiap tick `requestAnimationFrame(deltaTime)`:
1. Hitung koefisien *frame-rate independent exponential smoothing*:
   $$\alpha_{\text{attack}} = 1 - e^{-28.0 \cdot \Delta t}, \quad \alpha_{\text{release}} = 1 - e^{-16.0 \cdot \Delta t}$$
2. Untuk setiap viseme $k \in \{\text{aa}, \text{ih}, \text{ou}, \text{ee}, \text{oh}\}$:
   $$\alpha_k = \begin{cases} \alpha_{\text{attack}} & \text{jika } w_k^{\text{target}} > v_k^{(t-1)} \\ \alpha_{\text{release}} & \text{jika } w_k^{\text{target}} \le v_k^{(t-1)} \end{cases}$$
   $$v_k^{(t)} = v_k^{(t-1)} + \left(w_k^{\text{target}} - v_k^{(t-1)}\right) \cdot \alpha_k$$
3. **Total Mouth Blendshape Budget Normalization (Anti-Mesh Clipping):**
   - Agar mesh bibir VRM tidak mengalami *over-deformation* ketika beberapa viseme aktif bersamaan, jumlah total bobot seluruh viseme dibatasi maksimal **`1.15`**:
     $$S = \sum_{k} v_k^{(t)}$$
     $$\text{Jika } S > 1.15 \implies v_k^{(t)} \leftarrow v_k^{(t)} \times \frac{1.15}{S}$$
4. **Auto-Blink State Machine:**
   - Interval antar kedipan mata dipilih secara acak merata (*uniform random*) dalam rentang **`[2.5, 5.8]` detik**.
   - Siklus satu kedipan berdurasi **`150 ms`** (`60 ms` menutup mata hingga `blink = 1.0`, `20 ms` tertutup, `70 ms` membuka mata kembali ke `0.0`).
   - Saat `emotion === "happy"` aktif, nilai maksimum `blink` dikurangi sebesar `happyWeight * 0.4` agar kelopak mata tidak saling menembus (*clipping*).
