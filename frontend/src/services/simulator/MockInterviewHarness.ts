/**
 * Standalone Simulator & Synthetic 24kHz Voice Formant Generator (`MockInterviewHarness.ts`)
 * Implements the Phase 2 Standalone Validation Harness (`ARCHITECTURE_AND_WORKFLOW.md` Section 3):
 * 1. Synthetic 24kHz `PCM_S16LE` Formant Signal Generator (`350 Hz` -> `oh/ou`, `1,100 Hz` -> `aa`,
 *    `2,400 Hz` -> `ih/ee` with syllable amplitude envelopes) so `PcmStreamPlayer` + `AnalyserNode`
 *    + `VrmLipSync` animate the 3D VRM mouth authentically at 60 FPS without a backend.
 * 2. Interactive event triggers for all WebSocket contract messages (`session.ready`, `avatar.state`,
 *    `control.barge_in`, `transcript.delta`, `session.stage_change`, `server.pong`, `session.completed`,
 *    and simulated network drop + auto-reconnect).
 */

import type {
  AvatarEmotion,
  AvatarStateId,
  InterviewStageId,
} from '../../types/api.types';
import type { ServerToClientControlFrame } from '../../types/ws.types';
import { DEFAULT_INTERVIEW_STAGES } from './mockFixtures';

export const SYNTH_SAMPLE_RATE = 24000;

export interface SyntheticSyllableSpec {
  vowel: 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
  durationMs: number;
}

/**
 * Generates a 24,000 Hz `PCM_S16LE` ArrayBuffer containing formant-modulated harmonic speech
 * designed to excite the exact FFT frequency bands in `audio-pipeline-spec.md`:
 * - Low FormantBand (~187 - 750 Hz, center 350 Hz) -> drives `oh`, `ou`
 * - Mid FormantBand (~750 - 1,875 Hz, center 1,100 Hz) -> drives `aa`, `ee`
 * - High FormantBand (~1,875 - 3,750 Hz, center 2,400 Hz) -> drives `ih`, `ee`
 */
export function generateSyntheticFormantPcm24k(
  durationMs = 160,
  vowel: 'aa' | 'ih' | 'ou' | 'ee' | 'oh' = 'aa',
  phaseOffsetRad = 0,
): ArrayBuffer {
  const numSamples = Math.max(1, Math.floor((SYNTH_SAMPLE_RATE * durationMs) / 1000));
  const pcm16 = new Int16Array(numSamples);

  // Formant energy weights per vowel
  let lowAmp = 0.2;
  let midAmp = 0.2;
  let highAmp = 0.2;

  switch (vowel) {
    case 'aa':
      lowAmp = 0.25;
      midAmp = 0.90; // Strong 1,100 Hz mid band
      highAmp = 0.15;
      break;
    case 'oh':
      lowAmp = 0.92; // Strong 350 Hz low band
      midAmp = 0.30;
      highAmp = 0.08;
      break;
    case 'ou':
      lowAmp = 0.85; // Strong 320 Hz low band
      midAmp = 0.12;
      highAmp = 0.05;
      break;
    case 'ih':
      lowAmp = 0.12;
      midAmp = 0.22;
      highAmp = 0.92; // Strong 2,400 Hz high band
      break;
    case 'ee':
      lowAmp = 0.15;
      midAmp = 0.58; // Balanced mid + high band
      highAmp = 0.72;
      break;
  }

  const fLow = 350;
  const fMid = 1100;
  const fHigh = 2400;
  const fPitch = 195; // Natural female voice fundamental pitch (Alya)

  for (let i = 0; i < numSamples; i++) {
    const t = i / SYNTH_SAMPLE_RATE;
    // Smooth syllable envelope (raised sine window)
    const syllableEnv = 0.25 + 0.75 * Math.sin((Math.PI * i) / numSamples);

    const fundamental = 0.18 * Math.sin(2 * Math.PI * fPitch * t + phaseOffsetRad);
    const formantLow = lowAmp * Math.sin(2 * Math.PI * fLow * t + phaseOffsetRad * 0.7);
    const formantMid = midAmp * Math.sin(2 * Math.PI * fMid * t + phaseOffsetRad * 1.3);
    const formantHigh = highAmp * Math.sin(2 * Math.PI * fHigh * t + phaseOffsetRad * 1.9);

    const composite = (fundamental + formantLow + formantMid + formantHigh) * 0.45 * syllableEnv;
    const clamped = Math.max(-1.0, Math.min(1.0, composite));
    pcm16[i] = clamped < 0 ? Math.round(clamped * 0x8000) : Math.round(clamped * 0x7fff);
  }

  return pcm16.buffer;
}

