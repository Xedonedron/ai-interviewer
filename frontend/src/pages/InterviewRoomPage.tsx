import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Hand, Mic, MicOff, PhoneOff } from 'lucide-react';
import {
  MicCaptureManager,
  mapRmsToMicLevelPct,
} from '../engine/audio/MicCaptureManager';
import { PcmStreamPlayer } from '../engine/audio/PcmStreamPlayer';
import { VrmAvatarEngine } from '../engine/vrm/VrmAvatarEngine';
import { apiClient } from '../services/apiClient';
import { InterviewWsClient } from '../services/wsClient';
import { useInterviewStore } from '../store/useInterviewStore';
import type { InterviewStageId } from '../types/api.types';
import type { ServerToClientControlFrame } from '../types/ws.types';

const STAGE_LABELS: Record<InterviewStageId, string> = {
  STAGE_1_INTRO: 'Introduction & Ice-Breaking',
  STAGE_2_CV_PROBE: 'Experience & CV Deep-Dive',
  STAGE_3_TECHNICAL: 'Role & Competency Assessment',
  STAGE_4_QNA: 'Candidate Q&A',
  STAGE_5_CLOSING: 'Wrap-Up & Closing',
};

const formatTurnTimestamp = (timestampMs: number, fallbackIdx: number) => {
  if (!timestampMs || timestampMs <= 0) {
    const sec = (fallbackIdx + 1) * 14;
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  const date = new Date(timestampMs);
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${m}:${s}`;
};

export const InterviewRoomPage: React.FC = () => {
  const { sessionId = '018f2a90-7c4b-7d00-8111-a2b3c4d5e6f7' } = useParams<{
    sessionId: string;
  }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? 'sim_ws_token';
  const navigate = useNavigate();

  const sessionMetadata = useInterviewStore((s) => s.sessionMetadata);
  const avatarState = useInterviewStore((s) => s.avatarState);
  const activeTurnId = useInterviewStore((s) => s.activeTurnId);
  const transcripts = useInterviewStore((s) => s.transcripts);
  const micMuted = useInterviewStore((s) => s.micMuted);
  const micRmsLevel = useInterviewStore((s) => s.micRmsLevel);
  const selectedMicDeviceId = useInterviewStore((s) => s.selectedMicDeviceId);
  const setSessionMetadata = useInterviewStore((s) => s.setSessionMetadata);
  const setConnectionStatus = useInterviewStore((s) => s.setConnectionStatus);
  const setStage = useInterviewStore((s) => s.setStage);
  const tickRemainingSeconds = useInterviewStore((s) => s.tickRemainingSeconds);
  const setAvatarStateAndEmotion = useInterviewStore(
    (s) => s.setAvatarStateAndEmotion,
  );
  const upsertTranscriptDelta = useInterviewStore(
    (s) => s.upsertTranscriptDelta,
  );
  const markTurnInterrupted = useInterviewStore((s) => s.markTurnInterrupted);
  const setMicMuted = useInterviewStore((s) => s.setMicMuted);
  const setMicRmsLevel = useInterviewStore((s) => s.setMicRmsLevel);
  const setRttMs = useInterviewStore((s) => s.setRttMs);

  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const avatarContainerRef = useRef<HTMLDivElement | null>(null);
  const vrmEngineRef = useRef<VrmAvatarEngine | null>(null);
  const pcmPlayerRef = useRef<PcmStreamPlayer | null>(null);
  const micManagerRef = useRef<MicCaptureManager | null>(null);
  const wsClientRef = useRef<InterviewWsClient | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);
  const lastMicRmsUpdateMsRef = useRef<number>(0);
  const lastMicRmsValueRef = useRef<number>(0);

  // Resizable Windows-Style Split Pane Width (%)
  const [leftPaneWidthPct, setLeftPaneWidthPct] = useState<number>(50);
  const [bargeInVisible, setBargeInVisible] = useState<boolean>(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState<boolean>(false);
  const [endingSession, setEndingSession] = useState<boolean>(false);
  const [micAlertMessage, setMicAlertMessage] = useState<string | null>(null);
  const [activeVrmUrl, setActiveVrmUrl] = useState<string>(
    sessionMetadata?.vrm_model_url ?? '/models/alya.vrm',
  );

  // Auto-scroll live transcript silently
  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop =
        transcriptContainerRef.current.scrollHeight;
    }
  }, [transcripts]);

  // Session countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      tickRemainingSeconds();
    }, 1000);
    return () => clearInterval(timer);
  }, [tickRemainingSeconds]);

  // Windows-Style Split Screen Resizer Handler
  const handleStartResize = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    document.body.classList.add('resizing');

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!splitContainerRef.current) return;
      const rect = splitContainerRef.current.getBoundingClientRect();
      if (rect.width <= 0) return;
      const rawPct = ((moveEvent.clientX - rect.left) / rect.width) * 100;
      const clampedPct = Math.min(Math.max(rawPct, 28), 72);
      setLeftPaneWidthPct(clampedPct);
    };

    const handleMouseUp = () => {
      document.body.classList.remove('resizing');
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Initialize metadata, VRM Avatar Engine, PcmStreamPlayer, and WebSocket
  useEffect(() => {
    let mounted = true;

    if (!sessionMetadata) {
      apiClient
        .getCandidateSessionMetadata(sessionId, token)
        .then((meta) => {
          if (mounted) setSessionMetadata(meta);
        })
        .catch(() => {
          // Ignore error in standalone mode
        });
    }

    const player = new PcmStreamPlayer();
    pcmPlayerRef.current = player;

    const handleControlFrame = (frame: ServerToClientControlFrame) => {
      if (!mounted) return;

      switch (frame.type) {
        case 'session.ready': {
          setStage(
            frame.current_stage,
            STAGE_LABELS[frame.current_stage] ?? 'Introduction & Ice-Breaking',
            frame.remaining_seconds,
          );
          break;
        }
        case 'avatar.state': {
          setAvatarStateAndEmotion(frame.state, frame.emotion, frame.turn_id);
          vrmEngineRef.current?.setAvatarState(frame.state, frame.emotion);
          if (frame.state === 'SPEAKING') {
            pcmPlayerRef.current?.setDucking(false);
            void pcmPlayerRef.current?.getAudioContext()?.resume().catch(() => {});
          }
          break;
        }
        case 'transcript.delta': {
          upsertTranscriptDelta({
            turn_id: frame.turn_id,
            turn_seq: frame.turn_seq,
            speaker: frame.speaker,
            text: frame.text,
            is_final: frame.is_final,
            stage: frame.stage,
            timestamp_ms: frame.timestamp_ms,
          });
          break;
        }
        case 'control.barge_in': {
          const flushMs = pcmPlayerRef.current?.flushPlaybackQueue() ?? 0.5;
          pcmPlayerRef.current?.setDucking(false);
          markTurnInterrupted(frame.interrupted_turn_id, flushMs);
          vrmEngineRef.current?.setAvatarState('INTERRUPTED', 'surprised');
          setBargeInVisible(true);
          setTimeout(() => {
            if (mounted) setBargeInVisible(false);
          }, 2500);
          break;
        }
        case 'session.stage_change': {
          setStage(frame.stage, frame.stage_label, frame.remaining_seconds);
          break;
        }
        case 'session.completed': {
          navigate(
            `/interview/${sessionId}/completed?token=${encodeURIComponent(token)}`,
          );
          break;
        }
        default:
          break;
      }
    };

    const wsClient = new InterviewWsClient(sessionId, token, {
      onControlFrame: handleControlFrame,
      onBinaryPcm24kFrame: (pcmBuffer) => {
        if (!mounted || !pcmPlayerRef.current) return;
        pcmPlayerRef.current.enqueuePcmChunk(pcmBuffer);
      },
      onConnectionChange: (status) => {
        if (mounted) setConnectionStatus(status);
      },
      onRttUpdate: (rtt) => {
        if (mounted) setRttMs(rtt);
      },
    });

    wsClientRef.current = wsClient;

    // Auto-start candidate microphone capture when entering the interview room
    const startMicAutomatically = async () => {
      try {
        await player.getAudioContext()?.resume();
        const manager = new MicCaptureManager({
          onPcmChunk: (pcm16kBuffer) => {
            wsClientRef.current?.sendBinaryPcm16k(pcm16kBuffer);
          },
          onRmsLevel: (rms) => {
            if (mounted) {
              vrmEngineRef.current?.setCandidateVoiceActive(rms > 0.012);
              const nowMs = performance.now();
              if (
                nowMs - lastMicRmsUpdateMsRef.current >= 90 ||
                (rms === 0 && lastMicRmsValueRef.current !== 0)
              ) {
                if (Math.abs(rms - lastMicRmsValueRef.current) > 0.003 || rms === 0) {
                  lastMicRmsUpdateMsRef.current = nowMs;
                  lastMicRmsValueRef.current = rms;
                  setMicRmsLevel(rms);
                }
              }
            }
            if (rms <= 0.065) {
              pcmPlayerRef.current?.setDucking(false);
            }
          },
          onLocalVadSpeechStart: () => {
            // Do NOT duck or interrupt automatically from local mic RMS while AI is speaking,
            // because speaker echo from AI speech would mute Turn 2+ audio playback.
          },
          onDeviceStateChange: (reason) => {
            if (mounted && reason === 'device_disconnected') {
              setMicMuted(true);
              setMicRmsLevel(0);
              setMicAlertMessage(
                'Perangkat mikrofon terputus. Klik tombol Mikrofon untuk menghubungkan kembali.',
              );
            }
          },
        });
        await manager.startCapture(selectedMicDeviceId || undefined);
        if (!mounted) {
          await manager.stopCapture();
          return;
        }
        micManagerRef.current = manager;
        setMicMuted(false);
        setMicAlertMessage(null);
        wsClient.sendMicState(false, 'user_toggle');
      } catch (err) {
        // If browser requires explicit click or mic is absent, mark muted and show helpful notice
        if (mounted) {
          setMicMuted(true);
          setMicRmsLevel(0);
          const errName = err instanceof Error ? err.name : '';
          if (
            errName === 'NotAllowedError' ||
            errName === 'PermissionDeniedError'
          ) {
            setMicAlertMessage(
              'Izin mikrofon ditolak oleh browser. Mohon aktifkan izin mikrofon pada bilah alamat browser lalu klik tombol Mikrofon.',
            );
          } else {
            setMicAlertMessage(
              'Mikrofon belum aktif. Klik tombol "Dibisukan / Mikrofon" di bawah untuk mengaktifkan suara Anda.',
            );
          }
        }
      }
    };

    // Mount 3D Avatar Engine immediately so #three-canvas-container is never empty
    if (avatarContainerRef.current && !vrmEngineRef.current) {
      const engine = new VrmAvatarEngine();
      vrmEngineRef.current = engine;
      engine.mount(avatarContainerRef.current);
      engine.connectAnalyser(
        player.getAnalyserNode(),
        player.getAudioContext()?.sampleRate ?? 48000,
      );
      const initialVrmUrl =
        useInterviewStore.getState().sessionMetadata?.vrm_model_url ??
        '/models/alya.vrm';
      setActiveVrmUrl(initialVrmUrl);
      void engine.loadVrmModel(initialVrmUrl);
    }

    // Defer WebSocket & AudioWorklet startup by 25ms so React 18 <StrictMode>
    // synchronous mount->unmount->remount cancels the first effect before creating duplicate sockets or streams
    const startupTimer = setTimeout(() => {
      if (!mounted) return;
      wsClient.connect();
      void startMicAutomatically();
    }, 25);

    // Ensure AudioContext is resumed on any user interaction in the room
    const unlockAudioOnGesture = () => {
      void pcmPlayerRef.current?.getAudioContext()?.resume().catch(() => {});
    };
    window.addEventListener('pointerdown', unlockAudioOnGesture, { passive: true });
    window.addEventListener('keydown', unlockAudioOnGesture, { passive: true });

    return () => {
      mounted = false;
      clearTimeout(startupTimer);
      window.removeEventListener('pointerdown', unlockAudioOnGesture);
      window.removeEventListener('keydown', unlockAudioOnGesture);
      wsClient.disconnect();
      void micManagerRef.current?.stopCapture();
      micManagerRef.current = null;
      void pcmPlayerRef.current?.dispose();
      vrmEngineRef.current?.dispose();
      vrmEngineRef.current = null;
    };
  }, [sessionId, token]);

  // Reload VRM model when sessionMetadata arrives or when user switches VRM model
  useEffect(() => {
    const customVrmUrl = sessionMetadata?.vrm_model_url;
    if (customVrmUrl && vrmEngineRef.current) {
      setActiveVrmUrl(customVrmUrl);
      void vrmEngineRef.current.loadVrmModel(customVrmUrl);
    }
  }, [sessionMetadata?.vrm_model_url]);

  const handleSelectVrmModel = (url: string) => {
    setActiveVrmUrl(url);
    if (vrmEngineRef.current) {
      void vrmEngineRef.current.loadVrmModel(url);
    }
  };

  // Toggle Microphone (Zoom / Meet style)
  const handleToggleMic = async () => {
    await pcmPlayerRef.current?.getAudioContext()?.resume();

    if (!micManagerRef.current || !micManagerRef.current.isRunning()) {
      try {
        const manager = new MicCaptureManager({
          onPcmChunk: (pcm16kBuffer) => {
            wsClientRef.current?.sendBinaryPcm16k(pcm16kBuffer);
          },
          onRmsLevel: (rms) => {
            vrmEngineRef.current?.setCandidateVoiceActive(rms > 0.012);
            const nowMs = performance.now();
            if (
              nowMs - lastMicRmsUpdateMsRef.current >= 90 ||
              (rms === 0 && lastMicRmsValueRef.current !== 0)
            ) {
              if (Math.abs(rms - lastMicRmsValueRef.current) > 0.003 || rms === 0) {
                lastMicRmsUpdateMsRef.current = nowMs;
                lastMicRmsValueRef.current = rms;
                setMicRmsLevel(rms);
              }
            }
            if (rms <= 0.065) {
              pcmPlayerRef.current?.setDucking(false);
            }
          },
          onLocalVadSpeechStart: () => {
            // Do NOT duck or interrupt automatically from local mic RMS while AI is speaking
          },
          onDeviceStateChange: (reason) => {
            if (reason === 'device_disconnected') {
              setMicMuted(true);
              setMicRmsLevel(0);
              setMicAlertMessage(
                'Perangkat mikrofon terputus. Klik tombol Mikrofon untuk menghubungkan kembali.',
              );
            }
          },
        });
        await manager.startCapture(selectedMicDeviceId || undefined);
        micManagerRef.current = manager;
        setMicMuted(false);
        setMicAlertMessage(null);
        wsClientRef.current?.sendMicState(false, 'user_toggle');
        return;
      } catch (err) {
        setMicMuted(true);
        setMicRmsLevel(0);
        const errName = err instanceof Error ? err.name : '';
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError'
        ) {
          setMicAlertMessage(
            'Izin mikrofon ditolak. Izinkan akses mikrofon di pengaturan browser Anda terlebih dahulu.',
          );
        } else {
          setMicAlertMessage(
            'Gagal mengaktifkan mikrofon. Pastikan perangkat mikrofon terpasang dan halaman diakses melalui HTTPS atau localhost.',
          );
        }
        return;
      }
    }

    const nextMuted = !micMuted;
    micManagerRef.current?.setMuted(nextMuted);
    setMicMuted(nextMuted);
    if (nextMuted) {
      setMicRmsLevel(0);
    } else {
      setMicAlertMessage(null);
    }
    wsClientRef.current?.sendMicState(nextMuted, 'user_toggle');
  };

  // Instant Barge-In ("Sela AI")
  const handleInterruptAi = () => {
    setBargeInVisible(true);
    setTimeout(() => setBargeInVisible(false), 2500);

    const harness = wsClientRef.current?.getMockHarness();
    if (harness) {
      harness.triggerBargeIn('client_vad_barge_in');
    } else {
      const flushMs = pcmPlayerRef.current?.flushPlaybackQueue() ?? 0.4;
      pcmPlayerRef.current?.setDucking(false);
      wsClientRef.current?.sendBargeIn(activeTurnId);
      markTurnInterrupted(activeTurnId, flushMs);
      setAvatarStateAndEmotion('LISTENING', 'neutral');
      vrmEngineRef.current?.setAvatarState('LISTENING', 'neutral');
    }
  };

  // Confirm End Session
  const handleConfirmEndSession = () => {
    setConfirmEndOpen(false);
    setEndingSession(true);
    wsClientRef.current?.sendEndSession('candidate_finished');
    setTimeout(() => {
      navigate(
        `/interview/${sessionId}/completed?token=${encodeURIComponent(token)}`,
      );
    }, 250);
  };

  const personaName = sessionMetadata?.interviewer_persona_name || 'Alya';
  const candidateName = sessionMetadata?.candidate_name || 'Nixon Daniel';

  const statusText =
    avatarState === 'SPEAKING'
      ? `${personaName} sedang berbicara...`
      : avatarState === 'THINKING'
        ? `${personaName} memproses jawaban...`
        : `${personaName} sedang mendengarkan`;

  const statusDotClass =
    avatarState === 'SPEAKING'
      ? 'w-2 h-2 rounded-full bg-charcoal animate-pulse'
      : avatarState === 'THINKING'
        ? 'w-2 h-2 rounded-full bg-warning animate-bounce'
        : 'w-2 h-2 rounded-full bg-accent';

  const micLevelPct = micMuted ? 0 : mapRmsToMicLevelPct(micRmsLevel);

  return (
    <>
      <section
        id="view-room"
        className="w-full h-[calc(100vh-3.5rem)] px-4 sm:px-6 py-4 flex flex-col overflow-hidden"
      >
        {/* Resizable Split Screen Container */}
        <div
          id="split-container"
          ref={splitContainerRef}
          className="flex-1 flex flex-col lg:flex-row w-full h-full min-h-0 overflow-hidden relative"
        >
          {/* LEFT PANE: 3D AVATAR STAGE + ZOOM/MEET STYLE CALL BAR */}
          <div
            id="left-pane"
            style={
              {
                '--left-pane-width': `${leftPaneWidthPct}%`,
                minWidth: '280px',
              } as React.CSSProperties
            }
            className="w-full lg:w-[var(--left-pane-width)] h-1/2 lg:h-full flex flex-col bg-surface/60 border border-subtle rounded-2xl overflow-hidden relative shadow-xs"
          >
            {/* Top Overlay: Current Avatar Status (Clean, No LIVE FEED / Stage Jargon) */}
            <div className="absolute top-4 left-4 z-20 flex items-center space-x-2 pointer-events-none">
              <div className="bg-canvas/90 backdrop-blur-md border border-subtle/80 px-3.5 py-1.5 rounded-full flex items-center space-x-2 shadow-xs">
                <span id="avatar-status-dot" className={statusDotClass} />
                <span
                  id="avatar-status-text"
                  data-testid="avatar-state-badge"
                  className="text-xs font-medium text-charcoal"
                >
                  {statusText}
                </span>
              </div>

              {bargeInVisible && (
                <div
                  id="barge-in-badge"
                  data-testid="barge-in-sla-badge"
                  className="bg-canvas/90 backdrop-blur-md border border-subtle px-2.5 py-1.5 rounded-full text-[11px] text-muted"
                >
                  Menyela pembicaraan
                </div>
              )}
            </div>

            {/* Top-Right Overlay: Quick 3D VRM Character Switcher (Alya / Bima) */}
            <div className="absolute top-4 right-4 z-20 flex items-center space-x-1 bg-canvas/90 backdrop-blur-md border border-subtle/80 p-1 rounded-full shadow-xs">
              <button
                type="button"
                id="btn-vrm-alya"
                onClick={() => handleSelectVrmModel('/models/alya.vrm')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  activeVrmUrl === '/models/alya.vrm'
                    ? 'bg-charcoal text-canvas'
                    : 'text-muted hover:text-charcoal'
                }`}
              >
                Alya (.vrm)
              </button>
              <button
                type="button"
                id="btn-vrm-bima"
                onClick={() => handleSelectVrmModel('/models/bima.vrm')}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  activeVrmUrl === '/models/bima.vrm'
                    ? 'bg-charcoal text-canvas'
                    : 'text-muted hover:text-charcoal'
                }`}
              >
                Bima (.vrm)
              </button>
            </div>

            {/* Microphone Error / Warning Alert Toast */}
            {micAlertMessage && (
              <div
                id="room-mic-alert"
                role="alert"
                className="absolute top-14 left-4 right-4 z-30 bg-[#B94A48]/15 backdrop-blur-md border border-[#B94A48]/40 rounded-xl px-3.5 py-2.5 flex items-start space-x-2.5 shadow-xs"
              >
                <AlertTriangle className="w-4 h-4 text-[#B94A48] shrink-0 mt-0.5" />
                <div className="flex-1 text-xs text-charcoal leading-relaxed">
                  {micAlertMessage}
                </div>
                <button
                  type="button"
                  onClick={() => setMicAlertMessage(null)}
                  className="text-[11px] text-muted hover:text-charcoal font-medium px-1"
                >
                  Tutup
                </button>
              </div>
            )}

            {/* Subtle Atmospheric Aura Behind Avatar */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
              <div
                id="avatar-aura"
                className="w-72 h-72 rounded-full bg-subtle/40 filter blur-3xl animate-aura"
              />
            </div>

            {/* Three.js / VRM Canvas Container */}
            <div
              id="three-canvas-container"
              ref={avatarContainerRef}
              className="w-full h-full min-h-[320px] flex-1 relative z-10 flex items-center justify-center cursor-grab active:cursor-grabbing"
            />

            {/* Bottom Zoom / Google Meet Style Floating Control Bar */}
            <div className="pb-5 pt-2 px-4 relative z-20 flex items-center justify-center">
              <div className="inline-flex items-center space-x-3 bg-canvas/95 backdrop-blur-md border border-subtle px-4 py-2.5 rounded-full shadow-sm">
                {/* Mic Toggle Button (Meet/Zoom Style) with Live Voice RMS Indicator */}
                <button
                  type="button"
                  id="dock-btn-mic"
                  title="Aktifkan/Matikan Mikrofon"
                  onClick={handleToggleMic}
                  className={
                    micMuted
                      ? 'relative flex items-center space-x-2 px-4 py-2.5 rounded-full bg-[#B94A48]/15 border border-[#B94A48]/40 text-[#B94A48] text-xs font-medium transition-all active:scale-95'
                      : `relative flex items-center space-x-2 px-4 py-2.5 rounded-full bg-surface hover:bg-subtle/70 border text-charcoal text-xs font-medium transition-all active:scale-95 ${
                          micLevelPct > 8
                            ? 'border-accent ring-2 ring-accent/30'
                            : 'border-subtle'
                        }`
                  }
                >
                  {micMuted ? (
                    <MicOff className="w-4 h-4 text-[#B94A48]" />
                  ) : (
                    <Mic
                      className={`w-4 h-4 transition-colors ${
                        micLevelPct > 8 ? 'text-accent' : 'text-charcoal'
                      }`}
                    />
                  )}
                  <span id="dock-mic-label">
                    {micMuted ? 'Dibisukan' : 'Mikrofon'}
                  </span>
                  {!micMuted && (
                    <span
                      id="dock-mic-level-meter"
                      data-testid="dock-mic-level"
                      title={`Level suara: ${micLevelPct}%`}
                      className="w-8 h-1.5 bg-subtle rounded-full overflow-hidden inline-flex items-center"
                    >
                      <span
                        className="h-full bg-accent rounded-full transition-all duration-75"
                        style={{ width: `${micLevelPct}%` }}
                      />
                    </span>
                  )}
                </button>

                {/* Sela AI / Raise Hand to Interrupt (Meet/Zoom Style) */}
                <button
                  type="button"
                  id="dock-btn-interrupt"
                  title="Sela Pembicaraan AI"
                  onClick={handleInterruptAi}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-full bg-surface hover:bg-subtle/70 border border-subtle text-charcoal text-xs font-medium transition-all active:scale-95"
                >
                  <Hand className="w-4 h-4 text-charcoal" />
                  <span>Sela AI</span>
                </button>

                <div className="h-5 w-px bg-subtle" />

                {/* End Call Button (Meet/Zoom Hangup Style) */}
                <button
                  type="button"
                  id="dock-btn-end"
                  title="Akhiri Wawancara"
                  disabled={endingSession}
                  onClick={() => setConfirmEndOpen(true)}
                  className="flex items-center space-x-2 px-4 py-2.5 rounded-full bg-[#B94A48] hover:bg-[#A33F3D] disabled:opacity-50 text-canvas text-xs font-medium transition-all active:scale-95"
                >
                  <PhoneOff className="w-4 h-4" />
                  <span className="hidden sm:inline">Akhiri</span>
                </button>
              </div>
            </div>
          </div>

          {/* RESIZABLE SPLITTER HANDLE (Windows Split Screen Style) */}
          <div
            id="split-divider"
            title="Geser untuk menyesuaikan lebar layar"
            onMouseDown={handleStartResize}
            className="hidden lg:flex w-4 cursor-col-resize items-center justify-center group select-none z-30"
          >
            <div className="w-1 h-12 rounded-full bg-subtle group-hover:bg-stonehint group-active:bg-charcoal transition-colors" />
          </div>

          {/* RIGHT PANE: CLEAN TRANSCRIPT PANEL */}
          <div
            id="right-pane"
            style={{ minWidth: '280px' }}
            className="w-full lg:flex-1 h-1/2 lg:h-full mt-3 lg:mt-0 flex flex-col bg-canvas border border-subtle rounded-2xl overflow-hidden shadow-xs"
          >
            {/* Transcript Header (Clean, No WebSocket / Auto-Scroll / Copy Note Clutter) */}
            <div className="px-5 py-4 border-b border-subtle flex items-center justify-between bg-surface/30">
              <h3 className="text-xs uppercase tracking-wider font-semibold text-charcoal">
                Transkrip Langsung
              </h3>
            </div>

            {/* Live Conversation Scroll Area */}
            <div
              id="transcript-scroll-area"
              ref={transcriptContainerRef}
              className="flex-1 p-5 overflow-y-auto space-y-4"
            >
              {transcripts.length === 0 ? (
                <div className="flex flex-col space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-charcoal">
                      {personaName} (AI Interviewer)
                    </span>
                    <span className="text-[10px] text-stonehint font-mono">
                      00:04
                    </span>
                  </div>
                  <div className="bg-surface/80 border border-subtle/70 rounded-2xl rounded-tl-sm px-4 py-3 text-xs leading-relaxed text-charcoal/90">
                    Halo {candidateName.split(' ')[0]}, selamat datang dan
                    terima kasih telah meluangkan waktu hari ini. Saya{' '}
                    {personaName} yang akan memandu sesi wawancara untuk posisi{' '}
                    {sessionMetadata?.job_title ||
                      'Data Platform & AI Systems Engineer'}
                    . Bagaimana kabar Anda hari ini?
                  </div>
                </div>
              ) : (
                transcripts.map((turn, idx) => {
                  const isAi = turn.speaker === 'AI';
                  const timeLabel = !turn.is_final
                    ? 'Baru saja'
                    : formatTurnTimestamp(turn.timestamp_ms, idx);

                  if (isAi) {
                    return (
                      <div
                        key={turn.turn_id}
                        className="flex flex-col space-y-1"
                      >
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-charcoal">
                            {personaName} (AI Interviewer)
                          </span>
                          <span className="text-[10px] text-stonehint font-mono">
                            {timeLabel}
                          </span>
                        </div>
                        <div className="bg-surface/80 border border-subtle/70 rounded-2xl rounded-tl-sm px-4 py-3 text-xs leading-relaxed text-charcoal/90">
                          <span>{turn.text}</span>
                          {!turn.is_final && (
                            <span className="inline-block w-1.5 h-3 bg-accent animate-pulse ml-0.5" />
                          )}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={turn.turn_id}
                      className="flex flex-col space-y-1 items-end"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-stonehint font-mono">
                          {timeLabel}
                        </span>
                        <span className="text-xs font-semibold text-muted candidate-name-label">
                          {candidateName} (Kandidat)
                        </span>
                      </div>
                      <div
                        className={`bg-canvas border ${
                          !turn.is_final
                            ? 'border-accent/30 shadow-xs'
                            : 'border-subtle'
                        } rounded-2xl rounded-tr-sm px-4 py-3 text-xs leading-relaxed text-charcoal max-w-[90%]`}
                      >
                        <span>{turn.text}</span>
                        {!turn.is_final && (
                          <span className="inline-block w-1.5 h-3 bg-accent animate-pulse ml-0.5" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {/* MINIMAL CONFIRMATION MODAL */}
      {confirmEndOpen && (
        <div
          id="modal-confirm-end"
          className="fixed inset-0 bg-charcoal/20 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-canvas border border-subtle rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h3 className="text-base font-serif text-charcoal mb-2">
              Akhiri Sesi Wawancara?
            </h3>
            <p className="text-xs text-muted leading-relaxed mb-6">
              Waktu wawancara masih tersisa. Mengakhiri sesi sekarang akan
              menutup saluran audio dan langsung meneruskan transkrip ke tahap
              evaluasi akhir.
            </p>
            <div className="flex space-x-3 justify-end">
              <button
                type="button"
                id="modal-btn-cancel"
                onClick={() => setConfirmEndOpen(false)}
                className="px-4 py-2 text-xs font-medium text-muted hover:text-charcoal rounded-xl border border-subtle"
              >
                Lanjutkan Wawancara
              </button>
              <button
                type="button"
                id="modal-btn-confirm"
                onClick={handleConfirmEndSession}
                className="px-4 py-2 text-xs font-medium bg-charcoal text-canvas rounded-xl hover:bg-charcoal/90"
              >
                Ya, Akhiri Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
