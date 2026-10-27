/**
 * Contract 2: Downstream Playback & Analyser Graph Specification (`audio-pipeline-spec.md`)
 * Decodes incoming 24,000 Hz `PCM_S16LE` binary frames into Float32 `AudioBuffer`,
 * schedules gapless playback with 60ms initial jitter margin, exposes `AnalyserNode`
 * (`fftSize: 512`, `smoothingTimeConstant: 0.45`) for VRM formant lip-sync,
 * supports Local VAD audio ducking (`gain = 0.20`), and guarantees `< 50ms` barge-in flush.
 */

export const DOWNSTREAM_SAMPLE_RATE = 24000;
export const INITIAL_JITTER_MARGIN_SEC = 0.060; // 60ms initial jitter margin
export const MIN_LOOKAHEAD_SEC = 0.005; // 5ms minimum scheduling lookahead
export const DUCKING_GAIN_VALUE = 0.20;
export const NORMAL_GAIN_VALUE = 1.0;

/**
 * Pure helper: Decodes a Little-Endian 16-bit Signed PCM (`PCM_S16LE`) ArrayBuffer
 * into normalized Float32Array samples in `[-1.0, 1.0]`.
 */
export function decodePcmS16LeToFloat32(arrayBuffer: ArrayBuffer): Float32Array {
  const int16 = new Int16Array(arrayBuffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }
  return float32;
}

export interface AudioBufferSourceLike {
  buffer: AudioBuffer | null;
  onended: (() => void) | null;
  connect: (destination: AudioNode) => void;
  disconnect: () => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: AudioContextState;
  readonly destination: AudioNode;
  resume: () => Promise<void>;
  close: () => Promise<void>;
  createBuffer: (numberOfChannels: number, length: number, sampleRate: number) => AudioBuffer;
  createBufferSource: () => AudioBufferSourceLike;
  createAnalyser: () => AnalyserNode;
  createGain: () => GainNode;
}

export class PcmStreamPlayer {
  private audioCtx: AudioContextLike | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private activeSourceNodes: Set<AudioBufferSourceLike> = new Set();
  private nextPlayTime = 0;
  private ducked = false;
  private onPlaybackStateChange?: (isPlaying: boolean) => void;
  private injectedAudioCtx?: AudioContextLike;

  constructor(
    audioCtx?: AudioContextLike,
    onPlaybackStateChange?: (isPlaying: boolean) => void,
  ) {
    this.injectedAudioCtx = audioCtx;
    this.onPlaybackStateChange = onPlaybackStateChange;
    if (audioCtx) {
      this.ensureAudioGraph();
    } else {
      try {
        this.ensureAudioGraph();
      } catch {
        // Defer AudioContext creation if browser blocks or lacks WebAudio at init
      }
    }
  }