const STAGE_AI_PROMPTS: Record<InterviewStageId, string> = {
  STAGE_1_INTRO:
    'Halo Nixon! Selamat datang di sesi wawancara interaktif Smartnet Magna Global untuk posisi Data Platform & AI Systems Engineer. Saya Alya, pewawancara AI Anda hari ini. Boleh perkenalkan diri Anda secara singkat?',
  STAGE_2_CV_PROBE:
    'Terima kasih atas perkenalannya! Berdasarkan CV Anda, Anda merancang pipeline streaming Pub/Sub dan Dataflow ke BigQuery Medallion yang memangkas latensi analitik hingga 98%. Bisa ceritakan arsitektur dan tantangan teknisnya menggunakan kerangka STAR?',
  STAGE_3_TECHNICAL:
    'Sangat menarik. Sekarang kita masuk ke tahap asesmen kompetensi teknis. Pada proyek AI Intelligence Platform (MOIP) dan integrasi Google ADK, bagaimana Anda merancang pipeline RAG asinkron dengan Celery/Redis dan ChromaDB agar siklus riset KYC turun menjadi di bawah 5 menit?',
  STAGE_4_QNA:
    'Jawaban teknis yang sangat komprehensif. Sebelum kita menutup sesi ini, apakah ada pertanyaan dari Anda mengenai arsitektur Data Platform atau roadmap Applied AI di tim kami?',
  STAGE_5_CLOSING:
    'Terima kasih banyak atas waktu dan diskusi yang luar biasa hari ini! Hasil evaluasi kompetensi Anda akan segera diproses. Semoga sukses dan sampai jumpa!',
};

const VOWEL_CYCLE: readonly ('aa' | 'oh' | 'ee' | 'ih' | 'ou')[] = [
  'aa',
  'oh',
  'ee',
  'ih',
  'aa',
  'ou',
  'ee',
  'oh',
];

export interface MockHarnessListeners {
  onControlFrame: (frame: ServerToClientControlFrame) => void;
  onBinaryPcmFrame: (pcm24kBuffer: ArrayBuffer) => void;
  onConnectionStateChange?: (connected: boolean, reconnecting: boolean) => void;
}

export class MockInterviewHarness {
  private sessionId: string;
  private listeners: MockHarnessListeners;
  private currentStageIndex = 0;
  private turnSeq = 0;
  private currentTurnId = 'turn_001';
  private avatarState: AvatarStateId = 'IDLE';
  private avatarEmotion: AvatarEmotion = 'neutral';
  private remainingSeconds = 1800;
  private speakingTimerIds: ReturnType<typeof setTimeout>[] = [];
  private active = false;

  constructor(sessionId: string, listeners: MockHarnessListeners) {
    this.sessionId = sessionId;
    this.listeners = listeners;
  }

  public start(resumeFromTurnSeq = 0): void {
    this.active = true;
    this.turnSeq = resumeFromTurnSeq;
    const stageInfo = DEFAULT_INTERVIEW_STAGES[this.currentStageIndex];

    this.listeners.onConnectionStateChange?.(true, false);
    this.listeners.onControlFrame({
      type: 'session.ready',
      session_id: this.sessionId,
      current_stage: stageInfo.stage_id,
      stage_label: stageInfo.stage_label,
      remaining_seconds: this.remainingSeconds,
      resumed: resumeFromTurnSeq > 0,
    });

    // Automatically trigger greeting after 400ms on initial connection
    if (resumeFromTurnSeq === 0) {
      const greetingTimer = setTimeout(() => {
        if (this.active) {
          this.triggerAiSpeaking();
        }
      }, 400);
      this.speakingTimerIds.push(greetingTimer);
    }
  }

  public clearScheduledSpeech(): void {
    for (const id of this.speakingTimerIds) {
      clearTimeout(id);
    }
    this.speakingTimerIds = [];
  }

