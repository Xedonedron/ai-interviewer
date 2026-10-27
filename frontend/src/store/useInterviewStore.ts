/**
 * Zustand Session & Interview Room Store (`useInterviewStore.ts`)
 * Synchronizes REST metadata, WebSocket control frames, live captions,
 * avatar state/emotion, barge-in metrics, and device preferences.
 */

import { create } from 'zustand';
import type {
  AvatarEmotion,
  AvatarStateId,
  CandidateSessionMetadataResponse,
  InterviewStageId,
  TranscriptSpeaker,
} from '../types/api.types';
import type { VisemeWeights } from '../engine/vrm/VrmLipSync';

export interface LiveTranscriptItem {
  turn_id: string;
  turn_seq: number;
  speaker: TranscriptSpeaker;
  text: string;
  is_final: boolean;
  stage: InterviewStageId;
  was_interrupted: boolean;
  timestamp_ms: number;
}

export interface InterviewStoreState {
  sessionMetadata: CandidateSessionMetadataResponse | null;
  connectionStatus: 'connected' | 'reconnecting' | 'disconnected';
  currentStage: InterviewStageId;
  stageLabel: string;
  remainingSeconds: number;
  avatarState: AvatarStateId;
  avatarEmotion: AvatarEmotion;
  activeTurnId: string;
  transcripts: LiveTranscriptItem[];
  micMuted: boolean;
  micRmsLevel: number;
  selectedMicDeviceId: string;
  consentAccepted: boolean;
  vrmPreloaded: boolean;
  lastBargeInFlushMs: number | null;
  rttMs: number;
  fps: number;
  qualityTier: string;
  visemes: VisemeWeights;
  simulatorOverlayOpen: boolean;

  // Actions
  setSessionMetadata: (meta: CandidateSessionMetadataResponse) => void;
  setConnectionStatus: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  setStage: (stage: InterviewStageId, label: string, remainingSec?: number) => void;
  tickRemainingSeconds: () => void;
  setAvatarStateAndEmotion: (
    state: AvatarStateId,
    emotion?: AvatarEmotion,
    turnId?: string,
  ) => void;
  upsertTranscriptDelta: (delta: {
    turn_id: string;
    turn_seq: number;
    speaker: TranscriptSpeaker;
    text: string;
    is_final: boolean;
    stage: InterviewStageId;
    timestamp_ms: number;
  }) => void;
  markTurnInterrupted: (turnId: string, flushDurationMs: number) => void;
  setMicMuted: (muted: boolean) => void;
  setMicRmsLevel: (rms: number) => void;
  setSelectedMicDeviceId: (deviceId: string) => void;
  setConsentAccepted: (accepted: boolean) => void;
  setVrmPreloaded: (loaded: boolean) => void;
  setRttMs: (rttMs: number) => void;
  setAvatarTelemetry: (fps: number, tier: string, visemes: VisemeWeights) => void;
  setSimulatorOverlayOpen: (open: boolean) => void;
  resetRoomState: () => void;
}

export const useInterviewStore = create<InterviewStoreState>((set) => ({
  sessionMetadata: null,
  connectionStatus: 'disconnected',
  currentStage: 'STAGE_1_INTRO',
  stageLabel: 'Introduction & Ice-Breaking',
  remainingSeconds: 1800,
  avatarState: 'IDLE',
  avatarEmotion: 'neutral',
  activeTurnId: 'turn_001',
  transcripts: [],
  micMuted: false,
  micRmsLevel: 0,
  selectedMicDeviceId: '',
  consentAccepted: false,
  vrmPreloaded: true,
  lastBargeInFlushMs: null,
  rttMs: 14,
  fps: 60,
  qualityTier: 'TIER_1_ULTRA',
  visemes: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 },
  simulatorOverlayOpen: true,

  setSessionMetadata: (meta) =>
    set({
      sessionMetadata: meta,
      currentStage: meta.current_stage,
      remainingSeconds: meta.remaining_seconds,
      stageLabel:
        meta.stages.find((s) => s.stage_id === meta.current_stage)?.stage_label ??
        'Introduction & Ice-Breaking',
    }),

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  setStage: (stage, label, remainingSec) =>
    set((state) => ({
      currentStage: stage,
      stageLabel: label,
      remainingSeconds: remainingSec ?? state.remainingSeconds,
    })),

  tickRemainingSeconds: () =>
    set((state) => ({
      remainingSeconds: Math.max(0, state.remainingSeconds - 1),
    })),

  setAvatarStateAndEmotion: (avatarState, emotion, turnId) =>
    set((state) => ({
      avatarState,
      avatarEmotion: emotion ?? state.avatarEmotion,
      activeTurnId: turnId ?? state.activeTurnId,
    })),

  upsertTranscriptDelta: (delta) =>
    set((state) => {
      const idx = state.transcripts.findIndex((t) => t.turn_id === delta.turn_id);
      if (idx >= 0) {
        const updated = [...state.transcripts];
        updated[idx] = {
          ...updated[idx],
          text: delta.text,
          is_final: delta.is_final,
          timestamp_ms: delta.timestamp_ms,
        };
        return { transcripts: updated, activeTurnId: delta.turn_id };
      }
      return {
        activeTurnId: delta.turn_id,
        transcripts: [
          ...state.transcripts,
          {
            turn_id: delta.turn_id,
            turn_seq: delta.turn_seq,
            speaker: delta.speaker,
            text: delta.text,
            is_final: delta.is_final,
            stage: delta.stage,
            was_interrupted: false,
            timestamp_ms: delta.timestamp_ms,
          },
        ],
      };
    }),

  markTurnInterrupted: (turnId, flushDurationMs) =>
    set((state) => ({
      lastBargeInFlushMs: Number(flushDurationMs.toFixed(2)),
      avatarState: 'INTERRUPTED',
      avatarEmotion: 'surprised',
      transcripts: state.transcripts.map((t) =>
        t.turn_id === turnId ? { ...t, was_interrupted: true, is_final: true } : t,
      ),
    })),

  setMicMuted: (muted) => set({ micMuted: muted }),
  setMicRmsLevel: (rms) => set({ micRmsLevel: rms }),
  setSelectedMicDeviceId: (deviceId) => set({ selectedMicDeviceId: deviceId }),
  setConsentAccepted: (accepted) => set({ consentAccepted: accepted }),
  setVrmPreloaded: (loaded) => set({ vrmPreloaded: loaded }),
  setRttMs: (rttMs) => set({ rttMs }),
  setAvatarTelemetry: (fps, qualityTier, visemes) =>
    set({ fps, qualityTier, visemes }),
  setSimulatorOverlayOpen: (open) => set({ simulatorOverlayOpen: open }),

  resetRoomState: () =>
    set({
      connectionStatus: 'disconnected',
      currentStage: 'STAGE_1_INTRO',
      stageLabel: 'Introduction & Ice-Breaking',
      avatarState: 'IDLE',
      avatarEmotion: 'neutral',
      transcripts: [],
      lastBargeInFlushMs: null,
    }),
}));
