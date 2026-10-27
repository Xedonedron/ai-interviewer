import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import { INITIAL_CREATE_SESSION_TEMPLATE } from '../services/simulator/mockFixtures';
import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GeminiVoiceName,
  InterviewLanguage,
  RubricCriterionDto,
  SeniorityLevel,
} from '../types/api.types';

export const RecruiterSetupPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState<CreateSessionRequest>(() =>
    structuredClone(INITIAL_CREATE_SESSION_TEMPLATE),
  );
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdSession, setCreatedSession] =
    useState<CreateSessionResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const totalWeight = form.job.rubric_config.criteria.reduce(
    (sum, item) => sum + Number(item.weight_percentage || 0),
    0,
  );

  const updateCriterion = (
    idx: number,
    patch: Partial<RubricCriterionDto>,
  ): void => {
    setForm((prev) => {
      const nextCriteria = [...prev.job.rubric_config.criteria];
      nextCriteria[idx] = { ...nextCriteria[idx], ...patch };
      return {
        ...prev,
        job: {
          ...prev.job,
          rubric_config: {
            ...prev.job.rubric_config,
            criteria: nextCriteria,
          },
        },
      };
    });
  };

  const addCriterion = (): void => {
    setForm((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        rubric_config: {
          ...prev.job.rubric_config,
          criteria: [
            ...prev.job.rubric_config.criteria,
            {
              competency_id: `comp_custom_${prev.job.rubric_config.criteria.length + 1}`,
              competency_name: 'Kompetensi Tambahan',
              weight_percentage: 10,
              probing_guidance:
                'Gali pengalaman nyata kandidat menggunakan metode STAR.',
              positive_signals: ['Jawaban terstruktur dengan contoh konkret'],
              red_flag_signals: ['Tidak dapat menjelaskan kontribusi langsung'],
            },
          ],
        },
      },
    }));
  };

  const removeCriterion = (idx: number): void => {
    if (form.job.rubric_config.criteria.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      job: {
        ...prev.job,
        rubric_config: {
          ...prev.job.rubric_config,
          criteria: prev.job.rubric_config.criteria.filter((_, i) => i !== idx),
        },
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (totalWeight !== 100) {
      setErrorMsg(
        `Total bobot kriteria wajib berjumlah tepat 100% (saat ini: ${totalWeight}%).`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiClient.createSession(form);
      setCreatedSession(response);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal membuat sesi wawancara.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyUrl = () => {
    if (!createdSession) return;
    void navigator.clipboard?.writeText(
      `${window.location.origin}${createdSession.candidate_join_url}`,
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <Link
          to="/recruiter"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-charcoal"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Kembali ke Daftar Sesi</span>
        </Link>
      </div>

      <div className="mb-8">
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          Persiapan Wawancara
        </span>
        <h1 className="mt-1 font-serif text-3xl text-charcoal">
          Buat Sesi Wawancara Baru
        </h1>
        <p className="mt-1 text-sm text-muted">
          Lengkapi profil kandidat, deskripsi posisi pekerjaan, dan bobot kriteria penilaian kompetensi.
        </p>
      </div>

      {createdSession && (
        <div className="mb-8 rounded-2xl border border-accent/30 bg-accentsoft p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-accent" />
            <div className="flex-1">
              <h2 className="font-serif text-xl text-charcoal">
                Sesi Wawancara Berhasil Dibuat
              </h2>
              <p className="mt-1 text-xs text-muted">
                Bagikan tautan undangan berikut kepada kandidat untuk memulai pemeriksaan perangkat dan sesi wawancara.
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  readOnly
                  value={createdSession.candidate_join_url}
                  className="flex-1 rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-xs text-charcoal"
                />
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-subtle bg-surface px-4 py-2.5 text-xs font-semibold text-charcoal hover:bg-subtle/70"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>{copied ? 'Tautan Tersalin' : 'Salin Tautan'}</span>
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => navigate(createdSession.candidate_join_url)}
                  className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-4 py-2.5 text-xs font-semibold text-canvas hover:bg-accent"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span>Buka Halaman Persiapan Kandidat</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle className="h-5 w-5 shrink-0 text-danger" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Candidate Profile & CV */}
        <div className="rounded-2xl border border-subtle bg-surface/60 p-6">
          <h2 className="mb-4 font-serif text-xl text-charcoal">
            1. Profil Kandidat & Ringkasan CV
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Nama Lengkap Kandidat
              </label>
              <input
                type="text"
                required
                value={form.candidate.full_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    candidate: { ...form.candidate, full_name: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Alamat Email Kandidat
              </label>
              <input
                type="email"
                required
                value={form.candidate.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    candidate: { ...form.candidate, email: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-charcoal">
              Ringkasan Pengalaman & CV Kandidat
            </label>
            <textarea
              rows={4}
              required
              value={form.candidate.cv_text}
              onChange={(e) =>
                setForm({
                  ...form,
                  candidate: { ...form.candidate, cv_text: e.target.value },
                })
              }
              className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Section 2: Job Position */}
        <div className="rounded-2xl border border-subtle bg-surface/60 p-6">
          <h2 className="mb-4 font-serif text-xl text-charcoal">
            2. Informasi Posisi Pekerjaan
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Nama Posisi
              </label>
              <input
                type="text"
                required
                value={form.job.title}
                onChange={(e) =>
                  setForm({
                    ...form,
                    job: { ...form.job, title: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Nama Perusahaan / Unit
              </label>
              <input
                type="text"
                required
                value={form.job.company_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    job: { ...form.job, company_name: e.target.value },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Tingkat Senioritas
              </label>
              <select
                value={form.job.seniority_level}
                onChange={(e) =>
                  setForm({
                    ...form,
                    job: {
                      ...form.job,
                      seniority_level: e.target.value as SeniorityLevel,
                    },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              >
                {(['JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL'] as const).map(
                  (lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl}
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-semibold text-charcoal">
              Deskripsi Pekerjaan & Tanggung Jawab Utama
            </label>
            <textarea
              rows={3}
              required
              value={form.job.job_description}
              onChange={(e) =>
                setForm({
                  ...form,
                  job: { ...form.job, job_description: e.target.value },
                })
              }
              className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Section 3: Competency Rubric Builder */}
        <div className="rounded-2xl border border-subtle bg-surface/60 p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-xl text-charcoal">
                3. Kriteria Penilaian Kompetensi
              </h2>
              <p className="text-xs text-muted">
                Total bobot seluruh kriteria penilaian wajib berjumlah tepat 100%.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold border ${
                  totalWeight === 100
                    ? 'bg-accentsoft text-accent border-accent/25'
                    : 'bg-danger/10 text-danger border-danger/25'
                }`}
              >
                Total Bobot: {totalWeight}% / 100%
              </span>
              <button
                type="button"
                onClick={addCriterion}
                className="inline-flex items-center gap-1 rounded-xl border border-subtle bg-canvas px-3 py-1.5 text-xs font-semibold text-charcoal hover:bg-surface"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah Kriteria</span>
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {form.job.rubric_config.criteria.map((crit, index) => (
              <div
                key={index}
                className="rounded-xl border border-subtle bg-canvas p-4"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-8">
                    <label className="mb-1 block text-xs font-semibold text-charcoal">
                      Nama Kompetensi
                    </label>
                    <input
                      type="text"
                      value={crit.competency_name}
                      onChange={(e) =>
                        updateCriterion(index, {
                          competency_name: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-subtle bg-surface/40 px-3 py-2 text-xs text-charcoal focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="mb-1 block text-xs font-semibold text-charcoal">
                      Bobot (%)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={crit.weight_percentage}
                      onChange={(e) =>
                        updateCriterion(index, {
                          weight_percentage: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-subtle bg-surface/40 px-3 py-2 text-xs font-semibold text-charcoal focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end justify-end sm:col-span-1">
                    <button
                      type="button"
                      onClick={() => removeCriterion(index)}
                      className="rounded-lg p-2 text-muted hover:bg-danger/10 hover:text-danger"
                      title="Hapus kriteria"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-muted">
                    Fokus Pertanyaan Pendalaman
                  </label>
                  <input
                    type="text"
                    value={crit.probing_guidance}
                    onChange={(e) =>
                      updateCriterion(index, {
                        probing_guidance: e.target.value,
                      })
                    }
                    className="w-full rounded-lg border border-subtle bg-surface/40 px-3 py-2 text-xs text-charcoal focus:border-accent focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Section 4: Interviewer & Session Settings */}
        <div className="rounded-2xl border border-subtle bg-surface/60 p-6">
          <h2 className="mb-4 font-serif text-xl text-charcoal">
            4. Pengaturan Sesi & Pewawancara
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Nama Pewawancara AI
              </label>
              <input
                type="text"
                value={form.session_config.interviewer_persona_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    session_config: {
                      ...form.session_config,
                      interviewer_persona_name: e.target.value,
                    },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Karakter Suara
              </label>
              <select
                value={form.session_config.voice_name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    session_config: {
                      ...form.session_config,
                      voice_name: e.target.value as GeminiVoiceName,
                    },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              >
                {(['Aoede', 'Kore', 'Puck', 'Charon', 'Fenrir'] as const).map(
                  (v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Bahasa Wawancara
              </label>
              <select
                value={form.session_config.language}
                onChange={(e) =>
                  setForm({
                    ...form,
                    session_config: {
                      ...form.session_config,
                      language: e.target.value as InterviewLanguage,
                    },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              >
                <option value="id-ID">Bahasa Indonesia</option>
                <option value="en-US">English</option>
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-charcoal">
                Durasi Sesi (Menit)
              </label>
              <input
                type="number"
                min={10}
                max={90}
                value={form.session_config.duration_minutes}
                onChange={(e) =>
                  setForm({
                    ...form,
                    session_config: {
                      ...form.session_config,
                      duration_minutes: Number(e.target.value),
                    },
                  })
                }
                className="w-full rounded-xl border border-subtle bg-canvas px-3.5 py-2.5 text-sm text-charcoal focus:border-accent focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-charcoal px-6 py-3 text-sm font-semibold text-canvas shadow-sm transition hover:bg-accent disabled:opacity-50"
          >
            <span>
              {submitting
                ? 'Menyimpan Sesi...'
                : 'Simpan & Buat Tautan Wawancara'}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