  /**
   * Simulates a multi-chunk 24kHz PCM voice stream + streaming `transcript.delta` updates
   * and automatic `avatar.state` transitions (`THINKING` -> `SPEAKING` -> `LISTENING`).
   */
  public triggerAiSpeaking(customText?: string, emotion: AvatarEmotion = 'happy'): void {
    if (!this.active) return;
    this.clearScheduledSpeech();

    this.turnSeq += 1;
    const turnId = `turn_${String(this.turnSeq).padStart(3, '0')}`;
    this.currentTurnId = turnId;
    const stageInfo = DEFAULT_INTERVIEW_STAGES[this.currentStageIndex];
    const fullText = customText ?? STAGE_AI_PROMPTS[stageInfo.stage_id];
    const words = fullText.split(' ');

    // Step 1: Enter SPEAKING state immediately
    this.setAvatarState('SPEAKING', emotion, turnId);

    const totalChunks = Math.max(8, Math.min(20, words.length));
    const chunkDurationMs = 160;

    for (let i = 0; i < totalChunks; i++) {
      const timerId = setTimeout(() => {
        if (!this.active || this.avatarState !== 'SPEAKING') return;

        // 1. Emit 24kHz Formant PCM Binary Chunk
        const vowel = VOWEL_CYCLE[i % VOWEL_CYCLE.length];
        const pcmBuffer = generateSyntheticFormantPcm24k(chunkDurationMs, vowel, i * 0.9);
        this.listeners.onBinaryPcmFrame(pcmBuffer);

        // 2. Emit progressive `transcript.delta`
        const wordSliceEnd = Math.ceil(((i + 1) / totalChunks) * words.length);
        const partialText = words.slice(0, wordSliceEnd).join(' ');
        const isFinal = i === totalChunks - 1;

        this.listeners.onControlFrame({
          type: 'transcript.delta',
          turn_id: turnId,
          turn_seq: this.turnSeq,
          speaker: 'AI',
          text: partialText,
          is_final: isFinal,
          stage: stageInfo.stage_id,
          timestamp_ms: Date.now(),
        });
      }, i * 145);

      this.speakingTimerIds.push(timerId);
    }

    // Transition back to LISTENING once speech completes
    const endTimerId = setTimeout(() => {
      if (this.active && this.avatarState === 'SPEAKING') {
        this.setAvatarState('LISTENING', 'relaxed', turnId);
      }
    }, totalChunks * 145 + 320);

    this.speakingTimerIds.push(endTimerId);
  }

  /**
   * Simulates candidate speech turn followed by AI thinking & responding.
   */
  public triggerSimulatedCandidateTurn(candidateText?: string): void {
    if (!this.active) return;
    this.turnSeq += 1;
    const turnId = `turn_${String(this.turnSeq).padStart(3, '0')}`;
    const stageInfo = DEFAULT_INTERVIEW_STAGES[this.currentStageIndex];
    const text =
      candidateText ??
      'Saya merancang WebSocket relay non-blocking dengan Python FastAPI, uvloop, dan pemisahan antrean PostgreSQL secara asinkron.';

    this.setAvatarState('LISTENING', 'relaxed', turnId);

    this.listeners.onControlFrame({
      type: 'transcript.delta',
      turn_id: turnId,
      turn_seq: this.turnSeq,
      speaker: 'CANDIDATE',
      text,
      is_final: true,
      stage: stageInfo.stage_id,
      timestamp_ms: Date.now(),
    });

    const thinkTimer = setTimeout(() => {
      if (!this.active) return;
      this.setAvatarState('THINKING', 'neutral', turnId);
    }, 250);

    const replyTimer = setTimeout(() => {
      if (!this.active) return;
      this.triggerAiSpeaking(
        'Pendekatan yang sangat solid! Memisahkan jalur audio dari query database memang kunci menjaga latensi di bawah 1.5 detik.',
        'happy',
      );
    }, 950);

    this.speakingTimerIds.push(thinkTimer, replyTimer);
  }

