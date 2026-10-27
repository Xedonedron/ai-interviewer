/**
 * Contract 2: Upstream Capture Specification (`audio-pipeline-spec.md`)
 * Manages microphone acquisition (`getUserMedia` with strict echoCancellation),
 * `AudioWorkletNode` 16kHz `PCM_S16LE` 40ms chunking (1,280 bytes),
 * real-time RMS level metering, and Local VAD Audio Ducking.
 */

export const TARGET_CAPTURE_SAMPLE_RATE = 16000;
export const CHUNK_SAMPLES_40MS = 640; // 40ms @ 16kHz
export const CHUNK_BYTES_40MS = 1280; // 640 * 2 bytes (Int16LE)
export const LOCAL_VAD_RMS_THRESHOLD = 0.045;
export const LOCAL_VAD_CONSECUTIVE_FRAMES = 5; // 200ms (5 * 40ms)

export const DEFAULT_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: { ideal: 1 },
    sampleRate: { ideal: TARGET_CAPTURE_SAMPLE_RATE },
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
  },
  video: false,
};

/**
 * Pure function: Quantizes a single Float32 sample [-1.0, 1.0] into Int16 [-32768, 32767]
 * per Section 2.2 of `audio-pipeline-spec.md`.
 */
export function quantizeFloat32ToInt16Sample(s: number): number {
  const clamped = Math.max(-1.0, Math.min(1.0, s));
  return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
}

/**
 * Pure function: Converts an entire Float32Array into a Little-Endian Int16Array (`PCM_S16LE`).
 */
export function quantizeFloat32BufferToInt16(float32Samples: Float32Array): Int16Array {
  const int16 = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i++) {
    int16[i] = quantizeFloat32ToInt16Sample(float32Samples[i]);
  }
  return int16;
}

/**
 * Pure function: Downsamples a Float32Array from `inputSampleRate` (e.g., 48000 Hz)
 * to `targetSampleRate` (16000 Hz) using a boxcar low-pass filter.
 */
export function downsampleFloat32Buffer(
  input: Float32Array,
  inputSampleRate: number,
  targetSampleRate: number = TARGET_CAPTURE_SAMPLE_RATE,
): Float32Array {
  if (inputSampleRate === targetSampleRate) {
    return new Float32Array(input);
  }
  const ratio = inputSampleRate / targetSampleRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i++) {
    const startIdx = Math.floor(i * ratio);
    const endIdx = Math.min(input.length, Math.ceil((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = startIdx; j < endIdx; j++) {
      sum += input[j];
      count++;
    }
    output[i] = count > 0 ? sum / count : input[startIdx] ?? 0;
  }

  return output;
}

/**
 * Pure function: Computes RMS energy of a Float32 frame per Section 2.3 of `audio-pipeline-spec.md`:
 * RMS_mic = sqrt((1 / N) * sum(s_i^2))
 */
export function computeFrameRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Pure helper: Maps raw microphone RMS energy [0.0, 1.0] into a responsive UI percentage [0, 100].
 * Returns 0% during silence (below noise floor) and scales smoothly up to 100% during normal speech.
 */
export function mapRmsToMicLevelPct(rms: number): number {
  if (!Number.isFinite(rms) || rms < 0.004) {
    return 0;
  }
  const normalized = Math.min(1, Math.pow((rms - 0.004) / 0.16, 0.65));
  return Math.min(100, Math.max(0, Math.round(normalized * 100)));
}

export interface MicCaptureCallbacks {
  onPcmChunk?: (pcm16LeBuffer: ArrayBuffer, rms: number) => void;
  onRmsLevel?: (rms: number) => void;
  onLocalVadSpeechStart?: () => void;
  onDeviceStateChange?: (reason: 'device_disconnected' | 'device_restored') => void;
}

export class MicCaptureManager {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private silentGainNode: GainNode | null = null;
  private muted = false;
  private running = false;
  private consecutiveVadFrames = 0;
  private callbacks: MicCaptureCallbacks;

  constructor(callbacks: MicCaptureCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public setCallbacks(callbacks: MicCaptureCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  public async startCapture(deviceId?: string): Promise<void> {
    if (this.running) {
      await this.stopCapture();
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      throw new Error(
        'Akses mikrofon tidak tersedia (navigator.mediaDevices undefined). Gunakan HTTPS atau localhost.',
      );
    }

    const useSpecificDevice =
      deviceId && deviceId !== 'default' && deviceId !== 'external';

    const audioConstraints: MediaTrackConstraints = {
      ...(DEFAULT_MEDIA_CONSTRAINTS.audio as MediaTrackConstraints),
      ...(useSpecificDevice ? { deviceId: { ideal: deviceId } } : {}),
    };

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
    } catch {
      // Fallback without sampleRate constraint if OS/driver rejects ideal sampleRate
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          ...(useSpecificDevice ? { deviceId: { ideal: deviceId } } : {}),
        },
        video: false,
      });
    }

    const audioTrack = this.mediaStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.onended = () => {
        this.callbacks.onDeviceStateChange?.('device_disconnected');
      };
    }

    const AudioCtxCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    // Use native hardware sampleRate so createMediaStreamSource never throws a sampleRate mismatch error.
    // pcm-capture-processor.js automatically downsamples from sampleRate (e.g., 48000 Hz) to 16000 Hz PCM_S16LE.
    this.audioContext = new AudioCtxCtor();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    await this.audioContext.audioWorklet.addModule('/worklets/pcm-capture-processor.js');

    try {
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    } catch {
      // Fallback: if browser requires explicit sampleRate matching or fresh AudioContext
      if (this.audioContext.state !== 'closed') {
        await this.audioContext.close().catch(() => {});
      }
      this.audioContext = new AudioCtxCtor({ sampleRate: TARGET_CAPTURE_SAMPLE_RATE });
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      await this.audioContext.audioWorklet.addModule('/worklets/pcm-capture-processor.js');
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    }

    this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-capture-processor');

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || data.type !== 'pcm_chunk' || this.muted) {
        return;
      }

      const pcmBuffer: ArrayBuffer = data.pcmBuffer;
      const rms: number = data.rms ?? 0;

      this.callbacks.onRmsLevel?.(rms);
      this.callbacks.onPcmChunk?.(pcmBuffer, rms);

      if (rms > LOCAL_VAD_RMS_THRESHOLD) {
        this.consecutiveVadFrames++;
        if (this.consecutiveVadFrames === LOCAL_VAD_CONSECUTIVE_FRAMES) {
          this.callbacks.onLocalVadSpeechStart?.();
        }
      } else {
        this.consecutiveVadFrames = 0;
      }
    };

    // Connect AudioWorkletNode to destination via a silent GainNode (gain = 0)
    // so Chromium's audio rendering thread actively pulls process(inputs) frames without speaker echo.
    this.silentGainNode = this.audioContext.createGain();
    this.silentGainNode.gain.value = 0;

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.silentGainNode);
    this.silentGainNode.connect(this.audioContext.destination);
    this.running = true;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.consecutiveVadFrames = 0;
    if (muted) {
      this.callbacks.onRmsLevel?.(0);
    }
    if (this.workletNode) {
      this.workletNode.port.postMessage({ muted });
    }
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public async stopCapture(): Promise<void> {
    this.running = false;
    this.consecutiveVadFrames = 0;

    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.silentGainNode) {
      this.silentGainNode.disconnect();
      this.silentGainNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }
  }
}
