/**
 * Adaptive Quality Governor (`QualityGovernor.ts`)
 * Monitors real-time frame times (`requestAnimationFrame` delta) and dynamically adjusts
 * rendering resolution scale (`pixelRatio`) and anti-aliasing/shadow tiers to sustain 60 FPS
 * on diverse candidate hardware.
 */

export type QualityTier = 'TIER_1_ULTRA' | 'TIER_2_BALANCED' | 'TIER_3_PERFORMANCE';

export interface QualityMetrics {
  fps: number;
  frameTimeMs: number;
  tier: QualityTier;
  pixelRatio: number;
}

export class QualityGovernor {
  private frameTimesMs: number[] = [];
  private readonly maxSamples = 60;
  private currentTier: QualityTier = 'TIER_1_ULTRA';
  private lastTierChangeMs = 0;
  private readonly cooldownMs = 2500;
  private onTierChange?: (tier: QualityTier, pixelRatio: number) => void;

  constructor(onTierChange?: (tier: QualityTier, pixelRatio: number) => void) {
    this.onTierChange = onTierChange;
  }

  public recordFrame(deltaTimeSec: number, nowMs = performance.now()): QualityMetrics {
    const frameTimeMs = Math.max(1, deltaTimeSec * 1000);
    this.frameTimesMs.push(frameTimeMs);
    if (this.frameTimesMs.length > this.maxSamples) {
      this.frameTimesMs.shift();
    }

    const avgFrameTimeMs =
      this.frameTimesMs.reduce((acc, v) => acc + v, 0) / this.frameTimesMs.length;
    const fps = Math.min(120, Math.round(1000 / avgFrameTimeMs));

    if (
      this.frameTimesMs.length >= 30 &&
      nowMs - this.lastTierChangeMs > this.cooldownMs
    ) {
      if (fps < 36 && this.currentTier === 'TIER_1_ULTRA') {
        this.setTier('TIER_2_BALANCED', nowMs);
      } else if (fps < 28 && this.currentTier === 'TIER_2_BALANCED') {
        this.setTier('TIER_3_PERFORMANCE', nowMs);
      } else if (fps > 56 && this.currentTier === 'TIER_3_PERFORMANCE') {
        this.setTier('TIER_2_BALANCED', nowMs);
      } else if (fps > 58 && this.currentTier === 'TIER_2_BALANCED') {
        this.setTier('TIER_1_ULTRA', nowMs);
      }
    }

    return {
      fps,
      frameTimeMs: avgFrameTimeMs,
      tier: this.currentTier,
      pixelRatio: this.getRecommendedPixelRatio(),
    };
  }

  private setTier(tier: QualityTier, nowMs: number): void {
    this.currentTier = tier;
    this.lastTierChangeMs = nowMs;
    this.onTierChange?.(tier, this.getRecommendedPixelRatio());
  }

  public getRecommendedPixelRatio(): number {
    const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    switch (this.currentTier) {
      case 'TIER_1_ULTRA':
        return Math.min(deviceDpr, 2.0);
      case 'TIER_2_BALANCED':
        return Math.min(deviceDpr, 1.25);
      case 'TIER_3_PERFORMANCE':
        return 0.85;
    }
  }

  public getTier(): QualityTier {
    return this.currentTier;
  }
}
