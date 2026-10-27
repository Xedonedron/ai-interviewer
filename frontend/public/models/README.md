# 3D VRM Models Directory (`public/models/`)

Place `.vrm` (VRM 0.x or VRM 1.0) files here:
- `alya.vrm` — Alya (Lead Technical Recruiter)
- `bima.vrm` — Bima (Engineering Manager)

## Procedural Humanoid Rig Fallback (60 FPS Guaranteed)
If `alya.vrm` or `bima.vrm` is not yet placed in `public/models/` (or during offline/CI testing), `VrmAvatarEngine.ts` automatically constructs an articulated 3D Procedural Humanoid Rig in Three.js with:
- Real-time Viseme Mouth Morphing (`aa`, `ih`, `ou`, `ee`, `oh`, clamped at `<= 1.15`)
- Upper Eyelid Blink Mesh (`blink` 150ms cycle)
- Expressive Eyebrows & Emotions (`neutral`, `happy`, `Encouraging`, `Thinking`, `surprised`, `relaxed`)
- Spine, Chest, Neck, Head, and Shoulder Bones driven by `VrmProceduralAnimator` (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `INTERRUPTED`)
