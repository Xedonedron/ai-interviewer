/**
 * Contract 1: WebSocket Relay Protocol Specification (`websocket-protocol.md`)
 * Version: 1.0.0 — Hybrid Framing: Binary PCM (0x02) + JSON Control Frames (0x01)
 */

import type {
  AvatarEmotion,
  AvatarStateId,
  InterviewStageId,
  TranscriptSpeaker,
} from './api.types';

/**
 * Custom WebSocket Close Codes (Section 4 of websocket-protocol.md)
 */
export const WS_CLOSE_CODES = {
  NORMAL_CLOSURE: 1000,
  AUTH_INVALID_OR_EXPIRED: 4001,
  SESSION_ALREADY_ACTIVE: 4002,
  SESSION_ALREADY_COMPLETED: 4003,
  UPSTREAM_GEMINI_RESET: 4009,
} as const;

export type WsCloseCode = (typeof WS_CLOSE_CODES)[keyof typeof WS_CLOSE_CODES];

/**
 * 2.2 Client -> Backend Relay JSON Control Frames
 */
export interface ClientReadyFrame {
  type: 'client.ready';
  client_version: string;
  audio_config: {
    input_sample_rate: 16000;
    channels: 1;
    sample_format: 'PCM_S16LE';
    chunk_ms: 40;
  };
  resume_from_turn_seq: number;
}

export interface ClientBargeInFrame {
  type: 'client.barge_in';
  interrupted_turn_id: string;
  client_timestamp_ms: number;
}

export type MicStateReason = 'user_toggle' | 'device_disconnected' | 'device_restored';

export interface ClientMicStateFrame {
  type: 'client.mic_state';
  muted: boolean;
  reason: MicStateReason;
}

export interface ClientPingFrame {
  type: 'client.ping';
  t: number;
}

export interface ClientEndSessionFrame {
  type: 'client.end_session';
  reason: 'candidate_finished' | 'user_ended' | 'time_up';
}

export type ClientToServerControlFrame =
  | ClientReadyFrame
  | ClientBargeInFrame
  | ClientMicStateFrame
  | ClientPingFrame
  | ClientEndSessionFrame;

/**
 * 3.2 Backend Relay -> Client JSON Control Frames
 */
export interface SessionReadyFrame {
  type: 'session.ready';
  session_id: string;
  current_stage: InterviewStageId;
  stage_label: string;
  remaining_seconds: number;
  resumed: boolean;
}

export interface AvatarStateFrame {
  type: 'avatar.state';
  state: AvatarStateId;
  emotion: AvatarEmotion;
  turn_id: string;
  timestamp_ms: number;
}

export interface ControlBargeInFrame {
  type: 'control.barge_in';
  interrupted_turn_id: string;
  reason: string;
  timestamp_ms: number;
}

export interface TranscriptDeltaFrame {
  type: 'transcript.delta';
  turn_id: string;
  turn_seq: number;
  speaker: TranscriptSpeaker;
  text: string;
  is_final: boolean;
  stage: InterviewStageId;
  timestamp_ms: number;
}

export interface SessionStageChangeFrame {
  type: 'session.stage_change';
  previous_stage: InterviewStageId;
  stage: InterviewStageId;
  stage_label: string;
  remaining_seconds: number;
}

export interface ServerPongFrame {
  type: 'server.pong';
  t: number;
  server_t: number;
}

export interface SessionCompletedFrame {
  type: 'session.completed';
  session_id: string;
  reason: string;
  redirect_url: string;
}

export interface SessionErrorFrame {
  type: 'session.error';
  code: string;
  message: string;
  recoverable: boolean;
}

export type ServerToClientControlFrame =
  | SessionReadyFrame
  | AvatarStateFrame
  | ControlBargeInFrame
  | TranscriptDeltaFrame
  | SessionStageChangeFrame
  | ServerPongFrame
  | SessionCompletedFrame
  | SessionErrorFrame;
