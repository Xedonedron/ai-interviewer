/**
 * Contract 2 (Section 4) & Contract 3 (Section 3):
 * Real-Time `AnalyserNode` Formant Extraction + Asymmetric Exponential Viseme Smoothing
 * (`aa`, `ih`, `ou`, `ee`, `oh`) & Total Mouth Blendshape Budget Clamping (`<= 1.15`).
 */

export type VisemeKey = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';

export interface VisemeWeights {
  aa: number;
  ih: number;
  ou: number;
  ee: number;
  oh: number;
}

export const VISEME_KEYS: readonly VisemeKey[] = ['aa', 'ih', 'ou', 'ee', 'oh'] as const;
export const MAX_TOTAL_VISEME_BUDGET = 1.15;
export const ATTACK_RATE_LAMBDA = 28.0;
export const RELEASE_RATE_LAMBDA = 16.0;
export const FAST_INTERRUPT_LAMBDA = 55.0; // Ensures <80ms decay to ~0.0 on INTERRUPTED

export interface FormantBandEnergies {
  low: number; // ~187 Hz - 750 Hz (bins 2..8 @ 48kHz/512)
  mid: number; // ~750 Hz - 1,875 Hz (bins 8..20 @ 48kHz/512)
  high: number; // ~1,875 Hz - 3,750 Hz (bins 20..40 @ 48kHz/512)
  rms: number;
}

/**
 * Computes dynamic FFT bin index for a given frequency in Hz.
 */
export function freqToBinIndex(freqHz: number, sampleRate: number, fftSize: number): number {
  const maxBin = Math.floor(fftSize / 2) - 1;
  const bin = Math.round(freqHz / (sampleRate / fftSize));
  return Math.max(0, Math.min(maxBin, bin));
}

/**
 * Extracts normalized Low, Mid, and High formant band energies [0.0, 1.0] and time-domain RMS
 * from an `AnalyserNode` (or raw byte frequency & float time-domain arrays).
 */
export function extractFormantEnergiesFromBuffers(
  freqBytes: Uint8Array,
  timeDomainFloats: Float32Array,
  sampleRate = 48000,
  fftSize = 512,
): FormantBandEnergies {
  let sumSq = 0;
  for (let i = 0; i < timeDomainFloats.length; i++) {
    const s = timeDomainFloats[i];
    sumSq += s * s;
  }
  const rms = timeDomainFloats.length > 0 ? Math.sqrt(sumSq / timeDomainFloats.length) : 0;

  const lowStart = freqToBinIndex(187.5, sampleRate, fftSize);
  const lowEnd = freqToBinIndex(750, sampleRate, fftSize);
  const midStart = lowEnd;
  const midEnd = freqToBinIndex(1875, sampleRate, fftSize);
  const highStart = midEnd;
  const highEnd = freqToBinIndex(3750, sampleRate, fftSize);

  const avgBand = (start: number, end: number): number => {
    const s = Math.max(0, start);
    const e = Math.min(freqBytes.length - 1, Math.max(s, end));
    let sum = 0;
    let count = 0;
    for (let i = s; i <= e; i++) {
      sum += freqBytes[i];
      count++;
    }
    return count > 0 ? sum / (count * 255.0) : 0;
  };

  return {
    low: avgBand(lowStart, lowEnd),
    mid: avgBand(midStart, midEnd),
    high: avgBand(highStart, highEnd),
    rms,
  };
}

/**
 * Maps formant band energies (Low, Mid, High, RMS) into target unsmoothed viseme weights `[0.0, 1.0]`.
 * - Low band (350 Hz) -> `oh`, `ou`
 * - Mid band (1,100 Hz) -> `aa`, `ee`
 * - High band (2,400 Hz) -> `ih`, `ee`
 */
