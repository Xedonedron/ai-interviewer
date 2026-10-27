import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  Globe,
  Headphones,
  Volume2,
  Wifi,
} from 'lucide-react';
import { apiClient, resolveSessionToken } from '../services/apiClient';
import {
  computeFrameRms,
  mapRmsToMicLevelPct,
} from '../engine/audio/MicCaptureManager';
import { PcmStreamPlayer } from '../engine/audio/PcmStreamPlayer';
import { useInterviewStore } from '../store/useInterviewStore';

export { mapRmsToMicLevelPct };

export const CandidateLobbyPage: React.FC = () => {
  const { sessionId = '018f2a90-7c4b-7d00-8111-a2b3c4d5e6f7' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token') ?? '';
  const {
    sessionMetadata,
    setSessionMetadata,
    consentAccepted,
    setConsentAccepted,
    selectedMicDeviceId,
    setSelectedMicDeviceId,
  } = useInterviewStore();

  const playerRef = useRef<PcmStreamPlayer | null>(null);

  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [consentError, setConsentError] = useState(false);
  const [speakerTestLabel, setSpeakerTestLabel] = useState('Putar Sampel');
  const [micLevelPct, setMicLevelPct] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [micActive, setMicActive] = useState(false);
  const [audioDevices, setAudioDevices] = useState<
    { id: string; label: string }[]
  >([
    { id: 'default', label: 'Default - Microphone Internal' },
    { id: 'external', label: 'External - Headset / Audio Interface' },
  ]);

  useEffect(() => {
    void apiClient
      .getCandidateSessionMetadata(sessionId, token)
      .then((meta) => {
        setSessionMetadata(meta);
      })
      .catch(() => {
        // Fallback in standalone mode
      });
  }, [sessionId, token, setSessionMetadata]);

  // Open real Web Audio microphone stream & compute real-time RMS level in Step 2
  useEffect(() => {
    if (wizardStep !== 2) {
      setMicLevelPct(0);
      setMicActive(false);
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let audioCtx: AudioContext | null = null;
    let sourceNode: MediaStreamAudioSourceNode | null = null;
    let analyserNode: AnalyserNode | null = null;
    let silentGainNode: GainNode | null = null;
    let rafId: number | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const cleanupMicPreview = () => {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      try {
        sourceNode?.disconnect();
      } catch {
        // Ignore
      }
      try {
        analyserNode?.disconnect();
      } catch {
        // Ignore
      }
      try {
        silentGainNode?.disconnect();
      } catch {
        // Ignore
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        stream = null;
      }
      if (audioCtx && audioCtx.state !== 'closed') {
        void audioCtx.close().catch(() => {});
        audioCtx = null;
      }
    };

    const startRealMicMeter = async () => {
      setMicError(null);
      setMicLevelPct(0);

      const isInsecureOrigin =
        typeof window !== 'undefined' &&
        window.isSecureContext === false &&
        window.location.hostname !== 'localhost' &&
        window.location.hostname !== '127.0.0.1';

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setMicActive(false);
        setMicError(
          isInsecureOrigin
            ? 'Akses mikrofon diblokir oleh browser karena koneksi tidak aman (non-HTTPS / IP LAN). Gunakan https:// atau http://localhost:5173.'
            : 'Browser ini tidak menyediakan akses perangkat mikrofon (navigator.mediaDevices tidak tersedia). Gunakan Google Chrome atau Microsoft Edge terbaru via HTTPS/localhost.',
        );
        return;
      }

      try {
        const useSpecificDevice =
          selectedMicDeviceId &&
          selectedMicDeviceId !== 'default' &&
          selectedMicDeviceId !== 'external';

        const baseAudioConstraints: MediaTrackConstraints = {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          ...(useSpecificDevice
            ? { deviceId: { ideal: selectedMicDeviceId } }
            : {}),
        };

        stream = await navigator.mediaDevices.getUserMedia({
          audio: baseAudioConstraints,
          video: false,
        });

        if (cancelled) {
          cleanupMicPreview();
          return;
        }

        if (typeof navigator.mediaDevices.enumerateDevices === 'function') {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) {
            const mics = devices
              .filter((d) => d.kind === 'audioinput')
              .map((d, idx) => ({
                id: d.deviceId || `mic_${idx}`,
                label: d.label || `Mikrofon Input ${idx + 1}`,
              }));
            if (mics.length > 0) {
              setAudioDevices(mics);
              if (
                !selectedMicDeviceId ||
                !mics.some((m) => m.id === selectedMicDeviceId)
              ) {
                setSelectedMicDeviceId(mics[0].id);
              }
            }
          }
        }

        const AudioCtxCtor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;

        if (!AudioCtxCtor) {
          setMicError('Web Audio API tidak didukung pada browser ini.');
          return;
        }

        audioCtx = new AudioCtxCtor();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume().catch(() => {});
        }

        if (cancelled) {
          cleanupMicPreview();
          return;
        }

        sourceNode = audioCtx.createMediaStreamSource(stream);
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 512;
        analyserNode.smoothingTimeConstant = 0.35;

        // Connect through a silent GainNode (gain = 0) so Chromium keeps the audio graph active without speaker echo
        silentGainNode = audioCtx.createGain();
        silentGainNode.gain.value = 0;

        sourceNode.connect(analyserNode);
        analyserNode.connect(silentGainNode);
        silentGainNode.connect(audioCtx.destination);

        setMicActive(true);

        const timeDomainBuffer = new Float32Array(analyserNode.fftSize);
        const byteTimeDomainBuffer = new Uint8Array(analyserNode.fftSize);

        const sampleMicLevel = () => {
          if (cancelled || !analyserNode) return;
          if (audioCtx && audioCtx.state === 'suspended') {
            void audioCtx.resume().catch(() => {});
          }

          if (typeof analyserNode.getFloatTimeDomainData === 'function') {
            analyserNode.getFloatTimeDomainData(timeDomainBuffer);
          } else if (typeof analyserNode.getByteTimeDomainData === 'function') {
            analyserNode.getByteTimeDomainData(byteTimeDomainBuffer);
            for (let i = 0; i < byteTimeDomainBuffer.length; i++) {
              timeDomainBuffer[i] = (byteTimeDomainBuffer[i] - 128) / 128;
            }
          }

          const rms = computeFrameRms(timeDomainBuffer);
          const pct = mapRmsToMicLevelPct(rms);
          setMicLevelPct(pct);
        };

        intervalId = setInterval(sampleMicLevel, 50);
      } catch (err) {
        if (cancelled) return;
        setMicActive(false);
        setMicLevelPct(0);
        const errName = err instanceof Error ? err.name : '';
        if (
          errName === 'NotAllowedError' ||
          errName === 'PermissionDeniedError'
        ) {
          setMicError(
            'Izin mikrofon ditolak. Mohon izinkan akses mikrofon pada ikon gembok/kamera di bilah alamat browser Anda, lalu muat ulang halaman.',
          );
        } else if (
          errName === 'NotFoundError' ||
          errName === 'DevicesNotFoundError'
        ) {
          setMicError(
            'Perangkat mikrofon tidak ditemukan. Pastikan mikrofon atau headset Anda sudah terpasang dengan benar.',
          );
        } else {
          setMicError(
            'Gagal mengakses mikrofon. Pastikan mikrofon tidak sedang dikunci oleh aplikasi lain dan Anda mengakses via HTTPS atau localhost.',
          );
        }
      }
    };

    void startRealMicMeter();

    return () => {
      cancelled = true;
      cleanupMicPreview();
    };
  }, [wizardStep, selectedMicDeviceId, setSelectedMicDeviceId]);

  // Cleanup speaker test player on unmount
  useEffect(() => {
    return () => {
      void playerRef.current?.dispose();
      playerRef.current = null;
    };
  }, []);

  const handleTestSpeaker = () => {
    setSpeakerTestLabel('Memutar Suara...');
    try {
      if (!playerRef.current) {
        playerRef.current = new PcmStreamPlayer();
      }
      playerRef.current.playTestTone(600);
    } catch {
      // Fallback for headless browser without Web Audio hardware
    }

    setTimeout(() => {
      setSpeakerTestLabel('Sampel Terdengar');
      setTimeout(() => {
        setSpeakerTestLabel('Putar Sampel');
      }, 2000);
    }, 700);
  };

  const handleNextStep = () => {
    if (wizardStep === 1) {
      setWizardStep(2);
      return;
    }
    if (wizardStep === 2) {
      setWizardStep(3);
      return;
    }
    if (!consentAccepted) {
      setConsentError(true);
      return;
    }
    setConsentError(false);
    const activeToken = token || resolveSessionToken(sessionId) || '';
    const qs = activeToken ? `?token=${encodeURIComponent(activeToken)}` : '';
    navigate(`/interview/${sessionId}/room${qs}`);
  };

  const handlePrevStep = () => {
    if (wizardStep === 3) {
      setWizardStep(2);
    } else if (wizardStep === 2) {
      setWizardStep(1);
    }
  };

  const candidateName = sessionMetadata?.candidate_name || 'Nixon Daniel';
  const jobRole =
    sessionMetadata?.job_title || 'Data Platform & AI Systems Engineer';
  const durationMinutes = sessionMetadata?.duration_minutes ?? 30;

  return (
    <section
      id="view-lobby"
      className="w-full max-w-2xl mx-auto px-6 py-10 my-auto"
    >
      {/* Stepper Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center space-x-3 text-xs text-stonehint uppercase tracking-widest font-medium mb-3">
          <span id="step-number-badge">Tahap {wizardStep} dari 3</span>
        </div>

        <h1
          id="step-title"
          className="text-3xl sm:text-4xl font-serif text-charcoal tracking-tight"
        >
          {wizardStep === 1 && 'Pengecekan Perangkat'}
          {wizardStep === 2 && 'Kalibrasi Suara'}
          {wizardStep === 3 && 'Persetujuan Wawancara'}
        </h1>

        {wizardStep === 1 && (
          <p
            id="step-desc"
            className="text-sm text-muted mt-3 max-w-lg mx-auto leading-relaxed"
          >
            Halo{' '}
            <strong className="text-charcoal font-medium">
              {candidateName}
            </strong>
            , selamat datang di sesi wawancara untuk posisi{' '}
            <strong className="text-charcoal font-medium">{jobRole}</strong>.
            Mari kita pastikan browser dan perangkat Anda siap sebelum memulai.
          </p>
        )}

        {wizardStep === 2 && (
          <p
            id="step-desc"
            className="text-sm text-muted mt-3 max-w-lg mx-auto leading-relaxed"
          >
            Pilih mikrofon yang Anda gunakan dan pastikan suara Anda terdeteksi
            dengan jelas.
          </p>
        )}

        {wizardStep === 3 && (
          <p
            id="step-desc"
            className="text-sm text-muted mt-3 max-w-lg mx-auto leading-relaxed"
          >
            Konfirmasi kesiapan Anda sebelum memasuki ruang wawancara.
          </p>
        )}
      </div>

      {/* Step Progress Bar */}
      <div className="w-full grid grid-cols-3 gap-2 mb-8">
        <div
          id="bar-step-1"
          className={`h-1 rounded-full transition-all duration-300 ${
            wizardStep >= 1 ? 'bg-charcoal' : 'bg-subtle'
          }`}
        />
        <div
          id="bar-step-2"
          className={`h-1 rounded-full transition-all duration-300 ${
            wizardStep >= 2 ? 'bg-charcoal' : 'bg-subtle'
          }`}
        />
        <div
          id="bar-step-3"
          className={`h-1 rounded-full transition-all duration-300 ${
            wizardStep >= 3 ? 'bg-charcoal' : 'bg-subtle'
          }`}
        />
      </div>

      {/* Card Container */}
      <div className="bg-surface/70 border border-subtle rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-[0_4px_24px_-10px_rgba(28,27,24,0.04)]">
        {/* STEP 1 CONTENT: Simple Browser Capability Check */}
        {wizardStep === 1 && (
          <div id="step-1-content" className="space-y-3.5">
            <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-subtle/80">
              <div className="flex items-center space-x-3.5">
                <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-charcoal">
                  <Globe className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal">
                    Kemampuan Browser
                  </p>
                  <p className="text-[11px] text-stonehint">
                    Browser Anda mendukung tampilan interaktif dengan lancar
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-accentsoft text-accent">
                <Check className="w-3 h-3 mr-1" /> Siap
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-subtle/80">
              <div className="flex items-center space-x-3.5">
                <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-charcoal">
                  <Headphones className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal">
                    Dukungan Perangkat Suara
                  </p>
                  <p className="text-[11px] text-stonehint">
                    Sistem audio siap untuk percakapan dua arah
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-accentsoft text-accent">
                <Check className="w-3 h-3 mr-1" /> Siap
              </span>
            </div>

            <div className="flex items-center justify-between p-4 bg-canvas rounded-xl border border-subtle/80">
              <div className="flex items-center space-x-3.5">
                <div className="w-9 h-9 rounded-lg bg-surface flex items-center justify-center text-charcoal">
                  <Wifi className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-charcoal">
                    Koneksi Jaringan
                  </p>
                  <p className="text-[11px] text-stonehint">
                    Koneksi internet stabil untuk sesi wawancara
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-accentsoft text-accent">
                <Check className="w-3 h-3 mr-1" /> Stabil
              </span>
            </div>
          </div>
        )}

        {/* STEP 2 CONTENT: Audio Hardware Calibration */}
        {wizardStep === 2 && (
          <div id="step-2-content" className="space-y-6">
            {micError && (
              <div
                id="mic-error-banner"
                role="alert"
                className="flex items-start space-x-3 p-3.5 rounded-xl bg-[#B94A48]/10 border border-[#B94A48]/30 text-[#B94A48]"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">{micError}</p>
              </div>
            )}

            <div>
              <label
                htmlFor="mic-select"
                className="block text-xs font-medium text-muted uppercase tracking-wider mb-2"
              >
                Pilih Mikrofon Input
              </label>
              <div className="relative">
                <select
                  id="mic-select"
                  value={selectedMicDeviceId || audioDevices[0]?.id || 'default'}
                  onChange={(e) => setSelectedMicDeviceId(e.target.value)}
                  className="w-full bg-canvas border border-subtle rounded-xl px-3.5 py-2.5 text-xs text-charcoal focus:outline-none focus:border-charcoal appearance-none"
                >
                  {audioDevices.map((dev) => (
                    <option key={dev.id} value={dev.id}>
                      {dev.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-stonehint absolute right-3 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Real-time Mic Level Visualizer */}
            <div>
              <div className="flex justify-between items-center text-xs mb-2">
                <span className="text-muted">
                  Uji Suara Anda (Bicaralah sekarang)
                </span>
                <span
                  id="mic-status-label"
                  className={`text-[11px] font-medium ${
                    micError
                      ? 'text-[#B94A48]'
                      : micLevelPct > 8
                        ? 'text-accent'
                        : 'text-stonehint'
                  }`}
                >
                  {micError
                    ? 'Mikrofon tidak tersedia'
                    : micLevelPct > 8
                      ? `Suara terdeteksi (${micLevelPct}%)`
                      : micActive
                        ? 'Menunggu suara Anda...'
                        : 'Menyiapkan mikrofon...'}
                </span>
              </div>
              <div className="w-full bg-subtle/50 h-2.5 rounded-full overflow-hidden p-0.5 border border-subtle flex items-center">
                <div
                  id="mic-level-bar"
                  className="h-full bg-accent rounded-full transition-all duration-75"
                  style={{ width: `${micLevelPct}%` }}
                />
              </div>
              <p className="text-[11px] text-stonehint mt-1.5">
                Pastikan indikator bergerak saat Anda berbicara normal.
              </p>
            </div>

            {/* Speaker Output Test */}
            <div className="pt-2 border-t border-subtle flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-charcoal">
                  Uji Suara Speaker
                </p>
                <p className="text-[11px] text-stonehint">
                  Pastikan Anda dapat mendengar suara dengan jelas
                </p>
              </div>
              <button
                type="button"
                id="btn-test-speaker"
                onClick={handleTestSpeaker}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl border border-subtle bg-canvas hover:bg-surface text-charcoal text-xs font-medium transition-all active:scale-95"
              >
                <Volume2 className="w-3.5 h-3.5 text-muted" />
                <span id="speaker-test-label">{speakerTestLabel}</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 CONTENT: Consent & Environment Check */}
        {wizardStep === 3 && (
          <div id="step-3-content" className="space-y-5">
            <div className="p-4 bg-canvas rounded-xl border border-subtle space-y-3">
              <h4 className="text-xs font-semibold text-charcoal">
                Panduan Singkat Wawancara
              </h4>
              <ul className="text-xs text-muted space-y-2 leading-relaxed">
                <li className="flex items-start space-x-2">
                  <span className="text-charcoal mt-0.5">•</span>
                  <span>
                    Wawancara berlangsung sekitar{' '}
                    <strong>{durationMinutes} menit</strong>.
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-charcoal mt-0.5">•</span>
                  <span>
                    Anda dapat menyela pembicaraan kapan saja layaknya percakapan
                    biasa.
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <span className="text-charcoal mt-0.5">•</span>
                  <span>
                    Percakapan akan dicatat secara otomatis untuk keperluan
                    evaluasi tim rekrutmen.
                  </span>
                </li>
              </ul>
            </div>

            <label className="flex items-start space-x-3 cursor-pointer pt-2">
              <input
                type="checkbox"
                id="consent-checkbox"
                checked={consentAccepted}
                onChange={(e) => {
                  setConsentAccepted(e.target.checked);
                  if (e.target.checked) setConsentError(false);
                }}
                className="mt-0.5 w-4 h-4 rounded border-subtle text-charcoal focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-xs text-muted leading-relaxed select-none">
                Saya menyetujui perekaman suara dan pembuatan transkrip untuk
                keperluan asesmen rekrutmen ini.
              </span>
            </label>

            {consentError && (
              <p
                id="consent-error"
                className="text-[11px] text-warning font-medium"
              >
                Mohon centang persetujuan di atas sebelum memulai sesi wawancara.
              </p>
            )}
          </div>
        )}

        {/* Wizard Navigation Footer */}
        <div className="mt-8 pt-5 border-t border-subtle flex items-center justify-between">
          <button
            type="button"
            id="btn-wizard-prev"
            onClick={handlePrevStep}
            className={`${
              wizardStep === 1 ? 'invisible' : ''
            } text-xs font-medium text-muted hover:text-charcoal transition-colors px-3 py-2 rounded-lg`}
          >
            Kembali
          </button>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              id="btn-wizard-next"
              onClick={handleNextStep}
              className="inline-flex items-center space-x-2 bg-charcoal text-canvas px-5 py-2.5 rounded-xl text-xs font-medium hover:bg-charcoal/90 transition-all shadow-sm active:scale-95"
            >
              <span id="wizard-next-label">
                {wizardStep === 3 ? 'Mulai Wawancara' : 'Lanjutkan'}
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
