/**
 * Contract 3: 3D VRM Avatar States, Blendshapes & Procedural Animation (`vrm-avatar-states.md`)
 * Implements the 5-state machine (`IDLE`, `LISTENING`, `THINKING`, `SPEAKING`, `INTERRUPTED`),
 * emotion blendshape presets (`neutral`, `happy` capped at 0.35 during speech, `relaxed`, `serious`, `surprised`),
 * Auto-Blink state machine (2.5s - 5.8s interval, 150ms cycle: 60ms close, 20ms hold, 70ms open,
 * reduced by `happyWeight * 0.4`), chest breathing, head micro-sway, active listening nod,
 * thoughtful tilt, speech rhythm head motion, and interrupted micro-recoil.
 */

import type { AvatarEmotion, AvatarStateId } from '../../types/api.types';

export interface BoneEulerRotation {
  x: number;
  y: number;
  z: number;
}

export interface ProceduralPoseOutput {
  state: AvatarStateId;
  emotion: AvatarEmotion;
  expressions: {
    neutral: number;
    happy: number;
    relaxed: number;
    angry: number;
    sad: number;
    surprised: number;
    blink: number;
  };
  chestRotation: BoneEulerRotation;
  headRotation: BoneEulerRotation;
  eyeGazeOffset: { yaw: number; pitch: number };
}

export const BLINK_MIN_INTERVAL_SEC = 2.5;
export const BLINK_MAX_INTERVAL_SEC = 5.8;
export const BLINK_CLOSE_SEC = 0.060; // 60ms closing
export const BLINK_HOLD_SEC = 0.020; // 20ms closed
export const BLINK_OPEN_SEC = 0.070; // 70ms opening
export const BLINK_TOTAL_DURATION_SEC = BLINK_CLOSE_SEC + BLINK_HOLD_SEC + BLINK_OPEN_SEC; // 150ms (0.15s)

/**
 * Computes raw blink weight [0.0, 1.0] within a 150ms blink cycle (`60ms` close, `20ms` hold, `70ms` open),
 * and scales down maximum blink by `happyWeight * 0.4` to avoid eyelid mesh clipping.
 */
export function computeBlinkWeight(
  blinkElapsedSec: number,
  happyWeight: number,
): number {
  if (blinkElapsedSec < 0 || blinkElapsedSec >= BLINK_TOTAL_DURATION_SEC) {
    return 0;
  }

  let rawBlink = 0;
  if (blinkElapsedSec < BLINK_CLOSE_SEC) {
    rawBlink = blinkElapsedSec / BLINK_CLOSE_SEC;
  } else if (blinkElapsedSec < BLINK_CLOSE_SEC + BLINK_HOLD_SEC) {
    rawBlink = 1.0;
  } else {
    const openProgress =
      (blinkElapsedSec - (BLINK_CLOSE_SEC + BLINK_HOLD_SEC)) / BLINK_OPEN_SEC;
    rawBlink = Math.max(0, 1.0 - openProgress);
  }

  const maxAllowedBlink = Math.max(0, 1.0 - Math.max(0, Math.min(1, happyWeight)) * 0.4);
  return Math.min(maxAllowedBlink, rawBlink * maxAllowedBlink);
}

export class VrmProceduralAnimator {
  private state: AvatarStateId = 'IDLE';
  private emotion: AvatarEmotion = 'neutral';
  private elapsedSec = 0;
  private stateElapsedSec = 0;

  // Auto-blink state
  private nextBlinkWaitSec = 3.4;
  private blinkTimerSec = 0;
  private isBlinking = false;
  private blinkCycleElapsedSec = 0;

  // Active listening nod state (every 3.2 - 5.5s, duration 420ms)
  private nextNodWaitSec = 3.8;
  private nodTimerSec = 0;
  private isNodding = false;
  private nodElapsedSec = 0;
  private readonly nodDurationSec = 0.420;

  // Smoothed head rotation Z for thoughtful tilt
  private currentHeadTiltZ = 0;

  // Smoothed bone rotations to eliminate sudden pose snapping between states/nods/recoils
  private currentHeadX = 0;
  private currentHeadY = 0;
  private currentHeadZ = 0;
  private currentChestX = 0;
  private currentChestY = 0;
  private currentChestZ = 0;
  private smoothedSpeechRms = 0;

  // Current smoothed expressions
  private expressions = {
    neutral: 1.0,
    happy: 0.0,
    relaxed: 0.15,
    angry: 0.0,
    sad: 0.0,
    surprised: 0.0,
  };

  private randomFn: () => number;

  constructor(randomFn: () => number = Math.random) {
    this.randomFn = randomFn;
    this.scheduleNextBlink();
    this.scheduleNextNod();
  }

  private scheduleNextBlink(): void {
    this.nextBlinkWaitSec =
      BLINK_MIN_INTERVAL_SEC +
      this.randomFn() * (BLINK_MAX_INTERVAL_SEC - BLINK_MIN_INTERVAL_SEC);
    this.blinkTimerSec = 0;
  }