export function computeTargetVisemesFromFormants(energies: FormantBandEnergies): VisemeWeights {
  const { low, mid, high, rms } = energies;

  // Noise gate so silent background noise keeps mouth at 0.0
  if (rms < 0.008 && low < 0.04 && mid < 0.04 && high < 0.04) {
    return { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  }

  const amplitudeBoost = Math.min(1.35, 0.55 + rms * 3.2);

  const rawAa = Math.min(1.0, Math.max(0, (mid * 1.15 - high * 0.25) * amplitudeBoost));
  const rawOh = Math.min(1.0, Math.max(0, (low * 1.1 - mid * 0.2) * amplitudeBoost));
  const rawOu = Math.min(1.0, Math.max(0, (low * 0.85 - high * 0.35) * amplitudeBoost));
  const rawIh = Math.min(1.0, Math.max(0, (high * 1.25 - low * 0.2) * amplitudeBoost));
  const rawEe = Math.min(1.0, Math.max(0, (mid * 0.55 + high * 0.65 - low * 0.15) * amplitudeBoost));

  return {
    aa: rawAa,
    ih: rawIh,
    ou: rawOu,
    ee: rawEe,
    oh: rawOh,
  };
}

/**
 * Enforces the Total Mouth Blendshape Budget Normalization (`S <= 1.15`)
 * per Section 3.3 of `vrm-avatar-states.md`.
 */
export function clampVisemeBudget(
  weights: VisemeWeights,
  maxBudget: number = MAX_TOTAL_VISEME_BUDGET,
): VisemeWeights {
  const clampedIndividual: VisemeWeights = {
    aa: Math.max(0, Math.min(1, weights.aa)),
    ih: Math.max(0, Math.min(1, weights.ih)),
    ou: Math.max(0, Math.min(1, weights.ou)),
    ee: Math.max(0, Math.min(1, weights.ee)),
    oh: Math.max(0, Math.min(1, weights.oh)),
  };

  const sum =
    clampedIndividual.aa +
    clampedIndividual.ih +
    clampedIndividual.ou +
    clampedIndividual.ee +
    clampedIndividual.oh;

  if (sum <= maxBudget || sum === 0) {
    return clampedIndividual;
  }

  const scale = maxBudget / sum;
  return {
    aa: clampedIndividual.aa * scale,
    ih: clampedIndividual.ih * scale,
    ou: clampedIndividual.ou * scale,
    ee: clampedIndividual.ee * scale,
    oh: clampedIndividual.oh * scale,
  };
}

/**
 * Pure function: Performs one frame of frame-rate independent asymmetric exponential smoothing
 * and applies the `<= 1.15` total mouth budget normalization.
 *
 * Formula (`vrm-avatar-states.md` Section 3):
 *   alpha_attack = 1 - exp(-28.0 * dt)
 *   alpha_release = 1 - exp(-16.0 * dt)
 *   v_k(t) = v_k(t-1) + (w_k_target - v_k(t-1)) * alpha_k
 */
export function stepVisemeSmoothing(
  previous: VisemeWeights,
  target: VisemeWeights,
  deltaTimeSec: number,
  fastReset = false,
): VisemeWeights {
  const dt = Math.max(0.0001, Math.min(0.1, deltaTimeSec));
  const alphaAttack = 1 - Math.exp(-ATTACK_RATE_LAMBDA * dt);
  const releaseLambda = fastReset ? FAST_INTERRUPT_LAMBDA : RELEASE_RATE_LAMBDA;
  const alphaRelease = 1 - Math.exp(-releaseLambda * dt);

  const next: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

  for (const key of VISEME_KEYS) {
    const prevVal = previous[key];
    const targetVal = fastReset ? 0 : target[key];
    const alpha = targetVal > prevVal ? alphaAttack : alphaRelease;
    const rawNext = prevVal + (targetVal - prevVal) * alpha;
    next[key] = rawNext < 0.001 ? 0 : rawNext;
  }

  return clampVisemeBudget(next, MAX_TOTAL_VISEME_BUDGET);
}

export class VrmLipSyncController {
  private currentWeights: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  private freqBuffer: Uint8Array = new Uint8Array(256);
  private timeBuffer: Float32Array = new Float32Array(512);
  private lastRms = 0;

  public updateFromAnalyser(
    analyser: AnalyserNode | null,
    sampleRate: number,
    deltaTimeSec: number,
    activeSpeaking: boolean,
    fastInterruptReset = false,
  ): VisemeWeights {
    if (!analyser || (!activeSpeaking && !fastInterruptReset)) {
      const zeroTarget: VisemeWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
      this.lastRms = 0;
      this.currentWeights = stepVisemeSmoothing(
        this.currentWeights,
        zeroTarget,
        deltaTimeSec,
        fastInterruptReset,
      );
      return this.currentWeights;
    }

    if (this.freqBuffer.length !== analyser.frequencyBinCount) {
      this.freqBuffer = new Uint8Array(analyser.frequencyBinCount);
    }
    if (this.timeBuffer.length !== analyser.fftSize) {
      this.timeBuffer = new Float32Array(analyser.fftSize);
    }

    analyser.getByteFrequencyData(this.freqBuffer as Uint8Array<ArrayBuffer>);
    analyser.getFloatTimeDomainData(this.timeBuffer as Float32Array<ArrayBuffer>);

    const energies = extractFormantEnergiesFromBuffers(
      this.freqBuffer,
      this.timeBuffer,
      sampleRate,
      analyser.fftSize,
    );
    this.lastRms = energies.rms;

    const target = activeSpeaking
      ? computeTargetVisemesFromFormants(energies)
      : { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };

    this.currentWeights = stepVisemeSmoothing(
      this.currentWeights,
      target,
      deltaTimeSec,
      fastInterruptReset,
    );

    return this.currentWeights;
  }

  public forceZero(): void {
    this.currentWeights = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
    this.lastRms = 0;
  }

  public getCurrentWeights(): VisemeWeights {
    return { ...this.currentWeights };
  }

  public getLastRms(): number {
    return this.lastRms;
  }
}
