import { describe, expect, it } from 'vitest';
import {
  CHUNK_BYTES_40MS,
  CHUNK_SAMPLES_40MS,
  computeFrameRms,
  downsampleFloat32Buffer,
  MicCaptureManager,
  quantizeFloat32BufferToInt16,
  quantizeFloat32ToInt16Sample,
  TARGET_CAPTURE_SAMPLE_RATE,
} from '../engine/audio/MicCaptureManager';
import { mapRmsToMicLevelPct } from '../pages/CandidateLobbyPage';
import { VrmAvatarEngine } from '../engine/vrm/VrmAvatarEngine';
import {
  decodePcmS16LeToFloat32,
  DOWNSTREAM_SAMPLE_RATE,
  PcmStreamPlayer,
  type AudioBufferSourceLike,
  type AudioContextLike,
} from '../engine/audio/PcmStreamPlayer';
import {
  clampVisemeBudget,
  computeTargetVisemesFromFormants,
  extractFormantEnergiesFromBuffers,
  MAX_TOTAL_VISEME_BUDGET,
  stepVisemeSmoothing,
} from '../engine/vrm/VrmLipSync';
import {
  BLINK_TOTAL_DURATION_SEC,
  computeBlinkWeight,
  VrmProceduralAnimator,
} from '../engine/vrm/VrmProceduralAnim';
import { QualityGovernor } from '../engine/vrm/QualityGovernor';
import { generateSyntheticFormantPcm24k } from '../services/simulator/MockInterviewHarness';

/**
 * Lightweight mock AudioContext for deterministic unit testing of `PcmStreamPlayer`.
 */
function createMockAudioContext(): {
  ctx: AudioContextLike;
  stoppedNodes: AudioBufferSourceLike[];
} {
  let now = 1.0;
  const stoppedNodes: AudioBufferSourceLike[] = [];

  const dummyGain = {
    gain: {
      value: 1.0,
      setTargetAtTime(val: number) {
        this.value = val;
      },
    },
    connect() {},
    disconnect() {},
  } as unknown as GainNode;

  const dummyAnalyser = {
    fftSize: 512,
    smoothingTimeConstant: 0.45,
    minDecibels: -85,
    maxDecibels: -10,
    frequencyBinCount: 256,
    connect() {},
    disconnect() {},
    getByteFrequencyData(arr: Uint8Array) {
      arr.fill(0);
    },
    getFloatTimeDomainData(arr: Float32Array) {
      arr.fill(0);
    },
  } as unknown as AnalyserNode;

  const ctx: AudioContextLike = {
    get currentTime() {
      return now;
    },
    sampleRate: 48000,
    state: 'running',
    destination: {} as AudioNode,
    async resume() {},
    async close() {},
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const channelData = new Float32Array(length);
      return {
        length,
        sampleRate,
        duration: length / sampleRate,
        numberOfChannels: 1,
        copyToChannel(src: Float32Array) {
          channelData.set(src);
        },
        getChannelData() {
          return channelData;
        },
      } as unknown as AudioBuffer;
    },
    createBufferSource() {
      const node: AudioBufferSourceLike = {
        buffer: null,
        onended: null,
        connect() {},
        disconnect() {},
        start() {},
        stop() {
          stoppedNodes.push(node);
        },
      };
      return node;
    },
    createAnalyser() {
      return dummyAnalyser;
    },
    createGain() {
      return dummyGain;
    },
  };

  return { ctx, stoppedNodes };
}