  private scheduleNextNod(): void {
    this.nextNodWaitSec = 3.2 + this.randomFn() * (5.5 - 3.2);
    this.nodTimerSec = 0;
  }

  public setState(newState: AvatarStateId, emotion?: AvatarEmotion): void {
    if (this.state !== newState) {
      this.state = newState;
      this.stateElapsedSec = 0;
      if (newState === 'LISTENING') {
        this.scheduleNextNod();
      }
    }
    if (emotion) {
      this.emotion = emotion;
    }
  }

  public setEmotion(emotion: AvatarEmotion): void {
    this.emotion = emotion;
  }

  public getState(): AvatarStateId {
    return this.state;
  }

  public getEmotion(): AvatarEmotion {
    return this.emotion;
  }

  public isVisemeActive(): boolean {
    return this.state === 'SPEAKING';
  }

  /**
   * Advances procedural animations by `deltaTimeSec` and returns bone rotations & expression weights.
   */
  public update(
    deltaTimeSec: number,
    speechRms = 0,
    candidateVoiceActive = true,
  ): ProceduralPoseOutput {
    const dt = Math.max(0.0001, Math.min(0.1, deltaTimeSec));
    this.elapsedSec += dt;
    this.stateElapsedSec += dt;
    const t = this.elapsedSec;

    // 1. Handle automatic transition from INTERRUPTED -> LISTENING after 150ms
    if (this.state === 'INTERRUPTED' && this.stateElapsedSec >= 0.150) {
      this.state = 'LISTENING';
      this.stateElapsedSec = 0;
      if (this.emotion === 'surprised') {
        this.emotion = 'neutral';
      }
    }

    // 2. Determine target emotion blendshapes per state & emotion preset
    const targetExp = {
      neutral: 0.0,
      happy: 0.0,
      relaxed: 0.0,
      angry: 0.0,
      sad: 0.0,
      surprised: 0.0,
    };

    switch (this.state) {
      case 'IDLE':
        targetExp.neutral = 1.0;
        targetExp.relaxed = 0.15;
        break;
      case 'LISTENING':
        targetExp.relaxed = 0.35;
        targetExp.happy = 0.15;
        targetExp.neutral = 0.50;
        break;
      case 'THINKING':
        targetExp.neutral = 0.85;
        targetExp.relaxed = 0.10;
        break;
      case 'SPEAKING':
        targetExp.neutral = this.emotion === 'neutral' ? 0.75 : 0.40;
        if (this.emotion === 'happy') {
          targetExp.happy = 0.30; // Capped <= 0.35 while speaking
        } else if (this.emotion === 'relaxed') {
          targetExp.relaxed = 0.30;
        } else if (this.emotion === 'serious') {
          targetExp.angry = 0.12;
          targetExp.neutral = 0.85;
        } else if (this.emotion === 'surprised') {
          targetExp.surprised = 0.20;
        }
        break;
      case 'INTERRUPTED':
        targetExp.surprised = 0.20;
        targetExp.neutral = 0.50;
        break;
    }

    // Apply explicit emotion overrides when not speaking
    if (this.state !== 'SPEAKING' && this.state !== 'INTERRUPTED') {
      if (this.emotion === 'happy') {
        targetExp.happy = Math.max(targetExp.happy, 0.35);
      } else if (this.emotion === 'serious') {
        targetExp.angry = 0.15;
        targetExp.happy = 0.0;
      } else if (this.emotion === 'surprised') {
        targetExp.surprised = 0.22;
      } else if (this.emotion === 'relaxed') {
        targetExp.relaxed = Math.max(targetExp.relaxed, 0.40);
      }
    }

    // Enforce strict cap on happy <= 0.35 during SPEAKING (`vrm-avatar-states.md` Section 1.3)
    if (this.state === 'SPEAKING') {
      targetExp.happy = Math.min(0.35, targetExp.happy);
    }

    const expLerp = 1 - Math.exp(-10.0 * dt);
    this.expressions.neutral += (targetExp.neutral - this.expressions.neutral) * expLerp;
    this.expressions.happy += (targetExp.happy - this.expressions.happy) * expLerp;
    this.expressions.relaxed += (targetExp.relaxed - this.expressions.relaxed) * expLerp;
    this.expressions.angry += (targetExp.angry - this.expressions.angry) * expLerp;
    this.expressions.sad += (targetExp.sad - this.expressions.sad) * expLerp;
    this.expressions.surprised += (targetExp.surprised - this.expressions.surprised) * expLerp;

    // 3. Auto-Blink State Machine
    let blinkWeight = 0;
    if (this.isBlinking) {
      this.blinkCycleElapsedSec += dt;
      if (this.blinkCycleElapsedSec >= BLINK_TOTAL_DURATION_SEC) {
        this.isBlinking = false;
        this.blinkCycleElapsedSec = 0;
        this.scheduleNextBlink();
      } else {
        blinkWeight = computeBlinkWeight(this.blinkCycleElapsedSec, this.expressions.happy);
      }
    } else {
      this.blinkTimerSec += dt;
      if (this.blinkTimerSec >= this.nextBlinkWaitSec) {
        this.isBlinking = true;
        this.blinkCycleElapsedSec = 0;
      }
    }

    // 4. Procedural Bone Rotations (Chest & Head)
    // Base Breathing & Micro Sway (`vrm-avatar-states.md` Section 2) with continuous exponential smoothing
    const rmsLerp = 1 - Math.exp(-12.0 * dt);
    this.smoothedSpeechRms += (speechRms - this.smoothedSpeechRms) * rmsLerp;

    const targetChestX = Math.sin(t * 1.5) * 0.014 + (this.state === 'SPEAKING' ? Math.sin(t * 3.1) * 0.005 : 0);
    const targetChestY = Math.sin(t * 0.45) * 0.008;
    const targetChestZ = Math.cos(t * 0.55) * 0.006;

    let targetHeadX = Math.sin(t * 1.5 - 0.4) * 0.008;
    let targetHeadY = Math.sin(t * 0.65) * 0.022 + Math.cos(t * 0.35) * 0.010;
    const baseSwayZ = Math.cos(t * 0.5) * 0.014;

    // Thoughtful Tilt in THINKING state (`head.rotation.z` lerps to +0.045 rad)
    const targetTiltZ = this.state === 'THINKING' ? 0.045 : 0;
    this.currentHeadTiltZ += (targetTiltZ - this.currentHeadTiltZ) * (1 - Math.exp(-6.0 * dt));
    const targetHeadZ = baseSwayZ + this.currentHeadTiltZ;

    // Active Listening Nod in LISTENING state:
    // Allow an already-started nod cycle to finish its 420ms sine curve smoothly even if candidateVoiceActive dips briefly
    if (this.isNodding) {
      this.nodElapsedSec += dt;
      if (this.nodElapsedSec >= this.nodDurationSec) {
        this.isNodding = false;
        this.nodElapsedSec = 0;
        this.scheduleNextNod();
      } else {
        const nodPhase = this.nodElapsedSec / this.nodDurationSec;
        targetHeadX += Math.sin(nodPhase * Math.PI) * 0.055;
      }
    } else if (this.state === 'LISTENING' && candidateVoiceActive) {
      this.nodTimerSec += dt;
      if (this.nodTimerSec >= this.nextNodWaitSec) {
        this.isNodding = true;
        this.nodElapsedSec = 0;
      }
    } else if (this.state !== 'LISTENING') {
      this.nodTimerSec = 0;
    }

    // Speech Rhythm Head Motion in SPEAKING state (smooth multi-frequency conversational cadence)
    if (this.state === 'SPEAKING') {
      const activeMod = Math.min(1.0, 0.35 + this.smoothedSpeechRms * 2.2);
      targetHeadX += activeMod * (Math.sin(t * 4.2) * 0.018 + Math.cos(t * 2.3) * 0.010);
      targetHeadY += activeMod * Math.sin(t * 1.9) * 0.015;
    }

    // Micro Recoil in INTERRUPTED state (`head.rotation.x -= 0.025` for 120ms)
    if (this.state === 'INTERRUPTED' && this.stateElapsedSec <= 0.120) {
      targetHeadX -= 0.025;
    }

    // Exponentially damp all bone rotations so transitions between states/nods/recoils never snap or jitter
    const boneLerp = 1 - Math.exp(-10.0 * dt);
    this.currentChestX += (targetChestX - this.currentChestX) * boneLerp;
    this.currentChestY += (targetChestY - this.currentChestY) * boneLerp;
    this.currentChestZ += (targetChestZ - this.currentChestZ) * boneLerp;
    this.currentHeadX += (targetHeadX - this.currentHeadX) * boneLerp;
    this.currentHeadY += (targetHeadY - this.currentHeadY) * boneLerp;
    this.currentHeadZ += (targetHeadZ - this.currentHeadZ) * boneLerp;

    const chestRotation: BoneEulerRotation = {
      x: this.currentChestX,
      y: this.currentChestY,
      z: this.currentChestZ,
    };

    // Eye Gaze Offset in THINKING state (shifts up-sideways for 350ms before returning to camera)
    const eyeGazeOffset = { yaw: 0, pitch: 0 };
    if (this.state === 'THINKING' && this.stateElapsedSec <= 0.350) {
      eyeGazeOffset.yaw = 0.08;
      eyeGazeOffset.pitch = 0.06;
    }

    return {
      state: this.state,
      emotion: this.emotion,
      expressions: {
        ...this.expressions,
        blink: blinkWeight,
      },
      chestRotation,
      headRotation: {
        x: this.currentHeadX,
        y: this.currentHeadY,
        z: this.currentHeadZ,
      },
      eyeGazeOffset,
    };
  }
}
