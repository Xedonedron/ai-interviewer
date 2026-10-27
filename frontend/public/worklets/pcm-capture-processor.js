/**
 * Contract 2: Upstream Capture Specification (`audio-pipeline-spec.md`)
 * AudioWorkletProcessor that downsamples native browser audio (e.g., 48kHz / 44.1kHz)
 * to 16,000 Hz Mono, quantizes Float32 -> Int16 Little-Endian (`PCM_S16LE`),
 * emits 40ms chunks (640 samples = 1,280 bytes), and tracks Local VAD RMS.
 */

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSampleRate = 16000;
    this.chunkSamples = 640; // 40ms @ 16,000 Hz = 640 samples = 1,280 bytes
    this.int16Buffer = new Int16Array(this.chunkSamples);
    this.bufferWriteIndex = 0;
    this.rmsSumSquares = 0;
    this.readCursor = 0;
    this.consecutiveVadFrames = 0;
    this.vadThreshold = 0.045;
    this.vadRequiredConsecutiveFrames = 5; // 5 * 40ms = 200ms
    this.muted = false;

    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.muted === 'boolean') {
        this.muted = event.data.muted;
      }
    };
  }

  /**
   * Quantize Float32 sample [-1.0, 1.0] to signed 16-bit integer [-32768, 32767]
   */
  quantizeSample(sample) {
    const clamped = Math.max(-1.0, Math.min(1.0, sample));
    return clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0 || this.muted) {
      return true;
    }

    const channelData = input[0];
    if (!channelData || channelData.length === 0) {
      return true;
    }

    const inputRate = typeof sampleRate === 'number' ? sampleRate : 48000;
    const ratio = inputRate / this.targetSampleRate;

    if (Math.abs(ratio - 1.0) < 0.001) {
      for (let i = 0; i < channelData.length; i++) {
        this.pushSample(channelData[i]);
      }
    } else {
      // Boxcar low-pass averaging + linear interpolation downsampler to 16kHz
      while (this.readCursor < channelData.length) {
        const startIdx = Math.floor(this.readCursor);
        const endIdx = Math.min(channelData.length, Math.ceil(this.readCursor + ratio));
        let sum = 0;
        let count = 0;
        for (let j = startIdx; j < endIdx; j++) {
          sum += channelData[j];
          count++;
        }
        const filteredSample = count > 0 ? sum / count : channelData[startIdx] || 0;
        this.pushSample(filteredSample);
        this.readCursor += ratio;
      }
      this.readCursor -= channelData.length;
    }

    return true;
  }

  pushSample(floatSample) {
    this.rmsSumSquares += floatSample * floatSample;
    this.int16Buffer[this.bufferWriteIndex++] = this.quantizeSample(floatSample);

    if (this.bufferWriteIndex >= this.chunkSamples) {
      const rms = Math.sqrt(this.rmsSumSquares / this.chunkSamples);
      if (rms > this.vadThreshold) {
        this.consecutiveVadFrames++;
      } else {
        this.consecutiveVadFrames = 0;
      }

      const outChunk = new Int16Array(this.int16Buffer);
      const vadTriggered = this.consecutiveVadFrames >= this.vadRequiredConsecutiveFrames;

      this.port.postMessage(
        {
          type: 'pcm_chunk',
          pcmBuffer: outChunk.buffer,
          rms,
          consecutiveVadFrames: this.consecutiveVadFrames,
          vadSpeechActive: vadTriggered,
        },
        [outChunk.buffer],
      );

      this.bufferWriteIndex = 0;
      this.rmsSumSquares = 0;
    }
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