  private ensureAudioGraph(): AudioContextLike | null {
    if (this.audioCtx && this.analyserNode && this.gainNode) {
      return this.audioCtx;
    }
    try {
      const AudioCtxCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx =
        this.injectedAudioCtx ??
        (new AudioCtxCtor() as unknown as AudioContextLike);
    } catch {
      return null;
    }

    this.analyserNode = this.audioCtx.createAnalyser();
    this.analyserNode.fftSize = 512;
    this.analyserNode.smoothingTimeConstant = 0.45;
    this.analyserNode.minDecibels = -85;
    this.analyserNode.maxDecibels = -10;

    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = this.ducked ? DUCKING_GAIN_VALUE : NORMAL_GAIN_VALUE;

    this.analyserNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);
    return this.audioCtx;
  }

  public getAnalyserNode(): AnalyserNode | null {
    this.ensureAudioGraph();
    return this.analyserNode;
  }

  public getAudioContext(): AudioContextLike | null {
    return this.ensureAudioGraph();
  }

  public getActiveNodeCount(): number {
    return this.activeSourceNodes.size;
  }

  public getNextPlayTime(): number {
    return this.nextPlayTime;
  }

  /**
   * Enqueues a 24,000 Hz `PCM_S16LE` binary frame for gapless playback.
   */
  public enqueuePcmChunk(arrayBuffer: ArrayBuffer): void {
    if (arrayBuffer.byteLength < 2) return;

    const ctx = this.ensureAudioGraph();
    if (!ctx || !this.analyserNode) return;

    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => {});
    }

    const float32 = decodePcmS16LeToFloat32(arrayBuffer);
    const audioBuffer = ctx.createBuffer(1, float32.length, DOWNSTREAM_SAMPLE_RATE);
    if (typeof audioBuffer.copyToChannel === 'function') {
      audioBuffer.copyToChannel(float32 as Float32Array<ArrayBuffer>, 0);
    } else {
      const ch = audioBuffer.getChannelData(0);
      ch.set(float32);
    }

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(this.analyserNode);

    const now = ctx.currentTime;
    let startTime: number;

    if (this.activeSourceNodes.size === 0 || this.nextPlayTime <= now) {
      // First chunk of a new turn: ensure gain is restored to 100% (unducked) and schedule with 60ms initial jitter margin
      this.setDucking(false);
      startTime = now + INITIAL_JITTER_MARGIN_SEC;
    } else {
      startTime = Math.max(now + MIN_LOOKAHEAD_SEC, this.nextPlayTime);
    }

    this.nextPlayTime = startTime + audioBuffer.duration;
    const wasEmpty = this.activeSourceNodes.size === 0;
    this.activeSourceNodes.add(sourceNode);

    if (wasEmpty) {
      this.onPlaybackStateChange?.(true);
    }

    sourceNode.onended = () => {
      this.activeSourceNodes.delete(sourceNode);
      try {
        sourceNode.disconnect();
      } catch {
        // Ignore disconnect errors on already-stopped nodes
      }
      if (this.activeSourceNodes.size === 0) {
        this.nextPlayTime = 0;
        this.onPlaybackStateChange?.(false);
      }
    };

    sourceNode.start(startTime);
  }

  /**
   * High-priority Barge-In Flush (`control.barge_in`):
   * Immediately stops and disconnects all scheduled/playing `AudioBufferSourceNode`s
   * in `< 50ms` and resets `nextPlayTime = 0`.
   * Returns elapsed flush time in milliseconds.
   */
  public flushPlaybackQueue(): number {
    const startMs = performance.now();

    for (const node of this.activeSourceNodes) {
      try {
        node.onended = null;
        node.stop(0);
        node.disconnect();
      } catch {
        // Ignore errors if node already ended
      }
    }

    this.activeSourceNodes.clear();
    this.nextPlayTime = 0;
    this.setDucking(false);
    this.onPlaybackStateChange?.(false);

    return performance.now() - startMs;
  }

  /**
   * Applies or removes Local VAD audio ducking (`gain = 0.20` while candidate speech is detected).
   */
  public setDucking(ducked: boolean): void {
    this.ducked = ducked;
    if (!this.audioCtx || !this.gainNode) return;
    const targetGain = ducked ? DUCKING_GAIN_VALUE : NORMAL_GAIN_VALUE;
    const now = this.audioCtx.currentTime;
    const gainParam = this.gainNode.gain as AudioParam & {
      cancelScheduledValues?: (startTime: number) => void;
    };
    if (typeof gainParam.cancelScheduledValues === 'function') {
      gainParam.cancelScheduledValues(now);
    }
    gainParam.value = targetGain;
    if (typeof gainParam.setTargetAtTime === 'function') {
      gainParam.setTargetAtTime(targetGain, now, 0.015);
    }
  }

  public isDucked(): boolean {
    return this.ducked;
  }

  /**
   * Plays a short pleasant 24kHz harmonic chime to test candidate speaker output in the Lobby.
   */
  public playTestTone(durationMs = 650): void {
    const numSamples = Math.floor((DOWNSTREAM_SAMPLE_RATE * durationMs) / 1000);
    const pcm16 = new Int16Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const t = i / DOWNSTREAM_SAMPLE_RATE;
      const env = Math.sin((Math.PI * i) / numSamples);
      // C5 (523.25 Hz) -> E5 (659.25 Hz) -> G5 (783.99 Hz) arpeggio chime
      const freq = t < 0.2 ? 523.25 : t < 0.4 ? 659.25 : 783.99;
      const sample =
        (0.55 * Math.sin(2 * Math.PI * freq * t) +
          0.25 * Math.sin(2 * Math.PI * freq * 2 * t)) *
        env;
      pcm16[i] = Math.round(sample * 0x5fff);
    }

    this.enqueuePcmChunk(pcm16.buffer);
  }

  public async dispose(): Promise<void> {
    this.flushPlaybackQueue();
    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      await this.audioCtx.close();
    }
  }
}