  /**
   * High-Priority Barge-In Trigger (`control.barge_in`):
   * Cancels any ongoing AI speech stream and dispatches `control.barge_in` + `INTERRUPTED` state.
   */
  public triggerBargeIn(reason = 'candidate_speech_detected'): void {
    this.clearScheduledSpeech();
    const now = Date.now();

    this.listeners.onControlFrame({
      type: 'control.barge_in',
      interrupted_turn_id: this.currentTurnId,
      reason,
      timestamp_ms: now,
    });

    this.setAvatarState('INTERRUPTED', 'surprised', this.currentTurnId);
  }

  public setAvatarState(
    state: AvatarStateId,
    emotion: AvatarEmotion = this.avatarEmotion,
    turnId = this.currentTurnId,
  ): void {
    this.avatarState = state;
    this.avatarEmotion = emotion;
    this.listeners.onControlFrame({
      type: 'avatar.state',
      state,
      emotion,
      turn_id: turnId,
      timestamp_ms: Date.now(),
    });
  }

  public cycleAvatarState(): AvatarStateId {
    const order: AvatarStateId[] = [
      'IDLE',
      'LISTENING',
      'THINKING',
      'SPEAKING',
      'INTERRUPTED',
    ];
    const nextIdx = (order.indexOf(this.avatarState) + 1) % order.length;
    const nextState = order[nextIdx];
    this.setAvatarState(nextState, this.avatarEmotion);
    return nextState;
  }

  public cycleAvatarEmotion(): AvatarEmotion {
    const emotions: AvatarEmotion[] = [
      'neutral',
      'happy',
      'serious',
      'relaxed',
      'surprised',
    ];
    const nextIdx = (emotions.indexOf(this.avatarEmotion) + 1) % emotions.length;
    const nextEmotion = emotions[nextIdx];
    this.setAvatarState(this.avatarState, nextEmotion);
    return nextEmotion;
  }

  public advanceStage(): InterviewStageId {
    const prevStage = DEFAULT_INTERVIEW_STAGES[this.currentStageIndex];
    this.currentStageIndex =
      (this.currentStageIndex + 1) % DEFAULT_INTERVIEW_STAGES.length;
    const nextStage = DEFAULT_INTERVIEW_STAGES[this.currentStageIndex];
    this.remainingSeconds = Math.max(180, this.remainingSeconds - 300);

    this.listeners.onControlFrame({
      type: 'session.stage_change',
      previous_stage: prevStage.stage_id,
      stage: nextStage.stage_id,
      stage_label: nextStage.stage_label,
      remaining_seconds: this.remainingSeconds,
    });

    this.triggerAiSpeaking(STAGE_AI_PROMPTS[nextStage.stage_id], 'neutral');
    return nextStage.stage_id;
  }

  public simulateNetworkReconnect(): void {
    this.clearScheduledSpeech();
    this.listeners.onConnectionStateChange?.(false, true);
    this.listeners.onControlFrame({
      type: 'session.error',
      code: 'GEMINI_UPSTREAM_TIMEOUT',
      message: 'Simulasi gangguan jaringan: melakukan auto-reconnect dengan Session Resumption...',
      recoverable: true,
    });

    const reconnectTimer = setTimeout(() => {
      if (!this.active) return;
      const stageInfo = DEFAULT_INTERVIEW_STAGES[this.currentStageIndex];
      this.listeners.onConnectionStateChange?.(true, false);
      this.listeners.onControlFrame({
        type: 'session.ready',
        session_id: this.sessionId,
        current_stage: stageInfo.stage_id,
        stage_label: stageInfo.stage_label,
        remaining_seconds: this.remainingSeconds,
        resumed: true,
      });
      this.triggerAiSpeaking(
        'Koneksi telah pulih kembali dan konteks percakapan kita berhasil dilanjutkan tanpa kehilangan riwayat.',
        'happy',
      );
    }, 1100);

    this.speakingTimerIds.push(reconnectTimer);
  }

  public handleClientPing(clientTimestampMs: number): void {
    this.listeners.onControlFrame({
      type: 'server.pong',
      t: clientTimestampMs,
      server_t: Date.now(),
    });
  }

  public triggerSessionCompleted(): void {
    this.clearScheduledSpeech();
    this.listeners.onControlFrame({
      type: 'session.completed',
      session_id: this.sessionId,
      reason: 'interview_finished',
      redirect_url: `/interview/${this.sessionId}/completed`,
    });
  }

  public stop(): void {
    this.active = false;
    this.clearScheduledSpeech();
  }
}