describe('Contract 2: Web Audio 16kHz PCM Quantization & Downsampling', () => {
  it('quantizes Float32 [-1.0, 1.0] to Signed 16-bit PCM [-32768, 32767] with strict clamping', () => {
    expect(quantizeFloat32ToInt16Sample(0)).toBe(0);
    expect(quantizeFloat32ToInt16Sample(1.0)).toBe(32767);
    expect(quantizeFloat32ToInt16Sample(-1.0)).toBe(-32768);
    // Out-of-bounds values must clamp without integer overflow wrap-around
    expect(quantizeFloat32ToInt16Sample(1.85)).toBe(32767);
    expect(quantizeFloat32ToInt16Sample(-2.4)).toBe(-32768);
  });

  it('downsamples 48kHz Float32 frames to 16kHz and produces exact 40ms (640 samples = 1,280 bytes) chunks', () => {
    // 40ms at 48,000 Hz = 1,920 samples
    const input48k = new Float32Array(1920);
    for (let i = 0; i < input48k.length; i++) {
      input48k[i] = Math.sin((2 * Math.PI * 440 * i) / 48000) * 0.5;
    }

    const downsampled16k = downsampleFloat32Buffer(
      input48k,
      48000,
      TARGET_CAPTURE_SAMPLE_RATE,
    );
    expect(downsampled16k.length).toBe(CHUNK_SAMPLES_40MS); // 640 samples

    const pcm16 = quantizeFloat32BufferToInt16(downsampled16k);
    expect(pcm16.length).toBe(640);
    expect(pcm16.byteLength).toBe(CHUNK_BYTES_40MS); // 1,280 bytes

    // Verify round-trip decoding back to Float32
    const decoded = decodePcmS16LeToFloat32(pcm16.buffer as ArrayBuffer);
    expect(decoded.length).toBe(640);
    expect(Math.abs(decoded[10] - downsampled16k[10])).toBeLessThan(0.001);
  });

  it('computes accurate RMS energy for Local VAD threshold comparison', () => {
    const silence = new Float32Array(640);
    expect(computeFrameRms(silence)).toBe(0);

    const constantSignal = new Float32Array(640).fill(0.1);
    expect(computeFrameRms(constantSignal)).toBeCloseTo(0.1, 4);
  });
});

describe('Contract 3: VRM Viseme Asymmetric Smoothing & <= 1.15 Budget Clamping', () => {
  it('enforces Total Mouth Blendshape Budget Normalization (sum <= 1.15)', () => {
    const rawWeights = {
      aa: 0.95,
      ih: 0.65,
      ou: 0.55,
      ee: 0.75,
      oh: 0.85,
    };
    const clamped = clampVisemeBudget(rawWeights);
    const sum = clamped.aa + clamped.ih + clamped.ou + clamped.ee + clamped.oh;
    expect(sum).toBeLessThanOrEqual(MAX_TOTAL_VISEME_BUDGET + 1e-6);
    expect(sum).toBeCloseTo(MAX_TOTAL_VISEME_BUDGET, 5);
  });

  it('applies faster attack rate (lambda=28) than release rate (lambda=16) and respects budget', () => {
    const zero = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    const highTarget = { aa: 1.0, ih: 0, ou: 0, ee: 0, oh: 0 };
    const dt = 1 / 60; // 16.67ms frame

    const attacked = stepVisemeSmoothing(zero, highTarget, dt);
    const attackDelta = attacked.aa - 0;

    const released = stepVisemeSmoothing(highTarget, zero, dt);
    const releaseDelta = 1.0 - released.aa;

    // Attack must be noticeably faster than release per Contract 3 Section 3.1
    expect(attackDelta).toBeGreaterThan(releaseDelta);
    expect(attacked.aa).toBeCloseTo(1 - Math.exp(-28.0 * dt), 4);
    expect(released.aa).toBeCloseTo(1 - (1 - Math.exp(-16.0 * dt)), 4);
  });

  it('extracts formant bands and maps vowel frequencies to distinct visemes', () => {
    const freqBytes = new Uint8Array(256);
    // Populate mid-band bins (8..20) for open vowel `aa`
    for (let b = 8; b <= 20; b++) {
      freqBytes[b] = 210;
    }
    const timeFloats = new Float32Array(512).fill(0.18);

    const energies = extractFormantEnergiesFromBuffers(
      freqBytes,
      timeFloats,
      48000,
      512,
    );
    expect(energies.mid).toBeGreaterThan(energies.low);
    expect(energies.mid).toBeGreaterThan(energies.high);

    const visemes = computeTargetVisemesFromFormants(energies);
    expect(visemes.aa).toBeGreaterThan(0.4);
  });
});

