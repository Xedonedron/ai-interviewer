/**
 * Hybrid WebSocket Client (`wsClient.ts` / `interviewWsClient.ts`)
 * Implements Contract 1 (`docs/contracts/websocket-protocol.md`):
 * - Hybrid Framing: Binary PCM (`opcode = 0x02`, `arraybuffer`) + JSON Control Frames (`opcode = 0x01`).
 * - Handshake `client.ready` with `resume_from_turn_seq`.
 * - 15-second `client.ping` / `server.pong` RTT keepalive.
 * - Automatic Reconnect on Close Code `4009` (`UPSTREAM_GEMINI_RESET`) or transient drops.
 * - Seamless Standalone Simulator attachment via `MockInterviewHarness` when in Mock Mode or if no live WS server is reachable.
 */

import {
  WS_CLOSE_CODES,
  type ClientToServerControlFrame,
  type MicStateReason,
  type ServerToClientControlFrame,
} from '../types/ws.types';
import { isSimulatorModeEnabled, resolveSessionToken } from './apiClient';
import { MockInterviewHarness } from './simulator/MockInterviewHarness';

export interface WsClientCallbacks {
  onControlFrame: (frame: ServerToClientControlFrame) => void;
  onBinaryPcm24kFrame: (pcmBuffer: ArrayBuffer) => void;
  onConnectionChange?: (status: 'connected' | 'reconnecting' | 'disconnected') => void;
  onRttUpdate?: (rttMs: number) => void;
}

export function getWsBaseUrl(): string {
  const configured = (import.meta.env?.VITE_WS_BASE_URL as string | undefined)?.trim();
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  }
  return 'ws://127.0.0.1:8000';
}

export class InterviewWsClient {
  private sessionId: string;
  private token: string;
  private callbacks: WsClientCallbacks;
  private ws: WebSocket | null = null;
  private mockHarness: MockInterviewHarness | null = null;
  private pingIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastTurnSeq = 0;
  private intentionalClose = false;
  private useMock: boolean;

  constructor(
    sessionId: string,
    token: string,
    callbacks: WsClientCallbacks,
    forceMock?: boolean,
  ) {
    this.sessionId = sessionId;
    const resolved = resolveSessionToken(sessionId, token);
    this.token = resolved ?? token;
    this.callbacks = callbacks;
    this.useMock =
      forceMock ??
      (isSimulatorModeEnabled() || (!resolved && token === 'sim_ws_token'));
  }

