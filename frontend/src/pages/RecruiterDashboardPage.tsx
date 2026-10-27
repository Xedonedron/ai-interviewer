import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Play,
  PlusCircle,
  Users,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import type {
  HiringRecommendation,
  SessionListItemDto,
  SessionStatus,
} from '../types/api.types';

const STATUS_BADGE: Record<SessionStatus, string> = {
  READY: 'bg-surface text-charcoal border-subtle',
  IN_PROGRESS: 'bg-accentsoft text-accent border-accent/25',
  RECONNECTING: 'bg-warning/10 text-warning border-warning/30',
  EVALUATING: 'bg-accentsoft text-accent border-accent/25',
  COMPLETED: 'bg-accentsoft text-accent border-accent/30',
  FAILED: 'bg-danger/10 text-danger border-danger/30',
  EXPIRED: 'bg-surface text-stonehint border-subtle',
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  READY: 'Siap Dimulai',
  IN_PROGRESS: 'Sedang Berlangsung',
  RECONNECTING: 'Menyambung Ulang',
  EVALUATING: 'Sedang Dievaluasi',
  COMPLETED: 'Selesai',
  FAILED: 'Terhenti',
  EXPIRED: 'Kedaluwarsa',
};

const RECOMMENDATION_BADGE: Record<HiringRecommendation, string> = {
  STRONG_HIRE: 'bg-accent text-canvas border-accent',
  HIRE: 'bg-accentsoft text-accent border-accent/30',
  HOLD: 'bg-warning/15 text-warning border-warning/30',
  NO_HIRE: 'bg-danger/15 text-danger border-danger/30',
};

const RECOMMENDATION_LABEL: Record<HiringRecommendation, string> = {
  STRONG_HIRE: 'Sangat Direkomendasikan',
  HIRE: 'Direkomendasikan',
  HOLD: 'Pertimbangkan Kembali',
  NO_HIRE: 'Belum Sesuai',
};

export const RecruiterDashboardPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionListItemDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiClient
      .listSessions(
        statusFilter === 'ALL' ? undefined : { status: statusFilter },
      )
      .then((res) => {
        if (active) {
          setSessions(res.items);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [statusFilter]);

  const completedCount = sessions.filter((s) => s.status === 'COMPLETED').length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="mb-8 flex flex-col justify-between gap-4 rounded-2xl border border-subtle bg-surface/70 p-6 sm:flex-row sm:items-center">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-accent">
            Panel Rekruter
          </span>
          <h1 className="mt-1 font-serif text-3xl text-charcoal">
            Daftar Sesi Wawancara Kandidat
          </h1>
          <p className="mt-1 text-sm text-muted">
            Kelola jadwal wawancara kandidat, bagikan tautan sesi, dan tinjau hasil evaluasi kompetensi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/recruiter/setup"
            className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-5 py-2.5 text-sm font-semibold text-canvas shadow-sm transition hover:bg-accent"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Buat Sesi Baru</span>
          </Link>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-subtle bg-surface/60 p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Total Sesi Terdaftar
            </span>
            <Users className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-serif text-3xl text-charcoal">
            {sessions.length}
          </p>
          <p className="mt-1 text-xs text-muted">
            Seluruh jadwal wawancara aktif dan selesai
          </p>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface/60 p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Wawancara Selesai
            </span>
            <CheckCircle2 className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-serif text-3xl text-charcoal">
            {completedCount}
          </p>
          <p className="mt-1 text-xs text-muted">
            Laporan evaluasi dan transkrip siap ditinjau
          </p>
        </div>

        <div className="rounded-2xl border border-subtle bg-surface/60 p-5">
          <div className="flex items-center justify-between text-muted">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Rata-Rata Skor Kandidat
            </span>
            <Award className="h-4 w-4 text-accent" />
          </div>
          <p className="mt-2 font-serif text-3xl text-charcoal">4.25 / 5.0</p>
          <p className="mt-1 text-xs text-muted">
            Berdasarkan rubrik penilaian kompetensi posisi
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(['ALL', 'READY', 'IN_PROGRESS', 'COMPLETED'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                statusFilter === st
                  ? 'bg-charcoal text-canvas'
                  : 'border border-subtle bg-surface/60 text-muted hover:text-charcoal'
              }`}
            >
              {st === 'ALL' ? 'Semua Status' : STATUS_LABEL[st]}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          Menampilkan {sessions.length} sesi wawancara
        </span>
      </div>

      {/* Sessions Table */}
      <div className="overflow-hidden rounded-2xl border border-subtle bg-surface/50 shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-sm text-muted">
            Memuat daftar sesi wawancara...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted">
            Tidak ada sesi wawancara dengan status tersebut.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-subtle bg-surface text-xs uppercase text-muted">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Kandidat</th>
                  <th className="px-5 py-3.5 font-semibold">Posisi & Level</th>
                  <th className="px-5 py-3.5 font-semibold">Status</th>
                  <th className="px-5 py-3.5 font-semibold">Durasi</th>
                  <th className="px-5 py-3.5 font-semibold">Hasil Evaluasi</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle bg-canvas/60">
                {sessions.map((item) => (
                  <tr
                    key={item.session_id}
                    className="transition hover:bg-surface/60"
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-charcoal">
                        {item.candidate_name}
                      </div>
                      <div className="text-xs text-muted">
                        {item.candidate_email}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-medium text-charcoal">
                        {item.job_title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                        <span>{item.company_name}</span>
                        <span>•</span>
                        <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-medium text-charcoal border border-subtle">
                          {item.seniority_level}
                        </span>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[item.status]
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3" />
                        {STATUS_LABEL[item.status]}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-xs text-charcoal">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-muted" />
                        <span>{item.duration_minutes} menit</span>
                      </div>
                      {item.duration_seconds > 0 && (
                        <div className="mt-0.5 text-muted">
                          Aktual: {Math.floor(item.duration_seconds / 60)}m{' '}
                          {item.duration_seconds % 60}d
                        </div>
                      )}
                    </td>

                    <td className="px-5 py-4">
                      {item.overall_weighted_score !== null &&
                      item.hiring_recommendation ? (
                        <div className="flex items-center gap-2.5">
                          <span className="font-serif text-lg font-bold text-charcoal">
                            {item.overall_weighted_score.toFixed(2)}
                          </span>
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${
                              RECOMMENDATION_BADGE[item.hiring_recommendation]
                            }`}
                          >
                            {RECOMMENDATION_LABEL[item.hiring_recommendation]}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs italic text-stonehint">
                          Belum dievaluasi
                        </span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/interview/${item.session_id}/lobby`}
                          className="inline-flex items-center gap-1 rounded-xl border border-subtle bg-surface px-3 py-1.5 text-xs font-semibold text-charcoal transition hover:bg-subtle/60"
                          title="Buka Persiapan Kandidat"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Lobby</span>
                        </Link>

                        <Link
                          to={`/interview/${item.session_id}/room`}
                          className="inline-flex items-center gap-1 rounded-xl border border-subtle bg-canvas px-3 py-1.5 text-xs font-semibold text-charcoal transition hover:bg-surface"
                          title="Buka Ruang Wawancara"
                        >
                          <Play className="h-3.5 w-3.5" />
                          <span>Ruang Wawancara</span>
                        </Link>

                        <Link
                          to={`/recruiter/sessions/${item.session_id}/report`}
                          className="inline-flex items-center gap-1 rounded-xl bg-accentsoft border border-accent/20 px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent hover:text-canvas"
                          title="Lihat Laporan Evaluasi"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Laporan</span>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