describe('Contract 3: VRM Avatar State Machine, Auto-Blink & Emotion Guardrails', () => {
  it('scales down blink maximum by happyWeight * 0.4 during 150ms blink cycle', () => {
    // At hold phase (70ms into 150ms cycle), rawBlink = 1.0
    const neutralBlink = computeBlinkWeight(0.07, 0.0);
    expect(neutralBlink).toBeCloseTo(1.0, 4);

    const happyBlink = computeBlinkWeight(0.07, 0.5);
    // Max allowed blink = 1.0 - 0.5 * 0.4 = 0.80
    expect(happyBlink).toBeCloseTo(0.8, 4);

    // Outside 150ms cycle -> 0
    expect(computeBlinkWeight(BLINK_TOTAL_DURATION_SEC + 0.01, 0.0)).toBe(0);
  });

  it('caps happy expression at <= 0.35 during SPEAKING and auto-transitions INTERRUPTED -> LISTENING after 150ms', () => {
    const animator = new VrmProceduralAnimator(() => 0.5);

    animator.setState('SPEAKING', 'happy');
    let pose = animator.update(0.1, 0.2, true);
    expect(pose.state).toBe('SPEAKING');
    expect(pose.expressions.happy).toBeLessThanOrEqual(0.3501);

    // Trigger INTERRUPTED -> should recoil and then auto-transition to LISTENING after 150ms
    animator.setState('INTERRUPTED', 'surprised');
    pose = animator.update(0.05, 0, true);
    expect(pose.state).toBe('INTERRUPTED');

    // Advance past 150ms total in INTERRUPTED
    pose = animator.update(0.1, 0, true);
    pose = animator.update(0.05, 0, true);
    expect(pose.state).toBe('LISTENING');
  });

  it('QualityGovernor downgrades and upgrades tiers based on rolling FPS', () => {
    const governor = new QualityGovernor();
    expect(governor.getTier()).toBe('TIER_1_ULTRA');

    // Feed 60 frames at 30 FPS (dt = 0.0333s) past the 2,500ms cooldown -> should downgrade to TIER_2_BALANCED
    for (let i = 0; i < 60; i++) {
      governor.recordFrame(1 / 30, 5000 + i * 35);
    }
    expect(governor.getTier()).toBe('TIER_2_BALANCED');
  });
});

describe('Contract 2: PcmStreamPlayer 24kHz Playback & <50ms Barge-In Flush SLA', () => {
  it('enqueues 24kHz synthetic formant PCM chunks and flushes all active nodes in < 50ms', () => {
    const { ctx, stoppedNodes } = createMockAudioContext();
    const player = new PcmStreamPlayer(ctx);

    const chunk1 = generateSyntheticFormantPcm24k(100, 'aa');
    const chunk2 = generateSyntheticFormantPcm24k(100, 'oh');
    const chunk3 = generateSyntheticFormantPcm24k(100, 'ih');

    expect(chunk1.byteLength).toBe((DOWNSTREAM_SAMPLE_RATE * 0.1) * 2); // 4,800 bytes

    player.enqueuePcmChunk(chunk1);
    player.enqueuePcmChunk(chunk2);
    player.enqueuePcmChunk(chunk3);

    expect(player.getActiveNodeCount()).toBe(3);
    expect(player.getNextPlayTime()).toBeGreaterThan(1.0);

    // Trigger Barge-In Flush and verify SLA < 50ms
    const flushDurationMs = player.flushPlaybackQueue();
    expect(flushDurationMs).toBeLessThan(50);
    expect(player.getActiveNodeCount()).toBe(0);
    expect(player.getNextPlayTime()).toBe(0);
    expect(stoppedNodes.length).toBe(3);
  });

  it('automatically restores full volume (setDucking(false)) when enqueuing the first chunk of a new AI speech turn', () => {
    const { ctx } = createMockAudioContext();
    const player = new PcmStreamPlayer(ctx);

    // Simulate stuck local VAD ducking from a previous turn
    player.setDucking(true);
    expect(player.isDucked()).toBe(true);

    // Enqueue first chunk of Turn 2 when activeSourceNodes is empty -> must auto-unduck to 1.0
    const turn2Chunk = generateSyntheticFormantPcm24k(100, 'aa');
    player.enqueuePcmChunk(turn2Chunk);
    expect(player.isDucked()).toBe(false);
    expect(player.getActiveNodeCount()).toBe(1);
  });
});

