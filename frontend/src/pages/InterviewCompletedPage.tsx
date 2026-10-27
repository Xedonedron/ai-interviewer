import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiClient } from '../services/apiClient';
import { useInterviewStore } from '../store/useInterviewStore';

export const InterviewCompletedPage: React.FC = () => {
  const { sessionId = '018f2a90-7c4b-7d00-8111-a2b3c4d5e6f7' } = useParams<{
    sessionId: string;
  }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? undefined;
  const elapsedParam = Number(searchParams.get('elapsed') ?? 0);

  const { sessionMetadata, setSessionMetadata } = useInterviewStore();
  const [rating, setRating] = useState<number>(0);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient
      .getCandidateSessionMetadata(sessionId, token)
      .then((res) => {
        if (active) setSessionMetadata(res);
      })
      .catch(() => {
        // Fallback to default fixture in store
      });
    return () => {
      active = false;
    };
  }, [sessionId, token, setSessionMetadata]);

  const candidateFullName =
    sessionMetadata?.candidate_name || 'Nixon Daniel';
  const firstName = candidateFullName.split(' ')[0] || 'Kandidat';
  const jobTitle =
    sessionMetadata?.job_title || 'Data Platform & AI Systems Engineer';

  const durationSeconds = elapsedParam > 0 ? elapsedParam : 480;
  const formattedDuration = `${String(Math.floor(durationSeconds / 60)).padStart(
    2,
    '0',
  )}:${String(durationSeconds % 60).padStart(2, '0')} Menit`;

  const handleSelectRating = async (selectedStar: number) => {
    setRating(selectedStar);
    try {
      await apiClient.completeSession(
        sessionId,
        {
          reason: 'completed_normally',
          candidate_csat_rating: selectedStar,
        },
        token,
      );
    } catch {
      // Session may already be marked EVALUATING/COMPLETED via WebSocket end_session
    } finally {
      setSubmitted(true);
    }
  };

  return (
    <section className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto bg-canvas text-charcoal min-h-[calc(100vh-3.5rem)]">
      <div className="max-w-lg w-full text-center space-y-6">
        <div className="w-16 h-16 rounded-full bg-accentsoft text-accent flex items-center justify-center mx-auto border border-accent/20">
          <svg
            className="w-8 h-8"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="font-serif text-3xl text-charcoal">
            Wawancara Telah Selesai
          </h1>
          <p className="text-muted text-sm leading-relaxed">
            Terima kasih,{' '}
            <span className="font-semibold text-charcoal">{firstName}</span>.
            Transkrip dan telemetri suara Anda telah diamankan dan sedang
            dievaluasi secara objektif oleh sistem penilaian kami.
          </p>
        </div>

        <div className="bg-surface/70 border border-subtle rounded-2xl p-6 text-left space-y-4">
          <div className="flex items-center justify-between text-xs border-b border-subtle pb-3">
            <span className="text-muted">Durasi Percakapan</span>
            <span className="font-semibold text-charcoal tabular-nums">
              {formattedDuration}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs border-b border-subtle pb-3">
            <span className="text-muted">Posisi Terdaftar</span>
            <span className="font-semibold text-charcoal">{jobTitle}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted">Status Evaluasi Asesmen</span>
            <span className="inline-flex items-center gap-1.5 text-accent font-semibold bg-accentsoft px-2.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              Memproses Skor Rubrik
            </span>
          </div>
        </div>

        <div className="bg-canvas border border-subtle rounded-2xl p-5 space-y-3">
          <p className="text-xs font-semibold text-charcoal">
            Bagaimana pengalaman interaksi Anda dengan AI?
          </p>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((star) => {
              const active = rating >= star;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => void handleSelectRating(star)}
                  className={`w-10 h-10 rounded-xl border transition-colors font-semibold text-sm ${
                    active
                      ? 'bg-accent text-canvas border-accent'
                      : 'border-subtle hover:bg-accent hover:text-canvas hover:border-accent text-charcoal'
                  }`}
                >
                  {star} ★
                </button>
              );
            })}
          </div>
          {submitted && (
            <p className="text-xs text-accent font-medium">
              Terima kasih atas penilaian Anda!
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            navigate(
              `/interview/${sessionId}/lobby${
                token ? `?token=${encodeURIComponent(token)}` : ''
              }`,
            )
          }
          className="text-xs font-semibold text-muted hover:text-charcoal underline underline-offset-4"
        >
          Kembali ke Halaman Awal
        </button>
      </div>
    </section>
  );
};