  public connect(resumeFromTurnSeq = this.lastTurnSeq): void {
    this.intentionalClose = false;
    this.lastTurnSeq = resumeFromTurnSeq;

    if (this.useMock) {
      this.startMockHarness(resumeFromTurnSeq);
      return;
    }

    const baseUrl = getWsBaseUrl();
    const url = `${baseUrl}/ws/interview/${this.sessionId}?token=${encodeURIComponent(
      this.token,
    )}`;

    try {
      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        this.callbacks.onConnectionChange?.('connected');
        this.sendControlFrame({
          type: 'client.ready',
          client_version: '1.0.0',
          audio_config: {
            input_sample_rate: 16000,
            channels: 1,
            sample_format: 'PCM_S16LE',
            chunk_ms: 40,
          },
          resume_from_turn_seq: this.lastTurnSeq,
        });
        this.startPingLoop();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        if (event.data instanceof ArrayBuffer) {
          this.callbacks.onBinaryPcm24kFrame(event.data);
          return;
        }
        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data) as ServerToClientControlFrame;
            this.handleIncomingControlFrame(parsed);
          } catch {
            // Ignore malformed JSON frames
          }
        }
      };

      this.ws.onclose = (event: CloseEvent) => {
        this.stopPingLoop();
        if (this.intentionalClose || event.code === WS_CLOSE_CODES.NORMAL_CLOSURE) {
          this.callbacks.onConnectionChange?.('disconnected');
          return;
        }
        if (
          event.code === WS_CLOSE_CODES.AUTH_INVALID_OR_EXPIRED ||
          event.code === WS_CLOSE_CODES.SESSION_ALREADY_COMPLETED
        ) {
          this.callbacks.onConnectionChange?.('disconnected');
          return;
        }
        if (event.code === WS_CLOSE_CODES.SESSION_ALREADY_ACTIVE) {
          // Handle React StrictMode fast remount race where the previous connection is still releasing its lock
          this.callbacks.onConnectionChange?.('reconnecting');
          setTimeout(() => {
            if (!this.intentionalClose) {
              this.connect(this.lastTurnSeq);
            }
          }, 300);
          return;
        }

        // Auto-reconnect on 4009 (`UPSTREAM_GEMINI_RESET`) or network drop
        this.callbacks.onConnectionChange?.('reconnecting');
        setTimeout(() => {
          if (!this.intentionalClose) {
            this.connect(this.lastTurnSeq);
          }
        }, 800);
      };

      this.ws.onerror = () => {
        // If live WebSocket fails to connect in standalone dev, fall back to MockHarness
        if (!this.useMock) {
          this.useMock = true;
          this.ws?.close();
          this.startMockHarness(this.lastTurnSeq);
        }
      };
    } catch {
      this.useMock = true;
      this.startMockHarness(resumeFromTurnSeq);
    }
  }

  private startMockHarness(resumeFromTurnSeq: number): void {
    this.mockHarness?.stop();
    this.mockHarness = new MockInterviewHarness(this.sessionId, {
      onControlFrame: (frame) => this.handleIncomingControlFrame(frame),
      onBinaryPcmFrame: (pcmBuffer) => this.callbacks.onBinaryPcm24kFrame(pcmBuffer),
      onConnectionStateChange: (connected, reconnecting) => {
        if (reconnecting) {
          this.callbacks.onConnectionChange?.('reconnecting');
        } else {
          this.callbacks.onConnectionChange?.(connected ? 'connected' : 'disconnected');
        }
      },
    });
    this.mockHarness.start(resumeFromTurnSeq);
    this.startPingLoop();
  }

  private handleIncomingControlFrame(frame: ServerToClientControlFrame): void {
    if (frame.type === 'transcript.delta') {
      this.lastTurnSeq = Math.max(this.lastTurnSeq, frame.turn_seq);
    } else if (frame.type === 'server.pong') {
      const rtt = Math.max(1, Date.now() - frame.t);
      this.callbacks.onRttUpdate?.(rtt);
    }
    this.callbacks.onControlFrame(frame);
  }

  private startPingLoop(): void {
    this.stopPingLoop();
    this.pingIntervalId = setInterval(() => {
      const now = Date.now();
      this.sendControlFrame({ type: 'client.ping', t: now });
    }, 15000);
  }

  private stopPingLoop(): void {
    if (this.pingIntervalId !== null) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  /**
   * Sends a 16kHz `PCM_S16LE` binary frame (1,280 bytes = 40ms) upstream (`opcode = 0x02`).
   */
  public sendBinaryPcm16k(pcmBuffer: ArrayBuffer): void {
    if (this.useMock) {
      // In simulator mode, binary frames are accepted silently without network overhead
      return;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(pcmBuffer);
    }
  }

  /**
   * Sends a JSON control frame upstream (`opcode = 0x01`).
   */
  public sendControlFrame(frame: ClientToServerControlFrame): void {
    if (this.useMock && this.mockHarness) {
      if (frame.type === 'client.ping') {
        this.mockHarness.handleClientPing(frame.t);
      } else if (frame.type === 'client.barge_in') {
        this.mockHarness.triggerBargeIn('client_vad_barge_in');
      } else if (frame.type === 'client.end_session') {
        this.mockHarness.triggerSessionCompleted();
      }
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  public sendMicState(muted: boolean, reason: MicStateReason = 'user_toggle'): void {
    this.sendControlFrame({
      type: 'client.mic_state',
      muted,
      reason,
    });
  }

  public sendBargeIn(interruptedTurnId: string): void {
    this.sendControlFrame({
      type: 'client.barge_in',
      interrupted_turn_id: interruptedTurnId,
      client_timestamp_ms: Date.now(),
    });
  }

  public sendEndSession(reason: 'candidate_finished' | 'user_ended' | 'time_up' = 'candidate_finished'): void {
    this.sendControlFrame({
      type: 'client.end_session',
      reason,
    });
  }

  public getMockHarness(): MockInterviewHarness | null {
    return this.mockHarness;
  }

  public isUsingMock(): boolean {
    return this.useMock;
  }

  public disconnect(): void {
    this.intentionalClose = true;
    this.stopPingLoop();
    this.mockHarness?.stop();
    this.mockHarness = null;
    if (this.ws) {
      this.ws.close(WS_CLOSE_CODES.NORMAL_CLOSURE, 'Client closed session');
      this.ws = null;
    }
  }
}