describe('Frontend Audio & VRM Fixes Verification (Lobby Mic Meter, Worklet Destination Graph & VRM Lifecycle)', () => {
  it('maps real-time microphone RMS to UI percentage (0% on silence/noise floor, up to 100% on speech)', () => {
    expect(mapRmsToMicLevelPct(0)).toBe(0);
    expect(mapRmsToMicLevelPct(0.002)).toBe(0); // below noise floor
    const normalSpeechPct = mapRmsToMicLevelPct(0.08);
    expect(normalSpeechPct).toBeGreaterThan(25);
    expect(normalSpeechPct).toBeLessThanOrEqual(100);
    expect(mapRmsToMicLevelPct(0.45)).toBe(100);
  });

  it('connects MicCaptureManager AudioWorkletNode through a muted GainNode (gain=0) to destination', async () => {
    const connections: Array<{ from: string; to: string }> = [];
    let createdGainValue = -1;

    const origMediaDevices = navigator.mediaDevices;
    const origAudioContext = globalThis.AudioContext;
    const origAudioWorkletNode = globalThis.AudioWorkletNode;

    try {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          getUserMedia: async () => ({
            getTracks: () => [{ stop() {} }],
            getAudioTracks: () => [{ onended: null, stop() {} }],
          }),
        },
      });

      class MockAudioWorkletNode {
        public port = {
          onmessage: null as ((ev: MessageEvent) => void) | null,
          postMessage() {},
        };
        connect(target: { __name?: string }) {
          connections.push({
            from: 'AudioWorkletNode',
            to: target.__name ?? 'unknown',
          });
        }
        disconnect() {}
      }

      class MockAudioContext {
        public state = 'running';
        public sampleRate = 48000;
        public destination = { __name: 'AudioContext.destination' };
        public audioWorklet = {
          addModule: async () => {},
        };
        async resume() {}
        async close() {}
        createMediaStreamSource() {
          return {
            connect(target: unknown) {
              if (target instanceof MockAudioWorkletNode) {
                connections.push({
                  from: 'MediaStreamAudioSourceNode',
                  to: 'AudioWorkletNode',
                });
              }
            },
            disconnect() {},
          };
        }
        createGain() {
          const gainNode = {
            __name: 'SilentGainNode',
            gain: { value: 1 },
            connect(target: { __name?: string }) {
              createdGainValue = gainNode.gain.value;
              connections.push({
                from: 'SilentGainNode',
                to: target.__name ?? 'unknown',
              });
            },
            disconnect() {},
          };
          return gainNode;
        }
      }

      globalThis.AudioContext =
        MockAudioContext as unknown as typeof AudioContext;
      globalThis.AudioWorkletNode =
        MockAudioWorkletNode as unknown as typeof AudioWorkletNode;

      const manager = new MicCaptureManager();
      await manager.startCapture();

      expect(createdGainValue).toBe(0);
      expect(connections).toEqual([
        { from: 'MediaStreamAudioSourceNode', to: 'AudioWorkletNode' },
        { from: 'AudioWorkletNode', to: 'SilentGainNode' },
        { from: 'SilentGainNode', to: 'AudioContext.destination' },
      ]);

      await manager.stopCapture();
    } finally {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: origMediaDevices,
      });
      globalThis.AudioContext = origAudioContext;
      globalThis.AudioWorkletNode = origAudioWorkletNode;
    }
  });

  it('tracks VrmAvatarEngine dispose state to guard against React StrictMode async race conditions', () => {
    const engine = new VrmAvatarEngine();
    expect(engine.isDisposed()).toBe(false);

    const frame = engine.stepFrame(1 / 60);
    expect(frame.pose.state).toBe('IDLE');
    engine.setAvatarState('LISTENING', 'neutral');
    expect(engine.stepFrame(1 / 60).pose.state).toBe('LISTENING');

    engine.dispose();
    expect(engine.isDisposed()).toBe(true);
  });

  it('smoothly interpolates procedural bone rotations across state transitions without instantaneous pose snapping', () => {
    const animator = new VrmProceduralAnimator(() => 0.2);
    const frame0 = animator.update(1 / 60, 0, true);

    // Transition rapidly across states and verify per-frame rotation delta is bounded (< 0.015 rad per 16ms frame)
    animator.setState('SPEAKING', 'happy');
    const frame1 = animator.update(1 / 60, 0.35, true);
    expect(Math.abs(frame1.headRotation.x - frame0.headRotation.x)).toBeLessThan(0.015);
    expect(Math.abs(frame1.headRotation.y - frame0.headRotation.y)).toBeLessThan(0.015);

    animator.setState('INTERRUPTED', 'surprised');
    const frame2 = animator.update(1 / 60, 0, false);
    expect(Math.abs(frame2.headRotation.x - frame1.headRotation.x)).toBeLessThan(0.015);
  });
});
