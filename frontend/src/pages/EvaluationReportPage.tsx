import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient } from '../services/apiClient';
import type {
  HiringRecommendation,
  SessionReportResponse,
} from '../types/api.types';

const RECOMMENDATION_LABEL: Record<HiringRecommendation, string> = {
  STRONG_HIRE: 'Sangat Direkomendasikan',
  HIRE: 'Direkomendasikan',
  HOLD: 'Pertimbangkan Kembali',
  NO_HIRE: 'Belum Sesuai',
};

export const EvaluationReportPage: React.FC = () => {
  const { sessionId = '018f2a90-7c4b-7d00-8111-a2b3c4d5e6f7' } = useParams<{
    sessionId: string;
  }>();

  const [report, setReport] = useState<SessionReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlightedTurnId, setHighlightedTurnId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    apiClient
      .getSessionReport(sessionId)
      .then((res) => {
        if (mounted) setReport(res);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const handleJumpToTurn = (turnId: string) => {
    setHighlightedTurnId(turnId);
    const el = document.getElementById(`transcript-turn-${turnId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (loading || !report) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] bg-canvas text-charcoal flex items-center justify-center p-8">
        <div className="text-sm text-muted animate-pulse">
          Memuat Laporan Evaluasi Kandidat...
        </div>
      </div>
    );
  }

  const ev = report.evaluation_report;

  const recBadgeColor =
    ev?.hiring_recommendation === 'STRONG_HIRE' ||
    ev?.hiring_recommendation === 'HIRE'
      ? 'bg-accentsoft border-accent/30 text-accent'
      : ev?.hiring_recommendation === 'HOLD'
        ? 'bg-warning/15 border-warning/30 text-warning'
        : 'bg-danger/15 border-danger/30 text-danger';

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-canvas text-charcoal py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Top Breadcrumb & Candidate Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-subtle pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted mb-1">
              <Link to="/recruiter" className="hover:text-charcoal font-medium">
                Daftar Sesi
              </Link>
              <span>/</span>
              <span>Laporan Evaluasi</span>
            </div>
            <h1 className="font-serif text-3xl text-charcoal">
              {report.candidate_name}
            </h1>
            <p className="text-sm text-muted mt-0.5">
              {report.job_title} • {report.company_name} ({report.seniority_level})
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/recruiter/setup"
              className="px-4 py-2 rounded-xl bg-charcoal hover:bg-accent text-xs font-semibold text-canvas transition"
            >
              + Buat Sesi Baru
            </Link>
          </div>
        </div>

        {ev && (
          <>
            {/* Executive Summary & Overall Weighted Score Card */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-4 rounded-2xl bg-surface/70 border border-subtle p-6 flex flex-col justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                    Skor Akhir Kompetensi
                  </span>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="font-serif text-5xl font-bold text-charcoal">
                      {ev.overall_weighted_score.toFixed(2)}
                    </span>
                    <span className="text-lg text-muted font-medium">
                      / 5.00
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${recBadgeColor}`}
                    >
                      {RECOMMENDATION_LABEL[ev.hiring_recommendation]}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-canvas text-muted border border-subtle">
                      Keyakinan: {ev.confidence_level}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-subtle text-xs text-muted flex items-center justify-between">
                  <span>
                    Durasi Sesi: {Math.round(report.duration_seconds / 60)} menit
                  </span>
                  <span>Status: {report.status}</span>
                </div>
              </div>

              <div className="lg:col-span-8 rounded-2xl bg-surface/70 border border-subtle p-6 space-y-4">
                <div>
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-accent">
                    Ringkasan Eksekutif
                  </h2>
                  <p className="text-sm text-charcoal leading-relaxed mt-2">
                    {ev.executive_summary}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-canvas border border-subtle">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-charcoal">
                    Verifikasi Kesesuaian CV & Jawaban Wawancara
                  </h3>
                  <p className="text-xs text-muted leading-relaxed mt-1">
                    {ev.cv_verification_notes}
                  </p>
                </div>
              </div>
            </div>

            {/* Strengths, Areas for Improvement, Red Flags */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl bg-accentsoft/60 border border-accent/20 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-accent mb-3">
                  Keunggulan Utama
                </h3>
                <ul className="space-y-2 text-xs text-charcoal">
                  {ev.strengths.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-accent font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-warning/10 border border-warning/25 p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-warning mb-3">
                  Area Pengembangan
                </h3>
                <ul className="space-y-2 text-xs text-charcoal">
                  {ev.areas_for_improvement.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-warning font-bold">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl bg-surface/70 border border-subtle p-5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-danger mb-3">
                  Catatan Risiko / Red Flags
                </h3>
                {ev.red_flags_detected.length === 0 ? (
                  <p className="text-xs text-accent font-medium">
                    Tidak ditemukan indikasi ketidaksesuaian selama sesi wawancara.
                  </p>
                ) : (
                  <ul className="space-y-2 text-xs text-danger">
                    {ev.red_flags_detected.map((flag, idx) => (
                      <li key={idx}>• {flag}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Split View: Competency Rubric Breakdown + Interactive Verbatim Transcript */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left 7 Cols: Competency Breakdown Cards with Evidence Links */}
              <div className="lg:col-span-7 space-y-4">
                <h2 className="font-serif text-xl text-charcoal">
                  Rincian Skor per Kompetensi
                </h2>

                {ev.competency_scores.map((comp) => (
                  <div
                    key={comp.competency_id}
                    className="rounded-2xl bg-surface/70 border border-subtle p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold text-charcoal">
                          {comp.competency_name}
                        </h3>
                        <span className="text-xs text-muted">
                          Bobot Penilaian: {comp.weight_percentage}%
                        </span>
                      </div>

                      <div className="px-3 py-1 rounded-xl bg-accentsoft border border-accent/25 text-accent font-bold text-sm">
                        {comp.score} / 5
                      </div>
                    </div>

                    {/* Score Bar */}
                    <div className="w-full h-2 rounded-full bg-subtle overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full"
                        style={{ width: `${(comp.score / 5) * 100}%` }}
                      />
                    </div>

                    <p className="text-xs text-charcoal leading-relaxed">
                      {comp.rationale}
                    </p>

                    {comp.supporting_quotes.length > 0 && (
                      <div className="pt-2 space-y-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                          Kutipan Bukti Jawaban (Klik untuk menyorot transkrip):
                        </span>
                        {comp.supporting_quotes.map((sq, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleJumpToTurn(sq.turn_id)}
                            className="w-full text-left p-3 rounded-xl bg-canvas hover:bg-accentsoft/50 border border-subtle hover:border-accent/40 transition group"
                          >
                            <div className="flex items-center justify-between text-[11px] text-accent font-medium mb-1">
                              <span>Detik ke-{sq.timestamp_sec}</span>
                              <span className="group-hover:underline">
                                Lihat di transkrip →
                              </span>
                            </div>
                            <p className="text-xs italic text-charcoal">
                              &ldquo;{sq.quote}&rdquo;
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Right 5 Cols: Full Verbatim Session Transcript */}
              <div className="lg:col-span-5 flex flex-col">
                <h2 className="font-serif text-xl text-charcoal mb-4">
                  Transkrip Lengkap ({report.transcript.length} Percakapan)
                </h2>

                <div className="rounded-2xl bg-surface/60 border border-subtle p-4 space-y-3 max-h-[780px] overflow-y-auto">
                  {report.transcript.map((turn) => {
                    const isHighlighted = highlightedTurnId === turn.turn_id;
                    const isAi = turn.speaker === 'AI';
                    return (
                      <div
                        key={turn.turn_id}
                        id={`transcript-turn-${turn.turn_id}`}
                        className={`p-3.5 rounded-xl border transition ${
                          isHighlighted
                            ? 'bg-accentsoft border-accent ring-2 ring-accent/30'
                            : isAi
                              ? 'bg-canvas border-subtle'
                              : 'bg-surface border-subtle'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span
                            className={`font-semibold ${
                              isAi ? 'text-accent' : 'text-charcoal'
                            }`}
                          >
                            {isAi
                              ? 'Alya (Pewawancara AI)'
                              : `${report.candidate_name} (Kandidat)`}
                          </span>
                        </div>
                        <p className="text-xs text-charcoal leading-relaxed">
                          {turn.text_content}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
